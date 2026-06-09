import { z } from "zod";
import {
  shouldTriggerHarnessUpdate,
  type HarnessTriggerDecision,
} from "@/core/evidence";
import { askStructured, isInitialized, type AskOptions } from "@/core/llm";
import type { EvidenceRepository } from "@/db/evidenceRepo";
import type { PortraitRepository, PortraitVersionRecord } from "@/db/portraitRepo";
import type { HarnessTriggerPolicy } from "@/config";
import { DIMENSION_META } from "@/types/dimensions";
import type { Evidence, NewEvidence } from "@/types/evidence";
import {
  dimensionValueSchema,
  MASTER_DIMENSION_KEYS,
  portraitSchema,
  SUB_DIMENSION_KEYS,
  type DimensionKey,
  type Portrait,
  type PortraitScope,
} from "@/types/portrait";

/**
 * harness 引擎：主/子画像生成、局部重评估、版本管理（计划 §4/§5）。
 *
 * 本模块保持 core 纯逻辑可单测：LLM 调用通过 HarnessModel 注入；
 * 默认实现才会接入 core/llm 的 askStructured。
 */

export const portraitPatchSchema = z.object({
  confidence: z.number().min(0).max(1).optional(),
  dimensions: z.record(z.string(), dimensionValueSchema),
  nextFocus: z.string().optional(),
  changeSummary: z.string(),
});
export type PortraitPatch = z.infer<typeof portraitPatchSchema>;

export interface HarnessModel {
  askStructured<T>(schema: z.ZodType<T>, opts: AskOptions): Promise<T>;
}

const defaultModel: HarnessModel = { askStructured };

export interface GeneratePortraitInput {
  scope: PortraitScope;
  domain: string;
  evidence: Evidence[];
  now?: () => string;
  model?: HarnessModel;
}

export interface ReevaluatePortraitInput {
  previous: Portrait;
  evidence: Evidence[];
  touchedDimensions?: DimensionKey[];
  now?: () => string;
  model?: HarnessModel;
}

export interface MergePortraitPatchOptions {
  touchedDimensions: DimensionKey[];
  now?: () => string;
}

export interface HarnessRunRepositories {
  portraits: PortraitRepository;
  evidence: EvidenceRepository;
}

export interface RunHarnessUpdateInput {
  scope: PortraitScope;
  domain: string;
  repositories: HarnessRunRepositories;
  evidenceLimit?: number;
  now?: () => string;
  model?: HarnessModel;
}

export interface RunHarnessUpdateIfTriggeredInput extends RunHarnessUpdateInput {
  policy?: HarnessTriggerPolicy;
  canRunModel?: () => boolean;
}

export interface RecordEvidenceAndMaybeUpdateInput
  extends RunHarnessUpdateIfTriggeredInput {
  evidence: NewEvidence;
}

export type HarnessUpdateResult =
  | {
      status: "skipped";
      reason: "no_unconsumed_evidence";
      latest: PortraitVersionRecord | null;
      consumedEvidenceIds: [];
    }
  | {
      status: "updated";
      portrait: Portrait;
      record: PortraitVersionRecord;
      consumedEvidenceIds: number[];
      consumedCount: number;
    };

export type TriggeredHarnessUpdateResult =
  | {
      status: "skipped";
      reason: "trigger_not_met";
      trigger: HarnessTriggerDecision;
      latest: PortraitVersionRecord | null;
      consumedEvidenceIds: [];
    }
  | {
      status: "deferred";
      reason: "model_not_initialized";
      trigger: Extract<HarnessTriggerDecision, { shouldRun: true }>;
      latest: PortraitVersionRecord | null;
      consumedEvidenceIds: [];
    }
  | {
      status: "updated";
      trigger: Extract<HarnessTriggerDecision, { shouldRun: true }>;
      portrait: Portrait;
      record: PortraitVersionRecord;
      consumedEvidenceIds: number[];
      consumedCount: number;
    };

export interface RecordEvidenceAndMaybeUpdateResult {
  evidence: Evidence;
  update: TriggeredHarnessUpdateResult;
}

const DEFAULT_NOW = () => new Date().toISOString();

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function canRunHarnessModel(input: RunHarnessUpdateIfTriggeredInput): boolean {
  if (input.canRunModel) {
    return input.canRunModel();
  }
  return Boolean(input.model) || isInitialized();
}

function dimensionSetForScope(scope: PortraitScope): Set<DimensionKey> {
  return new Set(scope === "global" ? MASTER_DIMENSION_KEYS : SUB_DIMENSION_KEYS);
}

export function dimensionKeysForScope(scope: PortraitScope): DimensionKey[] {
  return scope === "global" ? [...MASTER_DIMENSION_KEYS] : [...SUB_DIMENSION_KEYS];
}

function assertDomainMatchesScope(scope: PortraitScope, domain: string): void {
  if (scope === "global" && domain !== "global") {
    throw new Error("主画像 scope=global 时 domain 必须为 global");
  }
  if (scope === "domain" && domain === "global") {
    throw new Error("子画像 scope=domain 时 domain 不能为 global");
  }
}

function assertAllowedDimensions(
  dimensions: Record<string, unknown>,
  allowed: Set<DimensionKey>,
  context: string,
): void {
  const illegal = Object.keys(dimensions).filter((key) => !allowed.has(key as DimensionKey));
  if (illegal.length > 0) {
    throw new Error(`${context} 包含不允许的画像维度: ${illegal.join(", ")}`);
  }
}

export function validatePortraitForScope(portrait: Portrait): void {
  assertDomainMatchesScope(portrait.scope, portrait.domain);
  assertAllowedDimensions(
    portrait.dimensions,
    dimensionSetForScope(portrait.scope),
    "画像",
  );
}

function normalizeInitialPortrait(
  candidate: Portrait,
  input: GeneratePortraitInput,
): Portrait {
  const now = input.now ?? DEFAULT_NOW;
  const normalized: Portrait = {
    ...candidate,
    scope: input.scope,
    domain: input.domain,
    portraitVersion: 1,
    updatedAt: now(),
  };
  validatePortraitForScope(normalized);
  return portraitSchema.parse(normalized);
}

function evidenceIds(evidence: Evidence[]): number[] {
  return evidence.flatMap((item) => (typeof item.id === "number" ? [item.id] : []));
}

function summarizeEvidence(evidence: Evidence[]): string {
  return evidence
    .map((item) => {
      const id = typeof item.id === "number" ? `#${item.id}` : "#new";
      return `${id} ${item.type} ${item.createdAt}: ${item.summary}`;
    })
    .join("\n");
}

function dimensionLine(key: DimensionKey): string {
  const meta = DIMENSION_META[key];
  return `- ${key}（${meta.label}，${meta.tier}，${meta.groups.join("/")}）`;
}

export function buildInitialPortraitPrompt(scope: PortraitScope): string {
  const layer = scope === "global" ? "主 harness / 跨领域人格层" : "子 harness / 领域层";
  const dimensions = dimensionKeysForScope(scope).map(dimensionLine).join("\n");
  return [
    `你是 BanLea 的${layer}画像评估器。`,
    "任务：基于证据生成一份结构化学习画像。",
    "要求：只输出当前层允许的维度；每个维度必须有 summary、confidence、evidenceIds；数值维度 score 限定 0~1。",
    "低证据维度必须降低 confidence，不能把猜测写成确定结论。",
    `允许维度：\n${dimensions}`,
  ].join("\n\n");
}

export function buildReevaluationPrompt(
  scope: PortraitScope,
  touchedDimensions: DimensionKey[],
): string {
  const layer = scope === "global" ? "主 harness" : "子 harness";
  const dimensions = touchedDimensions.map(dimensionLine).join("\n");
  return [
    `你是 BanLea 的${layer}局部重评估器。`,
    "任务：基于旧画像和新证据，只返回被证据触及维度的 patch。",
    "要求：不要重写未触及维度；changeSummary 必须说明哪些维度改变以及原因；evidenceIds 只引用支撑该维度的新旧证据 id。",
    `本次允许更新维度：\n${dimensions}`,
  ].join("\n\n");
}

export function inferTouchedDimensions(
  evidence: Evidence[],
  scope: PortraitScope,
): DimensionKey[] {
  const allowed = dimensionSetForScope(scope);
  const inferred = evidence.flatMap<DimensionKey>((item) => {
    switch (item.type) {
      case "chat":
        return scope === "global"
          ? ["preferred_modality", "communication_style", "pace", "depth_preference"]
          : ["interest", "progress", "gaps", "resource_preference"];
      case "self_report":
        return scope === "global"
          ? ["motivation", "goal_orientation", "time_pattern", "preferred_modality"]
          : ["mastery", "interest", "gaps", "resource_preference"];
      case "quiz":
        return scope === "global"
          ? ["metacognition", "resilience", "retention"]
          : ["mastery", "gaps", "misconceptions", "application", "rigor", "velocity"];
      case "reading":
        return scope === "global"
          ? ["focus_persistence", "retention", "preferred_modality"]
          : ["progress", "interest", "resource_preference", "velocity"];
      case "reco_click":
        return scope === "global" ? ["curiosity_breadth", "motivation"] : ["interest"];
      case "reco_skip":
        return scope === "global"
          ? ["curiosity_breadth"]
          : ["interest", "resource_preference"];
    }
  });

  return unique(inferred).filter((key) => allowed.has(key));
}

export function mergePortraitPatch(
  previous: Portrait,
  patch: PortraitPatch,
  options: MergePortraitPatchOptions,
): Portrait {
  validatePortraitForScope(previous);

  const allowedByScope = dimensionSetForScope(previous.scope);
  const touched = new Set(options.touchedDimensions);
  assertAllowedDimensions(patch.dimensions, allowedByScope, "画像 patch");
  assertAllowedDimensions(patch.dimensions, touched, "画像 patch");

  const now = options.now ?? DEFAULT_NOW;
  const merged: Portrait = {
    ...previous,
    portraitVersion: previous.portraitVersion + 1,
    updatedAt: now(),
    confidence: patch.confidence ?? previous.confidence,
    dimensions: {
      ...previous.dimensions,
      ...patch.dimensions,
    },
    nextFocus: patch.nextFocus ?? previous.nextFocus,
    changeSummary: patch.changeSummary,
  };

  validatePortraitForScope(merged);
  return portraitSchema.parse(merged);
}

export async function generateInitialPortrait(
  input: GeneratePortraitInput,
): Promise<Portrait> {
  assertDomainMatchesScope(input.scope, input.domain);
  const model = input.model ?? defaultModel;
  const portrait = await model.askStructured(portraitSchema, {
    tier: "deep",
    effort: "high",
    maxTokens: 12000,
    system: buildInitialPortraitPrompt(input.scope),
    messages: [
      {
        role: "user",
        content: [
          `scope: ${input.scope}`,
          `domain: ${input.domain}`,
          `evidence_ids: ${JSON.stringify(evidenceIds(input.evidence))}`,
          "evidence:",
          summarizeEvidence(input.evidence),
        ].join("\n"),
      },
    ],
  });
  return normalizeInitialPortrait(portrait, input);
}

export async function reevaluatePortrait(
  input: ReevaluatePortraitInput,
): Promise<Portrait> {
  validatePortraitForScope(input.previous);
  const touchedDimensions =
    input.touchedDimensions ?? inferTouchedDimensions(input.evidence, input.previous.scope);

  if (touchedDimensions.length === 0 || input.evidence.length === 0) {
    return input.previous;
  }

  const model = input.model ?? defaultModel;
  const patch = await model.askStructured(portraitPatchSchema, {
    tier: "deep",
    effort: "high",
    maxTokens: 8000,
    system: buildReevaluationPrompt(input.previous.scope, touchedDimensions),
    messages: [
      {
        role: "user",
        content: [
          "previous_portrait:",
          JSON.stringify(input.previous, null, 2),
          "",
          `new_evidence_ids: ${JSON.stringify(evidenceIds(input.evidence))}`,
          "new_evidence:",
          summarizeEvidence(input.evidence),
        ].join("\n"),
      },
    ],
  });

  return mergePortraitPatch(input.previous, patch, {
    touchedDimensions,
    now: input.now,
  });
}

export async function runHarnessUpdate(
  input: RunHarnessUpdateInput,
): Promise<HarnessUpdateResult> {
  assertDomainMatchesScope(input.scope, input.domain);

  const { portraits, evidence } = input.repositories;
  const latest = await portraits.getLatest(input.domain);
  const pendingEvidence = await evidence.listUnconsumed(
    input.domain,
    input.evidenceLimit,
  );

  if (pendingEvidence.length === 0) {
    return {
      status: "skipped",
      reason: "no_unconsumed_evidence",
      latest,
      consumedEvidenceIds: [],
    };
  }

  return applyHarnessUpdate({
    ...input,
    latest,
    pendingEvidence,
  });
}

async function applyHarnessUpdate(
  input: RunHarnessUpdateInput & {
    latest: PortraitVersionRecord | null;
    pendingEvidence: Evidence[];
  },
): Promise<Extract<HarnessUpdateResult, { status: "updated" }>> {
  const { portraits, evidence } = input.repositories;
  const { latest, pendingEvidence } = input;
  const portrait = latest
    ? await reevaluatePortrait({
        previous: latest.portrait,
        evidence: pendingEvidence,
        now: input.now,
        model: input.model,
      })
    : await generateInitialPortrait({
        scope: input.scope,
        domain: input.domain,
        evidence: pendingEvidence,
        now: input.now,
        model: input.model,
      });

  const record = await portraits.save(portrait);
  const consumedEvidenceIds = pendingEvidence.flatMap((item) =>
    typeof item.id === "number" ? [item.id] : [],
  );
  const consumedCount = await evidence.markConsumed(
    consumedEvidenceIds,
    portrait.portraitVersion,
  );

  return {
    status: "updated",
    portrait,
    record,
    consumedEvidenceIds,
    consumedCount,
  };
}

export async function runHarnessUpdateIfTriggered(
  input: RunHarnessUpdateIfTriggeredInput,
): Promise<TriggeredHarnessUpdateResult> {
  assertDomainMatchesScope(input.scope, input.domain);

  const { portraits, evidence } = input.repositories;
  const latest = await portraits.getLatest(input.domain);
  const pendingEvidence = await evidence.listUnconsumed(
    input.domain,
    input.evidenceLimit,
  );
  const trigger = shouldTriggerHarnessUpdate({
    latestPortrait: latest?.portrait ?? null,
    unconsumedEvidence: pendingEvidence,
    policy: input.policy,
  });

  if (!trigger.shouldRun) {
    return {
      status: "skipped",
      reason: "trigger_not_met",
      trigger,
      latest,
      consumedEvidenceIds: [],
    };
  }

  if (!canRunHarnessModel(input)) {
    return {
      status: "deferred",
      reason: "model_not_initialized",
      trigger,
      latest,
      consumedEvidenceIds: [],
    };
  }

  const result = await applyHarnessUpdate({
    ...input,
    latest,
    pendingEvidence,
  });

  return {
    ...result,
    trigger,
  };
}

export async function recordEvidenceAndMaybeUpdate(
  input: RecordEvidenceAndMaybeUpdateInput,
): Promise<RecordEvidenceAndMaybeUpdateResult> {
  const insertedEvidence = await input.repositories.evidence.insert(input.evidence);
  const update = await runHarnessUpdateIfTriggered(input);
  return {
    evidence: insertedEvidence,
    update,
  };
}
