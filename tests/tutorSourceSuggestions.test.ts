import { describe, expect, it, vi } from "vitest";
import { createSourceBackedTutorResourceSuggestionProvider } from "@/features/tutor/sourceSuggestions";
import type { ResourceSource } from "@/core/sources";
import type { TutorReplyInput } from "@/features/tutor";

const replyInput: TutorReplyInput = {
  domain: "computer_science",
  content: "rust ownership",
  learning: {
    evidence: {
      id: 12,
      domain: "computer_science",
      type: "chat",
      summary: "chat",
      payload: {},
      createdAt: "2026-06-10T12:00:00.000Z",
      consumedInVersion: null,
    },
    update: {
      status: "skipped",
      reason: "trigger_not_met",
      trigger: {
        shouldRun: false,
        reason: "evidence_count",
        evidenceCount: 1,
      },
      latest: null,
      consumedEvidenceIds: [],
    },
  },
  promptContext: null,
};

describe("source-backed tutor resource suggestions", () => {
  it("returns source suggestions when enabled sources produce resources", async () => {
    const search = vi.fn<ResourceSource["search"]>(() => [
      {
        id: "github:12345",
        sourceId: "github",
        title: "learning-rust/rust-by-example",
        url: "https://github.com/learning-rust/rust-by-example",
        kind: "repo",
        summary: "Practical Rust examples",
      },
    ]);
    const provider = createSourceBackedTutorResourceSuggestionProvider({
      sources: [
        {
          id: "github",
          label: "GitHub",
          enabled: true,
          search,
        },
      ],
      fallbackProvider: () => [
        {
          title: "local fallback",
          kind: "doc",
        },
      ],
    });

    const suggestions = await provider(replyInput);

    expect(search).toHaveBeenCalledWith(
      {
        topic: "rust ownership",
        intent: "learn",
        limit: 3,
      },
      expect.objectContaining({
        domain: "computer_science",
        preferredKinds: ["repo", "doc", "article"],
      }),
    );
    expect(suggestions).toEqual([
      {
        sourceId: "github:12345",
        title: "learning-rust/rust-by-example",
        kind: "repo",
        url: "https://github.com/learning-rust/rust-by-example",
        reason: "Practical Rust examples · source: github",
      },
    ]);
  });

  it("uses fallback suggestions when sources are empty", async () => {
    const provider = createSourceBackedTutorResourceSuggestionProvider({
      sources: [],
      fallbackProvider: () => [
        {
          title: "local fallback",
          kind: "doc",
        },
      ],
    });

    await expect(provider(replyInput)).resolves.toEqual([
      {
        title: "local fallback",
        kind: "doc",
      },
    ]);
  });

  it("uses fallback suggestions when a source fails", async () => {
    const provider = createSourceBackedTutorResourceSuggestionProvider({
      sources: [
        {
          id: "github",
          label: "GitHub",
          enabled: true,
          search: () => {
            throw new Error("rate limited");
          },
        },
      ],
      fallbackProvider: () => [
        {
          title: "local fallback",
          kind: "doc",
        },
      ],
    });

    await expect(provider(replyInput)).resolves.toEqual([
      {
        title: "local fallback",
        kind: "doc",
      },
    ]);
  });
});
