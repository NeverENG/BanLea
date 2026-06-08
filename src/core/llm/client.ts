import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude 客户端（§8.3 模型分层）。
 * - deep：claude-opus-4-8，深度画像重评估 / 复杂辅导 / 学习计划
 * - light：claude-haiku-4-5，高频轻量（方向分类 / 推荐候选 / 出题 / 短问答）
 *
 * 在 Tauri WebView（浏览器环境）中调用，需 dangerouslyAllowBrowser。
 * 这是本地单用户应用、用户自带 key、且仅加载本地资源，可接受（§8.1）。
 */

export type ModelTier = "deep" | "light";

export const MODELS: Record<ModelTier, string> = {
  deep: "claude-opus-4-8",
  light: "claude-haiku-4-5",
};

let client: Anthropic | null = null;

/** 用 API Key 初始化客户端（key 来自 keychain，见 ./apiKey） */
export function initClient(apiKey: string): Anthropic {
  client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return client;
}

export function getClient(): Anthropic {
  if (!client) {
    throw new Error("Claude 客户端未初始化：请先 initClient(apiKey)");
  }
  return client;
}

export function isInitialized(): boolean {
  return client !== null;
}
