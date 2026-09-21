import { gql } from "@apollo/client";

export const JCR_MEDIA_BY_CRITERIA_QUERY = gql`
  query JCRMediaByCriteria(
    $limit: Int!
    $offset: Int!
    $searchTerm: String!
    $wildcardTerm: String!
    $likePattern: String!
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
          # Five clauses and not one, because contains and like do not read the same
          # store. contains reads the Lucene index, whose text is lowercased,
          # accent-folded, stemmed and split into tokens; like reads the raw stored
          # value and folds nothing. So each clause catches input the others miss: the
          # analyzed term finds a complete word despite stemming, the wildcard term
          # finds a fragment inside a word, the tag clause reaches a property kept out
          # of the aggregated node text, and the two like clauses recover the accents
          # and punctuation the analyzer dropped.
          nodeConstraint: {
            any: [
              { contains: $searchTerm }
              { contains: $wildcardTerm }
              { contains: $searchTerm, property: "j:tagList" }
              { like: $likePattern, property: "jcr:title", function: LOWER_CASE }
              { like: $likePattern, property: "j:nodename", function: LOWER_CASE }
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
