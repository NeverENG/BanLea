/**
 * LLM 客户端（§8.3 模型分层）。
 * - Claude：Anthropic Messages API
 * - DeepSeek：OpenAI-compatible chat/completions API
 *
 * 在 Tauri WebView（浏览器环境）中直接通过 fetch 调用模型 API。
 * 官方 SDK 当前会把 Node-only agent-toolset 模块带入 Vite 浏览器包；这里保留
 * 与 chat.ts 实际使用面一致的最小客户端，避免 UI bundle 依赖 Node 内置模块。
 */

export type ModelTier = "deep" | "light";
export type LlmProvider = "claude" | "deepseek";

export const MODELS: Record<ModelTier, string> = {
  deep: "claude-opus-4-8",
  light: "claude-haiku-4-5",
};

export const PROVIDER_MODELS: Record<LlmProvider, Record<ModelTier, string>> = {
  claude: MODELS,
  deepseek: {
    deep: "deepseek-v4-pro",
    light: "deepseek-v4-flash",
  },
};

export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface UnknownContentBlock {
  type: string;
  [key: string]: unknown;
}

export type ContentBlock = TextContentBlock | UnknownContentBlock;

export interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface MessageCreateParams {
  model: string;
  max_tokens: number;
  system?: string;
  thinking?: Record<string, unknown>;
  output_config?: Record<string, unknown>;
  messages: MessageParam[];
  stream?: boolean;
}

export interface MessageResponse {
  content: ContentBlock[];
  [key: string]: unknown;
}

export interface MessageStream {
  on(event: "text", callback: (delta: string) => void): void;
  finalMessage(): Promise<MessageResponse>;
}

export interface LlmClient {
  provider: LlmProvider;
  messages: {
    create(params: MessageCreateParams): Promise<MessageResponse>;
    stream(params: MessageCreateParams): MessageStream;
  };
}

const CLAUDE_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEEPSEEK_CHAT_COMPLETIONS_URL = "https://api.deepseek.com/chat/completions";

let client: LlmClient | null = null;
let currentProvider: LlmProvider = "claude";

function requestHeaders(apiKey: string): HeadersInit {
  return {
    "anthropic-dangerous-direct-browser-access": "true",
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    "x-api-key": apiKey,
  };
}

async function parseError(response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  return new Error(`Claude API 请求失败：${response.status} ${body || response.statusText}`);
}

async function createMessage(
  apiKey: string,
  params: MessageCreateParams,
): Promise<MessageResponse> {
  const response = await fetch(CLAUDE_MESSAGES_URL, {
    method: "POST",
    headers: requestHeaders(apiKey),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  return (await response.json()) as MessageResponse;
}

function parseSseEvent(raw: string): { event: string | null; data: string } | null {
  const lines = raw.split(/\r?\n/);
  let event: string | null = null;
  const data: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trim());
    }
  }

  if (data.length === 0) {
    return null;
  }

  return { event, data: data.join("\n") };
}

function textDeltaFromEvent(data: string): string | null {
  const parsed = JSON.parse(data) as {
    delta?: { type?: string; text?: string };
  };
  if (parsed.delta?.type === "text_delta" && typeof parsed.delta.text === "string") {
    return parsed.delta.text;
  }
  return null;
}

async function streamMessage(
  apiKey: string,
  params: MessageCreateParams,
  textCallbacks: Set<(delta: string) => void>,
): Promise<MessageResponse> {
  const response = await fetch(CLAUDE_MESSAGES_URL, {
    method: "POST",
    headers: requestHeaders(apiKey),
    body: JSON.stringify({ ...params, stream: true }),
  });

  if (!response.ok) {
    throw await parseError(response);
  }
  if (!response.body) {
    throw new Error("Claude API 未返回可读流");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const event = parseSseEvent(rawEvent);
      if (event?.event === "content_block_delta") {
        const delta = textDeltaFromEvent(event.data);
        if (delta) {
          text += delta;
          textCallbacks.forEach((callback) => callback(delta));
        }
      }

      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  return {
    content: text ? [{ type: "text", text }] : [],
  };
}

function createClaudeClient(apiKey: string): LlmClient {
  return {
    provider: "claude",
    messages: {
      create(params) {
        return createMessage(apiKey, params);
      },

      stream(params) {
        const textCallbacks = new Set<(delta: string) => void>();
        let finalMessagePromise: Promise<MessageResponse> | null = null;
        return {
          on(_event, callback) {
            textCallbacks.add(callback);
          },
          finalMessage() {
            finalMessagePromise ??= streamMessage(apiKey, params, textCallbacks);
            return finalMessagePromise;
          },
        };
      },
    },
  };
}

interface OpenAiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface DeepSeekChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  [key: string]: unknown;
}

function plainTextContent(content: MessageParam["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  return content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

function deepSeekHeaders(apiKey: string): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  };
}

function toDeepSeekMessages(params: MessageCreateParams): OpenAiChatMessage[] {
  return [
    ...(params.system
      ? [{ role: "system" as const, content: params.system }]
      : []),
    ...params.messages.map((message) => ({
      role: message.role,
      content: plainTextContent(message.content),
    })),
  ];
}

async function parseDeepSeekError(response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  return new Error(
    `DeepSeek API 请求失败：${response.status} ${body || response.statusText}`,
  );
}

async function createDeepSeekMessage(
  apiKey: string,
  params: MessageCreateParams,
): Promise<MessageResponse> {
  const body = {
    model: params.model,
    max_tokens: params.max_tokens,
    messages: toDeepSeekMessages(params),
    response_format: params.output_config?.format ? { type: "json_object" } : undefined,
  };
  const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: deepSeekHeaders(apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await parseDeepSeekError(response);
  }

  const parsed = (await response.json()) as DeepSeekChatCompletionResponse;
  const text = parsed.choices?.[0]?.message?.content ?? "";
  return {
    content: text ? [{ type: "text", text }] : [],
    raw: parsed,
  };
}

function deepSeekTextDelta(data: string): string | null {
  if (data === "[DONE]") {
    return null;
  }
  const parsed = JSON.parse(data) as {
    choices?: Array<{
      delta?: {
        content?: string;
      };
    }>;
  };
  return parsed.choices?.[0]?.delta?.content ?? null;
}

async function streamDeepSeekMessage(
  apiKey: string,
  params: MessageCreateParams,
  textCallbacks: Set<(delta: string) => void>,
): Promise<MessageResponse> {
  const response = await fetch(DEEPSEEK_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: deepSeekHeaders(apiKey),
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.max_tokens,
      messages: toDeepSeekMessages(params),
      stream: true,
    }),
  });

  if (!response.ok) {
    throw await parseDeepSeekError(response);
  }
  if (!response.body) {
    throw new Error("DeepSeek API 未返回可读流");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex >= 0) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const event = parseSseEvent(rawEvent);
      if (event?.data) {
        const delta = deepSeekTextDelta(event.data);
        if (delta) {
          text += delta;
          textCallbacks.forEach((callback) => callback(delta));
        }
      }

      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  return {
    content: text ? [{ type: "text", text }] : [],
  };
}

function createDeepSeekClient(apiKey: string): LlmClient {
  return {
    provider: "deepseek",
    messages: {
      create(params) {
        return createDeepSeekMessage(apiKey, params);
      },

      stream(params) {
        const textCallbacks = new Set<(delta: string) => void>();
        let finalMessagePromise: Promise<MessageResponse> | null = null;
        return {
          on(_event, callback) {
            textCallbacks.add(callback);
          },
          finalMessage() {
            finalMessagePromise ??= streamDeepSeekMessage(
              apiKey,
              params,
              textCallbacks,
            );
            return finalMessagePromise;
          },
        };
      },
    },
  };
}

export function modelForTier(tier: ModelTier = "deep"): string {
  return PROVIDER_MODELS[currentProvider][tier];
}

export function getCurrentProvider(): LlmProvider {
  return currentProvider;
}

/** 用 API Key 初始化客户端（key 来自 keychain，见 ./apiKey） */
export function initClient(
  apiKey: string,
  provider: LlmProvider = "claude",
): LlmClient {
  currentProvider = provider;
  client =
    provider === "deepseek"
      ? createDeepSeekClient(apiKey)
      : createClaudeClient(apiKey);
  return client;
}

export function getClient(): LlmClient {
  if (!client) {
    throw new Error("LLM 客户端未初始化：请先 initClient(apiKey)");
  }
  return client;
}

export function resetClient(): void {
  client = null;
  currentProvider = "claude";
}

export function isInitialized(): boolean {
  return client !== null;
}
