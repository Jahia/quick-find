import { gql } from "@apollo/client";

export const URL_REVERSE_LOOKUP_QUERY = gql`
  query UrlReverseLookup($url: String!, $siteKey: String!, $language: String!) {
    fuzzyUrlAndPathLookup(url: $url, siteKey: $siteKey) {
      displayName(language: $language)
      name
      path
      uuid
      workspace
      primaryNodeType {
        name
      }
    }
  }
`;
