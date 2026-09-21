/**
 * Shared factory for JCR-based search providers.
 *
 * All JCR providers (pages, media, main resources) follow the same query pattern:
 * `nodesByCriteria` with `nodeConstraint`, `sitePath`, `language`, `limit`, `offset`.
 * The only difference is the GraphQL document (which encodes the node type criteria).
 *
 * This factory avoids duplicating the search/pagination/stale-response logic
 * across three nearly-identical providers.
 */
import type { DocumentNode } from "@apollo/client";
import type {
  ApolloClientInstance,
  QuickFindResultsProvider,
  SearchHit,
} from "../types.ts";
import type { GqlJcrNode } from "../searchTypes.ts";
import {
  getSiteKey,
  getSearchLanguage,
} from "../../quick-find/shared/navigationUtils.ts";
import { withStaleResponseFiltering } from "../providerUtils.ts";
import { buildJcrSearchConstraint } from "../jcrSearchConstraint.ts";

const PAGE_SIZE = 10;

/** Maps a raw GraphQL JCR node to the provider-agnostic `SearchHit` shape. */
export function jcrNodeToSearchHit(node: GqlJcrNode): SearchHit {
  return {
    id: node.uuid,
    path: node.path,
    displayableName: node.displayName || node.name,
    excerpt: null,
    nodeType: node.primaryNodeType.name,
    thumbnailUrl: node.thumbnailUrl ?? null,
  };
}

/**
 * Creates an imperative JCR search provider for the given GraphQL document.
 *
 * The `activeQuery` guard ensures stale network responses are discarded:
 * each call to `search()` overwrites `activeQuery`, and the response
 * handler silently drops results whose query no longer matches.
 */
export function createJcrSearchProvider(
  client: ApolloClientInstance,
  queryDoc: DocumentNode,
): QuickFindResultsProvider {
  return withStaleResponseFiltering(async (query, page) => {
    // Blank input yields no constraint, and a criteria carrying no constraint matches
    // every node under the site — so there is nothing to ask the repository for here.
    const nodeConstraint = buildJcrSearchConstraint(query);
    if (!nodeConstraint) {
      return { hits: [], hasMore: false };
    }

    const sitePath = `/sites/${getSiteKey()}`;

    // Request PAGE_SIZE + 1 to check if there are more items to paginate
    const limit = PAGE_SIZE + 1;

    const result = await client.query<{
      jcr: { nodesByCriteria: { nodes: GqlJcrNode[] } };
    }>({
      query: queryDoc,
      variables: {
        nodeConstraint,
        sitePath,
        language: getSearchLanguage(),
        limit,
        offset: page * PAGE_SIZE,
      },
      fetchPolicy: "network-only",
    });

    const nodes = result.data?.jcr?.nodesByCriteria?.nodes ?? [];
    const hasMore = nodes.length > PAGE_SIZE;
    const hits = nodes.slice(0, PAGE_SIZE).map(jcrNodeToSearchHit);

    return { hits, hasMore };
  });
}
