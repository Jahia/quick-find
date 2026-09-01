import type { QuickFindResultsProvider, SearchHit, SearchResult } from "./types.ts";

/**
 * Wraps a search function with stale-response filtering.
 * If a new search is initiated before the previous one resolves,
 * the older response is discarded to prevent race conditions.
 */
export function withStaleResponseFiltering(
  fetchResults: (query: string, page: number) => Promise<SearchResult>,
): QuickFindResultsProvider {
  let activeQuery = "";

  return {
    search: async (query: string, page: number): Promise<SearchResult> => {
      activeQuery = query;

      try {
        const result = await fetchResults(query, page);

        // Discard stale responses — a newer search may have started while
        // this async request was in-flight.
        if (activeQuery !== query) {
          return { hits: [], hasMore: false };
        }

        return result;
      } catch (error) {
        console.error(
          `[quick-find][provider] Search failed for query: "${query}"`,
          error,
        );
        return { hits: [], hasMore: false };
      }
    },
    reset: () => {
      activeQuery = "";
    },
  };
}

/**
 * Shared utility to open the Jahia Content Editor for a given node.
 */
export const openContentEditor = (hit: SearchHit): void => {
  window.parent.CE_API?.edit({ path: hit.path });
};
