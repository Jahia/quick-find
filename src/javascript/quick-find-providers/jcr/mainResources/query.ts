import { gql } from "@apollo/client";

export const JCR_MAIN_RESOURCES_BY_CRITERIA_QUERY = gql`
  query JCRMainResourcesByCriteria(
    $limit: Int!
    $offset: Int!
    $searchTerm: String!
    $vSearchTerm: String!
    $sitePath: String!
    $language: String!
  ) {
    jcr(workspace: EDIT) {
      nodesByCriteria(
        limit: $limit
        offset: $offset
        criteria: {
          nodeType: "jmix:mainResource"
          paths: [$sitePath]
          pathType: ANCESTOR
          language: $language
          nodeConstraint: {
            any: [
              { contains: $searchTerm }
              { contains: $searchTerm, property: "j:tagList" }
              { contains: $vSearchTerm }
              { like: $vSearchTerm, property: "j:nodename" }
            ]
          }
        }
      ) {
        nodes {
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
    }
  }
`;
