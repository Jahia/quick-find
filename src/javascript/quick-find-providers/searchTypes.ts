/**
 * Internal GraphQL response shape types used by provider implementations.
 */

/** The two available JCR workspaces, as returned by `JCRNode.workspace`. */
export type Workspace = "EDIT" | "LIVE";

/**
 * GraphQL `JCRNodeType` as returned by node-type sub-selections in quick-find queries.
 * Only `name` is selected; other valid schema fields (`displayName`, `icon`,
 * `hasOrderableChildNodes`) are not fetched.
 *
 * Corresponds to the `JCRNodeType` OBJECT type in graphql-schema.json.
 */
export type GqlJcrNodeType = {
  name: string;
};

/**
 * GraphQL `JCRNode` as returned by `jcr.nodesByCriteria`, `jcr.nodeByPath`,
 * and `urlReverseLookup` in quick-find queries.
 *
 * Corresponds to the `JCRNode` INTERFACE type in graphql-schema.json.
 * Only the fields actually selected by quick-find queries are declared here.
 *
 * `displayName` is nullable in the schema (String with a `language` arg);
 * callers fall back to `name` when it is absent.
 * `thumbnailUrl` is optional because it is only selected by the media query.
 */
export type GqlJcrNode = {
  displayName: string | null;
  name: string;
  path: string;
  uuid: string;
  workspace: Workspace;
  primaryNodeType: GqlJcrNodeType;
  thumbnailUrl?: string | null;
};

/**
 * GraphQL `searchHitV2` as returned by the augmented-search endpoint.
 *
 * Corresponds to the `searchHitV2` OBJECT type in graphql-schema.json.
 * Only the fields actually selected in `SEARCH_QUERY` are declared here.
 *
 * Other available fields (not selected): `score`, `tags`, `lastModified`,
 * `lastModifiedBy`, `created`, `createdBy`, `lastPublished`, `lastPublishedBy`,
 * `link`, `mimeType`, `keywords`, `property`.
 */
export type GqlSearchHitV2 = {
  id: string;
  path: string;
  displayableName: string;
  excerpt: string | null;
  nodeType: string;
};
