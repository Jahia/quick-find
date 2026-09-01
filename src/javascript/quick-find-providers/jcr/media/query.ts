import { gql } from "@apollo/client";

export const JCR_MEDIA_BY_CRITERIA_QUERY = gql`
  query JCRMediaByCriteria(
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
          nodeType: "jnt:file"
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
          thumbnailUrl(name: "thumbnail", checkIfExists: true)
        }
      }
    }
  }
`;
