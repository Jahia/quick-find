/**
 * Shared factory for JCR-based search providers.
 *
 * All JCR providers (pages, media, main resources) follow the same query pattern:
 * `nodesByCriteria` with a fixed node constraint, `sitePath`, `language`, `limit`,
 * `offset`. The only difference is the GraphQL document (which encodes the node type
 * criteria and the selection set).
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
import { searchTokens } from "../../quick-find/shared/searchTextUtils.ts";
import { withStaleResponseFiltering } from "../providerUtils.ts";

const PAGE_SIZE = 10;

/** Below this length a leading-wildcard term costs the most and discriminates the least. */
const MIN_WILDCARD_TOKEN_LENGTH = 3;

/** Inside a `like` pattern `%` and `_` are wildcards: a user typing `%` would match every node. */
const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

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
 * Turns raw search-box input into the three scalars the JCR documents take.
 *
 * `searchTerm` is analyzed by the repository, so it matches a complete word despite
 * stemming and despite the accents the index folds away. `wildcardTerm` is the same
 * words wrapped in `*`, which skips the analyzer — hence the fold and the lowercase
 * that `searchTokens` already applied — and matches a fragment inside a word. Several
 * words inside one expression are ANDed by the repository, so a second word narrows the
 * result instead of widening it, and one expression per document is enough: one clause
 * per word would have to be nested in an `all` group to keep that AND.
 *
 * A word shorter than `MIN_WILDCARD_TOKEN_LENGTH` keeps its analyzed form. It still
 * joins the expression, because dropping it would re-widen what the other words
 * narrowed: `quokka zz` would come back with a node holding only `quokka`.
 *
 * `likePattern` carries the raw text instead, lowercased because `function: LOWER_CASE`
 * lowercases the property and not the pattern, and escaped because `%` and `_` are
 * wildcards there.
 */
function buildSearchVariables(tokens: string[], input: string) {
  return {
    searchTerm: tokens.join(" "),
    wildcardTerm: tokens
      .map((token) =>
        token.length >= MIN_WILDCARD_TOKEN_LENGTH ? `*${token}*` : token,
      )
      .join(" "),
    // Repeated inner whitespace is collapsed, to read like the stored value; the
    // pattern otherwise keeps the raw text, since `like` is the only clause that still
    // sees punctuation.
    likePattern: `%${escapeLike(input.trim().toLowerCase().replace(/\s+/g, " "))}%`,
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
    const tokens = searchTokens(query);

    // Defensive only: the orchestration gate counts the same searchable characters, so
    // input that reduces to no token never reaches a provider in normal use. If it did,
    // the request has to be skipped rather than sent — an empty `contains` expression
    // raises `Invalid full text search expression`, and that failure covers the whole
    // constraint, including the `like` clauses beside it.
    if (tokens.length === 0) {
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
        ...buildSearchVariables(tokens, query),
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
