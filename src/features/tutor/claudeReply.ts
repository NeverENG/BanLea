import { ask as askClaude, isInitialized, type AskOptions } from "@/core/llm";
import {
  createLocalTutorReply,
  type TutorPromptContext,
  type TutorReplyGenerator,
  type TutorReplyInput,
} from "@/features/tutor";

export interface TutorReplyModel {
  ask(options: AskOptions): Promise<string>;
}

export interface ClaudeTutorReplyGeneratorOptions {
  model?: TutorReplyModel;
  canUseModel?: () => boolean;
  maxTokens?: number;
}

const defaultModel: TutorReplyModel = {
  ask: askClaude,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}

function learningUpdateSummary(input: TutorReplyInput): string {
  const { update } = input.learning;
  if (update.status === "updated") {
    return `画像已更新到 v${update.portrait.portraitVersion}`;
  }
  if (update.status === "deferred") {
    return `画像更新已延后：${update.reason}`;
  }
  return `画像未更新：${update.reason}`;
}

function buildSystemPrompt(context: TutorPromptContext | null): string {
  const portraitContext = context?.systemContext ?? "暂无画像上下文。";
  return [
    "你是 BanLea 的提问式学习辅导助手。",
    "目标是直接回答用户的学习问题，并根据画像上下文调整解释方式。",
    "要求：",
    "- 使用中文。",
    "- 必须严格使用三段标题：学习计划、关键解释、练习/验证问题。",
    "- 标题独占一行，标题之间用空行分隔。",
    "- 先给出可执行的学习路径或解释，不写寒暄。",
    "- 画像上下文只能作为弱信号；低置信或缺失信息不要当成确定事实。",
    "- 回复要短而完整，优先给出下一步可做的练习或验证问题。",
    "",
    "画像与资料上下文：",
    portraitContext,
  ].join("\n");
}

function buildUserPrompt(input: TutorReplyInput): string {
  return [
    `用户问题：${input.content}`,
    `当前领域：${input.domain}`,
    `学习闭环状态：${learningUpdateSummary(input)}`,
    "请生成这轮 assistant 回复。",
  ].join("\n");
}

export function createClaudeTutorReplyGenerator(
  options: ClaudeTutorReplyGeneratorOptions = {},
): TutorReplyGenerator {
  const model = options.model ?? defaultModel;
  const canUseModel = options.canUseModel ?? isInitialized;

  return async (input) => {
    if (!canUseModel()) {
      return createLocalTutorReply(input);
    }

    try {
      const reply = (
        await model.ask({
          tier: "light",
          maxTokens: options.maxTokens ?? 1400,
          effort: "low",
          system: buildSystemPrompt(input.promptContext),
          messages: [{ role: "user", content: buildUserPrompt(input) }],
        })
      ).trim();

      if (reply) {
        return reply;
      }

      return `${createLocalTutorReply(input)}\n\nClaude 返回了空回复，暂时保留本地提示。`;
    } catch (error) {
      return `${createLocalTutorReply(input)}\n\nClaude 回复生成失败：${errorMessage(error)}`;
    }
  };
}
