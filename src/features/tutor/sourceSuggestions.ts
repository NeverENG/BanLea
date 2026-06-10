import {
  flattenResourceSourceResults,
  searchResourceSources,
  type ResourceSource,
} from "@/core/sources";
import { resourceItemsToTutorResourceSuggestions } from "@/features/reading-list";
import type {
  TutorReplyInput,
  TutorResourceSuggestion,
  TutorResourceSuggestionProvider,
} from "@/features/tutor";

export interface SourceBackedTutorResourceSuggestionProviderOptions {
  sources: ResourceSource[];
  fallbackProvider?: TutorResourceSuggestionProvider;
  sourceLimit?: number;
}

async function fallbackSuggestions(
  provider: TutorResourceSuggestionProvider | undefined,
  input: TutorReplyInput,
): Promise<TutorResourceSuggestion[]> {
  return provider ? provider(input) : [];
}

export function createSourceBackedTutorResourceSuggestionProvider({
  sources,
  fallbackProvider,
  sourceLimit = 3,
}: SourceBackedTutorResourceSuggestionProviderOptions): TutorResourceSuggestionProvider {
  return async (input) => {
    const fallback = await fallbackSuggestions(fallbackProvider, input);

    try {
      const results = await searchResourceSources({
        sources,
        query: {
          topic: input.content,
          intent: "learn",
          limit: sourceLimit,
        },
        context: {
          domain: input.domain,
          portraitSummary: input.promptContext?.systemContext ?? null,
          preferredKinds: ["repo", "doc", "article"],
        },
        perSourceLimit: sourceLimit,
      });
      const items = flattenResourceSourceResults(results, sourceLimit);
      const suggestions = resourceItemsToTutorResourceSuggestions(
        items,
        sourceLimit,
      );

      return suggestions.length > 0 ? suggestions : fallback;
    } catch {
      return fallback;
    }
  };
}
