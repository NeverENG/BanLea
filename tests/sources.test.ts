import { describe, expect, it } from "vitest";
import {
  createStaticResourceSource,
  flattenResourceSourceResults,
  searchResourceSources,
  type ResourceItem,
} from "@/core/sources";

const items: ResourceItem[] = [
  {
    id: "github:kubernetes",
    sourceId: "github",
    title: "Kubernetes source code",
    url: "https://github.com/kubernetes/kubernetes",
    kind: "repo",
    summary: "k8s control plane implementation",
    score: 0.9,
  },
  {
    id: "docs:kubernetes",
    sourceId: "docs",
    title: "Kubernetes Concepts",
    url: "https://kubernetes.io/docs/concepts/",
    kind: "doc",
    summary: "official docs",
    score: 0.8,
  },
];

describe("resource sources", () => {
  it("creates a static source that filters by query topic", async () => {
    const source = createStaticResourceSource({
      id: "github",
      label: "GitHub",
      items,
    });

    const result = await source.search(
      { topic: "control plane" },
      { domain: "computer_science" },
    );

    expect(result.map((item) => item.id)).toEqual(["github:kubernetes"]);
  });

  it("searches enabled sources and applies per-source limits", async () => {
    const results = await searchResourceSources({
      sources: [
        createStaticResourceSource({
          id: "github",
          label: "GitHub",
          items,
        }),
        createStaticResourceSource({
          id: "web",
          label: "Web",
          items,
          enabled: false,
        }),
      ],
      query: {
        topic: "kubernetes",
        limit: 1,
      },
      context: {
        domain: "computer_science",
        preferredKinds: ["repo"],
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      sourceId: "github",
      label: "GitHub",
    });
    expect(results[0].items).toHaveLength(1);
  });

  it("flattens source results with an optional limit", () => {
    const flat = flattenResourceSourceResults(
      [
        {
          sourceId: "github",
          label: "GitHub",
          items,
        },
      ],
      1,
    );

    expect(flat).toEqual([items[0]]);
  });
});
