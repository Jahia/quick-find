import { gql } from "@apollo/client";

/** The query of the jContent site switcher (SiteSwitcher.jsx), without its cache fragment. */
export const SITES_QUERY = gql`
  query QuickFindSites($displayLanguage: String!) {
    jcr {
      nodesByQuery(
        query: "select * from [jnt:virtualsite] where ischildnode('/sites')"
      ) {
        nodes {
          uuid
          workspace
          name
          path
          hasPermission(permissionName: "jContentAccess")
          displayName(language: $displayLanguage)
          site {
            uuid
            workspace
            path
            defaultLanguage
            languages {
              language
              activeInEdit
            }
          }
        }
      }
    }
  }
`;
