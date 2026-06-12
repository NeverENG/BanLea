import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getClient,
  getCurrentProvider,
  initClient,
  isInitialized,
  modelForTier,
  resetClient,
} from "@/core/llm/client";

describe("llm client", () => {
  afterEach(() => {
    resetClient();
    vi.unstubAllGlobals();
  });

  it("initClient 初始化 fetch 客户端，resetClient 清空状态", () => {
    expect(isInitialized()).toBe(false);

    initClient("sk-ant-test");

    expect(isInitialized()).toBe(true);
    expect(getClient()).toBeTruthy();

    resetClient();

    expect(isInitialized()).toBe(false);
    expect(() => getClient()).toThrow("LLM 客户端未初始化");
  });

  it("messages.create 使用 key 调用 Anthropic Messages API", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    initClient("sk-ant-test");
    const result = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 32,
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.content).toEqual([{ type: "text", text: "ok" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "anthropic-dangerous-direct-browser-access": "true",
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": "sk-ant-test",
        }),
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 32,
          messages: [{ role: "user", content: "hello" }],
        }),
      }),
    );
  });

  it("DeepSeek provider 使用 OpenAI-compatible chat completions", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "deepseek ok" } }],
        }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    initClient("sk-ds-test", "deepseek");

    expect(getCurrentProvider()).toBe("deepseek");
    expect(modelForTier("light")).toBe("deepseek-v4-flash");

    const result = await getClient().messages.create({
      model: modelForTier("light"),
      max_tokens: 32,
      system: "system prompt",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.content).toEqual([{ type: "text", text: "deepseek ok" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer sk-ds-test",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          max_tokens: 32,
          messages: [
            { role: "system", content: "system prompt" },
            { role: "user", content: "hello" },
          ],
        }),
      }),
    );
  });

  it("messages.stream 聚合 SSE text_delta", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              "event: content_block_delta",
              'data: {"delta":{"type":"text_delta","text":"he"}}',
              "",
              "event: content_block_delta",
              'data: {"delta":{"type":"text_delta","text":"llo"}}',
              "",
              "",
            ].join("\n"),
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    initClient("sk-ant-test");
    const deltas: string[] = [];
    const stream = getClient().messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 32,
      messages: [{ role: "user", content: "hello" }],
    });
    stream.on("text", (delta) => deltas.push(delta));

    const final = await stream.finalMessage();

    expect(deltas).toEqual(["he", "llo"]);
    expect(final.content).toEqual([{ type: "text", text: "hello" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 32,
          messages: [{ role: "user", content: "hello" }],
          stream: true,
        }),
      }),
    );
  });

  it("messages.stream 会处理没有结尾空行的 SSE 事件", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              "event: content_block_delta",
              'data: {"delta":{"type":"text_delta","text":"tail"}}',
            ].join("\n"),
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    initClient("sk-ant-test");
    const deltas: string[] = [];
    const stream = getClient().messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 32,
      messages: [{ role: "user", content: "hello" }],
    });
    stream.on("text", (delta) => deltas.push(delta));

    const final = await stream.finalMessage();

    expect(deltas).toEqual(["tail"]);
    expect(final.content).toEqual([{ type: "text", text: "tail" }]);
  });

  it("DeepSeek stream 忽略非 JSON SSE 并聚合文本", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              "data: {not-json}",
              "",
              'data: {"choices":[{"delta":{"content":"deep"}}]}',
              "",
              'data: {"choices":[{"delta":{"content":"seek"}}]}',
            ].join("\n"),
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(body, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    initClient("sk-ds-test", "deepseek");
    const deltas: string[] = [];
    const stream = getClient().messages.stream({
      model: modelForTier("light"),
      max_tokens: 32,
      messages: [{ role: "user", content: "hello" }],
    });
    stream.on("text", (delta) => deltas.push(delta));

    const final = await stream.finalMessage();

    expect(deltas).toEqual(["deep", "seek"]);
    expect(final.content).toEqual([{ type: "text", text: "deepseek" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          max_tokens: 32,
          messages: [{ role: "user", content: "hello" }],
          stream: true,
        }),
      }),
    );
  });
});
