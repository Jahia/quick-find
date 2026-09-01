import { useCallback, useEffect, useState } from "react";
import type { SearchHit } from "../../quick-find-providers/types.ts";
import { getShowMoreIncrement } from "./configUtils.ts";

type UseResultsPaginationParams = {
  readonly hits: SearchHit[];
  readonly maxResults: number;
  readonly trimmedQuery: string;
  readonly hasMore: boolean;
  readonly onLoadMore: () => void;
};

export const useResultsPagination = ({
  hits,
  maxResults,
  trimmedQuery,
  hasMore,
  onLoadMore,
}: UseResultsPaginationParams) => {
  const [displayedCount, setDisplayedCount] = useState(maxResults);

  useEffect(() => {
    setDisplayedCount(maxResults);
  }, [trimmedQuery, maxResults]);

  const visibleHits = hits.slice(0, displayedCount);
  const hasMoreToShow = displayedCount < hits.length || hasMore;

  const handleShowMore = useCallback(() => {
    const increment = getShowMoreIncrement();

    setDisplayedCount((prevDisplayedCount) => {
      const newCount = prevDisplayedCount + increment;
      if (newCount >= hits.length && hasMore) {
        onLoadMore();
      }

      return newCount;
    });
  }, [hasMore, hits.length, onLoadMore]);

  return {
    visibleHits,
    hasMoreToShow,
    handleShowMore,
  };
};
