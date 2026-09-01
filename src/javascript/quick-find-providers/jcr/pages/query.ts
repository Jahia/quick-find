import {gql} from '@apollo/client';

export const JCR_NODES_BY_CRITERIA_QUERY = gql`
  query JCRNodesByCriteria(
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
          nodeType: "jnt:page"
          paths: [$sitePath]
          pathType: ANCESTOR
          language: $language
          nodeConstraint: {
            any: [
              { contains: $searchTerm }
              { contains: $searchTerm, property: "j:tagList" },
              # vSearchTerm (%term%) makes hyphenated queries work via LIKE/contains
              { contains: $vSearchTerm},
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
