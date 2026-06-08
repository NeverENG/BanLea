import { MASTER_DIMENSION_KEYS, type DimensionKey } from "./portrait";

/**
 * 维度元数据（对应开发计划 §4.4）。
 *
 * 给每个维度标注：
 * - harness：属于主（人格）还是子（领域）层；
 * - tier：变化速度——驱动**重评估调度**（slow 极少重算→省 token；fast 高频更新）；
 * - groups：功能分组——决定该维度"喂"给谁（教法 / 内容规划 / 推荐）。
 */

export type HarnessLayer = "master" | "sub";

/** 变化速度（§4.4(2)）：慢变人格 / 中变能力偏好 / 快变状态兴趣 */
export type VolatilityTier = "slow" | "medium" | "fast";

/** 功能分组（§4.4(1)）：教法 / 内容与规划 / 推荐 */
export type DimensionGroup = "teaching" | "content" | "reco";

export interface DimensionMeta {
  label: string;
  harness: HarnessLayer;
  tier: VolatilityTier;
  groups: DimensionGroup[];
}

/** 全部 27 维的元数据。Record<DimensionKey,…> 会在编译期强制覆盖每一维。 */
export const DIMENSION_META: Record<DimensionKey, DimensionMeta> = {
  // ── 主 harness（人格层）──
  logical_reasoning: { label: "逻辑推理", harness: "master", tier: "slow", groups: ["teaching"] },
  abstraction: { label: "抽象思维", harness: "master", tier: "slow", groups: ["teaching"] },
  motivation: { label: "学习动机", harness: "master", tier: "medium", groups: ["teaching", "reco"] },
  focus_persistence: { label: "专注与持续", harness: "master", tier: "medium", groups: ["teaching"] },
  metacognition: { label: "元认知", harness: "master", tier: "slow", groups: ["teaching", "content"] },
  resilience: { label: "抗挫韧性", harness: "master", tier: "medium", groups: ["teaching"] },
  curiosity_breadth: { label: "好奇广度", harness: "master", tier: "medium", groups: ["reco"] },
  retention: { label: "记忆/留存", harness: "master", tier: "medium", groups: ["content"] },
  preferred_modality: { label: "偏好模态", harness: "master", tier: "slow", groups: ["teaching"] },
  pace: { label: "学习节奏", harness: "master", tier: "medium", groups: ["teaching"] },
  depth_preference: { label: "深度偏好", harness: "master", tier: "medium", groups: ["teaching"] },
  value_orientation: { label: "价值取向", harness: "master", tier: "slow", groups: ["teaching"] },
  communication_style: { label: "沟通风格偏好", harness: "master", tier: "slow", groups: ["teaching"] },
  time_pattern: { label: "时间投入模式", harness: "master", tier: "medium", groups: ["teaching"] },
  goal_orientation: { label: "学习目标取向", harness: "master", tier: "medium", groups: ["teaching", "reco"] },

  // ── 子 harness（领域层）──
  mastery: { label: "掌握程度", harness: "sub", tier: "medium", groups: ["content"] },
  gaps: { label: "知识盲区", harness: "sub", tier: "fast", groups: ["content"] },
  misconceptions: { label: "误区/卡点", harness: "sub", tier: "fast", groups: ["content"] },
  domain_thinking: { label: "领域思维模式", harness: "sub", tier: "slow", groups: ["teaching"] },
  progress: { label: "学习进度", harness: "sub", tier: "fast", groups: ["content"] },
  application: { label: "应用能力", harness: "sub", tier: "medium", groups: ["content"] },
  transfer: { label: "迁移能力", harness: "sub", tier: "medium", groups: ["content"] },
  rigor: { label: "严谨度", harness: "sub", tier: "medium", groups: ["content"] },
  interest: { label: "兴趣强度", harness: "sub", tier: "fast", groups: ["reco"] },
  velocity: { label: "学习速度/曲线", harness: "sub", tier: "fast", groups: ["content", "reco"] },
  domain_values: { label: "领域价值倾向", harness: "sub", tier: "slow", groups: ["teaching"] },
  resource_preference: { label: "资料偏好", harness: "sub", tier: "medium", groups: ["reco", "content"] },
};

/** 取某变化速度层的维度 key（重评估调度用：fast 高频、slow 极少） */
export function dimensionsByTier(tier: VolatilityTier): DimensionKey[] {
  return (Object.keys(DIMENSION_META) as DimensionKey[]).filter(
    (k) => DIMENSION_META[k].tier === tier,
  );
}

/** 取某功能分组的维度 key（注入 prompt / 推荐特征用） */
export function dimensionsByGroup(group: DimensionGroup): DimensionKey[] {
  return (Object.keys(DIMENSION_META) as DimensionKey[]).filter((k) =>
    DIMENSION_META[k].groups.includes(group),
  );
}

/** 校验：元数据的 harness 标注与 key 所属层一致（防手误） */
export function metaMatchesHarness(): boolean {
  const master = new Set<string>(MASTER_DIMENSION_KEYS);
  return (Object.keys(DIMENSION_META) as DimensionKey[]).every((k) =>
    master.has(k)
      ? DIMENSION_META[k].harness === "master"
      : DIMENSION_META[k].harness === "sub",
  );
}
