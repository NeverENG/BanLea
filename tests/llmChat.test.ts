import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { askStructured } from "@/core/llm/chat";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  modelForTier: vi.fn(() => "mock-model"),
}));

vi.mock("@/core/llm/client", () => ({
  getClient: () => ({
    provider: "claude",
    messages: {
      create: mocks.create,
      stream: vi.fn(),
    },
  }),
  modelForTier: mocks.modelForTier,
}));

const resultSchema = z.object({
  topic: z.string(),
  score: z.number(),
  note: z.string().optional(),
});

async function parseStructuredReply(text: string) {
  mocks.create.mockResolvedValueOnce({
    content: [{ type: "text", text }],
  });

  return askStructured(resultSchema, {
    tier: "light",
    messages: [{ role: "user", content: "return json" }],
  });
}

describe("askStructured", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.modelForTier.mockReturnValue("mock-model");
  });

  it("parses raw JSON replies", async () => {
    await expect(
      parseStructuredReply('{"topic":"graphs","score":0.8}'),
    ).resolves.toEqual({
      topic: "graphs",
      score: 0.8,
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "mock-model",
        output_config: expect.objectContaining({
          format: expect.objectContaining({ type: "json_schema" }),
        }),
      }),
    );
  });

  it("parses fenced JSON replies", async () => {
    await expect(
      parseStructuredReply(
        [
          "```json",
          '{"topic":"dp","score":0.7,"note":"use recurrence"}',
          "```",
        ].join("\n"),
      ),
    ).resolves.toEqual({
      topic: "dp",
      score: 0.7,
      note: "use recurrence",
    });
  });

  it("extracts the first valid JSON value from wrapped text", async () => {
    await expect(
      parseStructuredReply(
        [
          "Here is {not json}; ignore the prose.",
          '{"topic":"strings {inside}","score":0.9}',
          "Done.",
        ].join("\n"),
      ),
    ).resolves.toEqual({
      topic: "strings {inside}",
      score: 0.9,
    });
  });
});
