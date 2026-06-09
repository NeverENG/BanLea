// 模型分层、触发阈值、排序特征默认权重

export interface HarnessTriggerPolicy {
  /** 累计多少条未消费证据后触发画像重评估 */
  minEvidenceCount: number;
  /** 推荐点击停留超过该秒数，视为强兴趣反馈 */
  strongFeedbackDwellSeconds: number;
  /** 测验得分低于等于该值，视为需要及时更新卡点/误区 */
  lowQuizScore: number;
}

export const DEFAULT_HARNESS_TRIGGER_POLICY: HarnessTriggerPolicy = {
  minEvidenceCount: 5,
  strongFeedbackDwellSeconds: 45,
  lowQuizScore: 0.6,
};
