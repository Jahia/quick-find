/**
 * The page of jContent's media list that shows a given file or folder.
 */
import { MEDIA_FOLDER_ORDER_QUERY } from "./mediaFolderOrderQuery.ts";

/** The sort of jContent's lists, as its Redux state holds it. */
export type JContentSort = {
  order?: string;
  orderBy?: string | null;
};

type MediaPageRequest = {
  folderPath: string;
  mediaPath: string;
  language: string;
  displayLanguage: string;
  sort: JContentSort;
  pageSize: number;
};

type MediaFolderOrderResult = {
  jcr?: {
    nodeByPath?: {
      children?: { nodes?: { path: string }[] };
    };
  };
};

/**
 * Lists the folder as jContent does, with the same sort and folders first, and returns
 * the zero-based page that holds `mediaPath`. Returns 0 when the media is not in the list.
 *
 * Example: with 25 rows per page, the 40th file of the folder is on page 1.
 */
export async function findJContentMediaPage(
  request: MediaPageRequest,
): Promise<number> {
  const client = window.jahia?.apolloClient;
  if (!client) {
    return 0;
  }

  const { sort } = request;
  const result = await client.query<MediaFolderOrderResult>({
    query: MEDIA_FOLDER_ORDER_QUERY,
    variables: {
      path: request.folderPath,
      language: request.language,
      displayLanguage: request.displayLanguage,
      fieldSorter: sort.orderBy
        ? {
            sortType: sort.order === "DESC" ? "DESC" : "ASC",
            fieldName: sort.orderBy,
            ignoreCase: true,
          }
        : null,
      isSortedByUsages: sort.orderBy === "usagesCount",
    },
    // The nested nodes carry no cache id, and the order changes with every upload.
    fetchPolicy: "no-cache",
  });

  const nodes = result.data?.jcr?.nodeByPath?.children?.nodes ?? [];
  const index = nodes.findIndex((node) => node.path === request.mediaPath);
  return index < 0 ? 0 : Math.floor(index / request.pageSize);
}
