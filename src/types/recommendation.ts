import { z } from "zod";

/**
 * 推荐类型与 schema（对应开发计划 §6 猜你想学/想看）。
 *
 * 候选由便宜模型生成 → 本地按特征加权打分排序 → 信息流展示 →
 * 点击/停留/跳过反馈，回更画像 interest 与排序权重（§6.2）。
 */

/** 两类候选：learn=该学的主题/技能；read=该看的具体资料 */
export const recommendationKindSchema = z.enum(["learn", "read"]);
export type RecommendationKind = z.infer<typeof recommendationKindSchema>;

/**
 * 排序特征（§6.2）。同一组 key 也是 ranker_weights 表里的特征行，
 * 在线学习据点击/停留调整这些特征的权重。
 */
export const RECO_FEATURE_KEYS = [
  "interest_match", // 画像兴趣匹配
  "adjacency", // 与已学方向的邻近度
  "mentioned", // 用户是否提过但没学
  "difficulty_fit", // 难度与画像匹配
  "novelty", // 新鲜度（探索，防信息茧房）
] as const;
export type RecoFeatureKey = (typeof RECO_FEATURE_KEYS)[number];

export const recoFeaturesSchema = z.partialRecord(
  z.enum(RECO_FEATURE_KEYS),
  z.number(),
);
export type RecoFeatures = z.infer<typeof recoFeaturesSchema>;

/** 一条推荐候选（与 §11 recommendations 表对齐） */
export const recommendationSchema = z.object({
  id: z.number().int().optional(),
  domain: z.string().default("global"),
  kind: recommendationKindSchema,
  topic: z.string(),
  reason: z.string().optional(),
  features: recoFeaturesSchema.default({}),
  score: z.number().default(0),
  shownAt: z.string().nullable().default(null),
  clicked: z.boolean().default(false),
  dwellSeconds: z.number().int().nonnegative().default(0),
  skipped: z.boolean().default(false),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

/** 新建候选输入（id/反馈字段由系统补全） */
export const newRecommendationSchema = recommendationSchema.omit({
  id: true,
  shownAt: true,
  clicked: true,
  dwellSeconds: true,
  skipped: true,
});
export type NewRecommendation = z.infer<typeof newRecommendationSchema>;

export function parseRecommendation(input: unknown) {
  return recommendationSchema.safeParse(input);
}
