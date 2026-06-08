import { z } from "zod";

/**
 * 证据类型与 schema（对应开发计划 §5 自迭代闭环 ①）。
 *
 * 证据 = 更新画像的原始信号。落 `evidence` 表，按需触发画像重评估（§5②③）。
 */

/** 证据来源类型（与 §11 evidence.type 对齐） */
export const evidenceTypeSchema = z.enum([
  "chat", // 辅导对话的提问/回答
  "self_report", // 用户主动自评
  "quiz", // 内置测验结果
  "reading", // 阅读资料的停留/标记
  "reco_click", // 推荐流点击
  "reco_skip", // 推荐流跳过
]);
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;

/**
 * 一条证据。
 * - domain：归属方向（"global" = 主 harness；否则为领域 id）。
 * - summary：人类可读摘要，重评估时连同旧画像一起喂给 LLM。
 * - payload：结构化细节（如测验得分、停留秒数、推荐 topic），按 type 不同而不同。
 * - consumedInVersion：被哪次画像版本吸收（null = 尚未吸收）。
 */
export const evidenceSchema = z.object({
  id: z.number().int().optional(),
  domain: z.string(),
  type: evidenceTypeSchema,
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(), // ISO 8601
  consumedInVersion: z.number().int().nullable().default(null),
});
export type Evidence = z.infer<typeof evidenceSchema>;

/** 新建证据的输入（id/consumedInVersion 由系统补全） */
export const newEvidenceSchema = evidenceSchema.omit({
  id: true,
  consumedInVersion: true,
});
export type NewEvidence = z.infer<typeof newEvidenceSchema>;

export function parseEvidence(input: unknown) {
  return evidenceSchema.safeParse(input);
}
