import { z } from "zod";
import {
  getClient,
  modelForTier,
  type ContentBlock,
  type MessageParam,
  type ModelTier,
} from "./client";

/**
 * Claude 调用封装（§8.3）：
 * - ask：非流式，自适应思考 + effort
 * - streamAsk：流式，逐 token 回调，返回完整文本
 * - askStructured：结构化输出（output_config.format），返回经 zod 校验的对象
 */

export interface AskOptions {
  /** 模型档位，默认 deep(opus) */
  tier?: ModelTier;
  system?: string;
  messages: MessageParam[];
  maxTokens?: number;
  effort?: "low" | "medium" | "high" | "max";
}

function textOf(content: ContentBlock[]): string {
  return content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

/** 非流式调用，返回纯文本 */
export async function ask(opts: AskOptions): Promise<string> {
  const res = await getClient().messages.create({
    model: modelForTier(opts.tier ?? "deep"),
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "high" },
    messages: opts.messages,
  });
  return textOf(res.content);
}

/** 流式调用：onDelta 收到增量文本；返回完整文本 */
export async function streamAsk(
  opts: AskOptions,
  onDelta: (delta: string) => void,
): Promise<string> {
  const stream = getClient().messages.stream({
    model: modelForTier(opts.tier ?? "deep"),
    max_tokens: opts.maxTokens ?? 64000,
    system: opts.system,
    thinking: { type: "adaptive" },
    output_config: { effort: opts.effort ?? "high" },
    messages: opts.messages,
  });
  stream.on("text", onDelta);
  const final = await stream.finalMessage();
  return textOf(final.content);
}

/**
 * 结构化输出：用 zod schema 转 JSON Schema 约束模型输出，返回校验后的对象。
 * 用于画像生成/重评估、推荐候选等需要稳定结构的场景（§4/§6）。
 */
export async function askStructured<T>(
  schema: z.ZodType<T>,
  opts: AskOptions,
): Promise<T> {
  const jsonSchema = z.toJSONSchema(schema);
  const res = await getClient().messages.create({
    model: modelForTier(opts.tier ?? "deep"),
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    output_config: {
      format: { type: "json_schema", schema: jsonSchema },
    },
    messages: opts.messages,
  });
  return schema.parse(JSON.parse(textOf(res.content)));
}
