import { z } from "zod";

/**
 * 画像类型与 schema（对应开发计划 §4）。
 *
 * - 双层：主 harness（global，跨领域人格 15 维）+ 子 harness（domain，领域 12 维）。
 * - 每个维度统一携带 summary / confidence / evidenceIds，数值维度带 score，标签维度带 tags。
 * - 由 Claude Structured Outputs 生成；这里的 zod schema 同时用于客户端校验。
 */

// ── 维度 key ───────────────────────────────────────────────

/** 主 harness 维度（跨领域人格层，15 维，§4.1） */
export const MASTER_DIMENSION_KEYS = [
  "logical_reasoning", // 逻辑推理
  "abstraction", // 抽象思维
  "motivation", // 学习动机/自驱
  "focus_persistence", // 专注与持续
  "metacognition", // 元认知
  "resilience", // 抗挫韧性
  "curiosity_breadth", // 好奇广度
  "retention", // 记忆/留存
  "preferred_modality", // 偏好模态
  "pace", // 学习节奏
  "depth_preference", // 深度偏好
  "value_orientation", // 价值取向
  "communication_style", // 沟通风格偏好
  "time_pattern", // 时间投入模式
  "goal_orientation", // 学习目标取向
] as const;

/** 子 harness 维度（每个领域各一份，12 维，§4.2） */
export const SUB_DIMENSION_KEYS = [
  "mastery", // 掌握程度
  "gaps", // 知识盲区
  "misconceptions", // 误区/卡点
  "domain_thinking", // 领域思维模式
  "progress", // 学习进度
  "application", // 应用能力
  "transfer", // 迁移能力
  "rigor", // 严谨度
  "interest", // 兴趣强度
  "velocity", // 学习速度/曲线
  "domain_values", // 领域价值倾向
  "resource_preference", // 资料偏好
] as const;

export type MasterDimensionKey = (typeof MASTER_DIMENSION_KEYS)[number];
export type SubDimensionKey = (typeof SUB_DIMENSION_KEYS)[number];
export type DimensionKey = MasterDimensionKey | SubDimensionKey;

// ── 维度值 ─────────────────────────────────────────────────

/** 趋势：相比上一版的走向 */
export const trendSchema = z.enum(["rising", "stable", "falling"]);
export type Trend = z.infer<typeof trendSchema>;

/**
 * 单个维度的取值。
 * - score：数值型维度（0~1）。标签型维度可省略。
 * - tags：标签型维度（如 thinking_style）。
 * - confidence：**每维独立可信度**（§4.3）——低可信度维度 UI 淡化、辅导仅作弱提示。
 * - evidenceIds：支撑该结论的证据 id，可追溯。
 */
export const dimensionValueSchema = z.object({
  score: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  trend: trendSchema.optional(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.number().int()).default([]),
});
export type DimensionValue = z.infer<typeof dimensionValueSchema>;

// ── 画像 ───────────────────────────────────────────────────

/** "global" = 主 harness；"domain" = 子 harness */
export const portraitScopeSchema = z.enum(["global", "domain"]);
export type PortraitScope = z.infer<typeof portraitScopeSchema>;

/**
 * 一份画像（主或子）。维度以 key→DimensionValue 的字典存放：
 * 允许部分维度缺省（§5③ 局部重评估时只更新被触及的维度，其余沿用旧版）。
 */
export const portraitSchema = z.object({
  scope: portraitScopeSchema,
  /** 主画像该字段为 "global"；子画像为领域 id（如 "computer_science"） */
  domain: z.string(),
  /** 版本号，单调递增 */
  portraitVersion: z.number().int().nonnegative(),
  /** ISO 8601 */
  updatedAt: z.string(),
  /** 整体可信度（区别于每维 confidence） */
  confidence: z.number().min(0).max(1),
  dimensions: z.record(z.string(), dimensionValueSchema),
  /** 给辅导引擎的下一步建议 */
  nextFocus: z.string().optional(),
  /** 相比上一版的变化与原因（可解释性） */
  changeSummary: z.string().optional(),
});
export type Portrait = z.infer<typeof portraitSchema>;

/** 校验：返回 zod 解析结果（成功则 .data 为 Portrait） */
export function parsePortrait(input: unknown) {
  return portraitSchema.safeParse(input);
}
