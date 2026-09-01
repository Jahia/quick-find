/**
 * Registers the URL reverse lookup search provider.
 *
 * Resolves pasted live URLs to JCR nodes via vanity URL or direct path
 * matching. Only fires when the query looks like a URL (`canHandle`).
 *
 * The GraphQL field returns a list of matching nodes (deduplicated
 * server-side). Multiple candidates are tried for each URL.
 */
import { registry } from "@jahia/ui-extender";
import type {
  ApolloClientInstance,
  QuickFindProvider,
  QuickFindResultsProvider,
  SearchHit,
} from "../types.ts";
import type { GqlJcrNode } from "../searchTypes.ts";
import {
  getSiteKey,
  getSearchLanguage,
  locateInJContent,
} from "../../quick-find/shared/navigationUtils.ts";
import {
  isProviderEnabled,
  getDefaultDisplayedResults,
} from "../../quick-find/shared/configUtils.ts";
import { jcrNodeToSearchHit } from "../jcr/jcrSearchProvider.ts";
import { URL_REVERSE_LOOKUP_QUERY } from "./urlReverseLookupQuery.ts";
import {
  openContentEditor,
  withStaleResponseFiltering,
} from "../providerUtils.ts";

const URL_PATTERN = /^[\w-]+\.[\w.-]+\//;

/** Heuristic: does the input look like a URL or an absolute path? */
function looksLikeUrl(input: string): boolean {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return true;
  }

  if (input.startsWith("/") && input.length > 1) {
    return true;
  }

  if (URL_PATTERN.test(input)) {
    return true;
  }

  return false;
}

function createUrlReverseLookupProvider(
  client: ApolloClientInstance,
): QuickFindResultsProvider {
  return withStaleResponseFiltering(async (query) => {
    const result = await client.query<{
      fuzzyUrlAndPathLookup: GqlJcrNode[];
    }>({
      query: URL_REVERSE_LOOKUP_QUERY,
      variables: {
        url: query,
        siteKey: getSiteKey(),
        language: getSearchLanguage(),
      },
      fetchPolicy: "network-only",
    });

    const nodes = result.data?.fuzzyUrlAndPathLookup ?? [];
    const hits: SearchHit[] = nodes.map(jcrNodeToSearchHit);

    return { hits, hasMore: false };
  });
}

const urlReverseLookupProvider: QuickFindProvider = {
  priority: 5,
  title: "search.urlReverseLookup.title",
  titleDefault: "URL or path match",
  isEnabled: () => isProviderEnabled("urlReverseLookupEnabled"),
  maxResults: () => getDefaultDisplayedResults(),
  canHandle: looksLikeUrl,
  createSearchProvider: createUrlReverseLookupProvider,
  locate: (hit: SearchHit) => locateInJContent(hit.path, hit.nodeType),
  edit: openContentEditor,
};

registry.add(
  "quickFindProvider",
  "quick-find-url-reverse-lookup",
  urlReverseLookupProvider,
);
