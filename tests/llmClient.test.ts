import { afterEach, describe, expect, it, vi } from "vitest";
import { getClient, initClient, isInitialized, resetClient } from "@/core/llm/client";

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
    expect(() => getClient()).toThrow("Claude 客户端未初始化");
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
});
