import { gql } from "@apollo/client";

/**
 * The children of a media folder, in the order of jContent's media list.
 *
 * jContent's field sorter reads the field of the selection set that its sort names, by
 * alias. So each field that jContent's media list sorts by keeps the alias and the
 * arguments of jContent's own query: `lastModified.value`, `content.data.size` and the
 * others. Folders come first, as in jContent.
 */
export const MEDIA_FOLDER_ORDER_QUERY = gql`
  query QuickFindMediaFolderOrder(
    $path: String!
    $language: String!
    $displayLanguage: String!
    $fieldSorter: InputFieldSorterInput
    $isSortedByUsages: Boolean!
  ) {
    jcr(workspace: EDIT) {
      nodeByPath(path: $path) {
        children(
          typesFilter: { types: ["jnt:file", "jnt:folder"], multi: ANY }
          fieldSorter: $fieldSorter
          fieldGrouping: {
            fieldName: "primaryNodeType.name"
            groups: ["jnt:folder"]
            groupingType: START
          }
        ) {
          nodes {
            path
            displayName(language: $language)
            primaryNodeType {
              name
              displayName(language: $displayLanguage)
            }
            createdBy: property(name: "jcr:createdBy") {
              value
            }
            lastModified: property(name: "jcr:lastModified", language: $language) {
              value
            }
            content: descendant(relPath: "jcr:content") {
              data: property(name: "jcr:data") {
                size
              }
              mimeType: property(name: "jcr:mimeType") {
                value
              }
            }
            # Counting references costs a query per file, so only this sort asks for it.
            usagesCount: referenceCount(
              typesFilter: { types: ["jnt:workflowTask"], multi: NONE }
            ) @include(if: $isSortedByUsages)
          }
        }
      }
    }
  }
`;
