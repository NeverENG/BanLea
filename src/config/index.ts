// 模型分层、触发阈值、排序特征默认权重

export interface HarnessTriggerPolicy {
  /** 累计多少条未消费证据后触发画像重评估 */
  minEvidenceCount: number;
  /** 推荐点击停留超过该秒数，视为强兴趣反馈 */
  strongFeedbackDwellSeconds: number;
  /** 测验得分低于等于该值，视为需要及时更新卡点/误区 */
  lowQuizScore: number;
  /** 自评高于等于该值时，视为“我觉得我会”的强信号 */
  highSelfReportScore?: number;
  /** 自评与测验得分差距超过该值时，视为明显矛盾 */
  contradictionScoreGap?: number;
}

export const DEFAULT_HARNESS_TRIGGER_POLICY: HarnessTriggerPolicy = {
  minEvidenceCount: 5,
  strongFeedbackDwellSeconds: 45,
  lowQuizScore: 0.6,
  highSelfReportScore: 0.8,
  contradictionScoreGap: 0.3,
};
