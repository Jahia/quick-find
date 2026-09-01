/**
 * Registers the augmented search provider.
 *
 * Uses Jahia's augmented-search GraphQL endpoint (Elasticsearch-backed).
 * Only available on sites with the `jmix:augmentedSearchIndexableSite` mixin
 * (checked via `checkAugmentedAvailable()`).
 *
 * When augmented search IS available:
 *   - This provider handles pages, main resources, and documents.
 *   - The JCR pages and main resources providers disable themselves
 *     (their `checkAvailability` returns `!augmented`).
 *
 * When augmented search is NOT available:
 *   - This provider is hidden; JCR pages and main resources providers take over.
 */
import { registry } from "@jahia/ui-extender";
import type {
  ApolloClientInstance,
  QuickFindProvider,
  QuickFindResultsProvider,
  SearchHit,
} from "../types.ts";
import type { GqlSearchHitV2 } from "../searchTypes.ts";
import {
  getSiteKey,
  getSearchLanguage,
  locateInJContent,
} from "../../quick-find/shared/navigationUtils.ts";
import { getDefaultDisplayedResults } from "../../quick-find/shared/configUtils.ts";
import { SEARCH_QUERY } from "./augmentedSearchQuery.ts";
import { checkAugmentedAvailable } from "../../quick-find/shared/checkAugmentedAvailable.ts";
import {
  openContentEditor,
  withStaleResponseFiltering,
} from "../providerUtils.ts";

const PAGE_SIZE = 10;

function createAugmentedSearchProvider(
  client: ApolloClientInstance,
): QuickFindResultsProvider {
  return withStaleResponseFiltering(async (query, page) => {
    const result = await client.query<{
      search: { results: { totalHits: number; hits: GqlSearchHitV2[] } };
    }>({
      query: SEARCH_QUERY,
      variables: {
        q: query,
        siteKeys: [getSiteKey()],
        language: getSearchLanguage(),
        size: PAGE_SIZE,
        page,
      },
      fetchPolicy: "network-only",
    });

    const hits: SearchHit[] = result.data?.search?.results?.hits ?? [];
    const total = result.data?.search?.results?.totalHits ?? 0;

    return { hits, hasMore: hits.length + page * PAGE_SIZE < total };
  });
}

const augmentedProvider: QuickFindProvider = {
  priority: 30,
  title: "search.augmented.title",
  titleDefault: "Pages, main resources, and documents",
  isEnabled: () => true,
  maxResults: () => getDefaultDisplayedResults(),
  checkAvailability: (client) => checkAugmentedAvailable(client, getSiteKey()),
  createSearchProvider: createAugmentedSearchProvider,
  locate: (hit: SearchHit) => locateInJContent(hit.path, hit.nodeType),
  edit: openContentEditor,
};

registry.add("quickFindProvider", "quick-find-augmented", augmentedProvider);
