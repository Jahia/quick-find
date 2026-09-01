/**
 * GraphQL queries for Jahia's augmented-search module.
 *
 * SEARCH_QUERY — full-text search with pagination and excerpt highlighting.
 * SITE_INDEX_QUERY — checks if a site node has the augmented-search mixin.
 */
import {gql} from '@apollo/client';

/** Full-text search via the augmented-search GraphQL endpoint. */
export const SEARCH_QUERY = gql`
  query Search(
    $q: String!
    $siteKeys: [String]!
    $language: String!
    $size: Int!
    $page: Int!
  ) {
    search(q: $q, siteKeys: $siteKeys, language: $language, workspace: EDIT) {
      results(size: $size, page: $page) {
        totalHits
        hits {
          id
          path
          displayableName
          excerpt
          nodeType
        }
      }
    }
  }
`;

// Checks whether the site node carries the mixin that enables augmented-search indexing.
export const SITE_INDEX_QUERY = gql`
  query CheckSiteIndexed($path: String!) {
    jcr {
      nodeByPath(path: $path) {
        isNodeType(
          type: { multi: ANY, types: ["jmix:augmentedSearchIndexableSite"] }
        )
        uuid
        workspace
      }
    }
  }
`;
