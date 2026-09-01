/**
 * Reusable section component for one search-result list.
 *
 * Renders a titled result list with:
 * - A loading spinner when results are pending and no hits are loaded yet.
 * - "Loading more…" caption while paginating.
 * - A "Show more" button when more results are available (locally or server-side).
 * - Auto-hides entirely when there are no results and nothing is loading,
 *   so the global "no results" in QuickFindPanel takes over.
 *
 * Two-tier pagination:
 *   1. Client-side: `displayedCount` slices the `hits` array, starting
 *      at `maxResults` (the provider's configured initial count).
 *   2. Server-side: when the user exhausts the local slice, `onLoadMore`
 *      triggers the next server-side page fetch in the orchestration layer.
 *
 * This component is fully provider-agnostic — it receives callbacks
 * (`onHitAction`, `onSecondaryAction`) from QuickFindPanel, which itself
 * delegates to the provider's `locate()` and `edit()` methods.
 */
import { useCallback } from "react";
import { Button, Typography } from "@jahia/moonstone";
import { useTranslation } from "react-i18next";
import { ResultCard } from "../ResultCard/ResultCard.tsx";
import type { SearchHit } from "../../quick-find-providers/types.ts";
import { useResultsPagination } from "../shared/useResultsPagination.ts";
import s from "./ResultsSection.module.css";

type ResultsSectionProps = {
  readonly sectionKey: string;
  readonly title: string;
  readonly hits: SearchHit[];
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly maxResults: number;
  readonly trimmedQuery: string;
  readonly onHitAction: (hit: SearchHit) => void;
  readonly onSecondaryAction?: (hit: SearchHit) => void;
  readonly onLoadMore: () => void;
};

export const ResultsSection = ({
  sectionKey,
  title,
  hits,
  loading,
  hasMore,
  maxResults,
  trimmedQuery,
  onHitAction,
  onSecondaryAction,
  onLoadMore,
}: ResultsSectionProps) => {
  const { t } = useTranslation();

  const { visibleHits, hasMoreToShow, handleShowMore } = useResultsPagination({
    hits,
    maxResults,
    trimmedQuery,
    hasMore,
    onLoadMore,
  });

  const renderRows = useCallback(
    () =>
      visibleHits.map((hit, index) => (
          <ResultCard
          key={hit.id}
          title={hit.displayableName}
          type={hit.nodeType}
          path={hit.path}
          excerpt={hit.excerpt}
          thumbnailUrl={hit.thumbnailUrl}
          rowIndex={index}
          tabIndex={0}
          onAction={() => onHitAction(hit)}
          onSecondaryAction={onSecondaryAction ? () => onSecondaryAction(hit) : undefined}
        />
      )),
    [visibleHits, onHitAction, onSecondaryAction],
  );

  // Hide the section entirely when there are no results and we're not loading.
  if (hits.length === 0 && !loading) {
    return null;
  }

  return (
      <div
      className={s.section}
      data-quick-find-results-section={sectionKey}
      data-quick-find-results-section-key={sectionKey}
      >
          <Typography variant="heading">{title}</Typography>

          {loading && hits.length === 0 && (
          <Typography variant="body">
              {t("search.loading", "Searching…")}
          </Typography>
      )}

          {visibleHits.length > 0 && (
          <ul className={s.resultsList}>{renderRows()}</ul>
      )}

          {loading && hits.length > 0 && (
          <Typography variant="caption">
              {t("search.loadingMore", "Loading more…")}
          </Typography>
      )}

          {!loading && hasMoreToShow && hits.length > 0 && (
          <Button
          className={s.showMoreButton}
          variant="ghost"
          label={t("search.showMore", "Show more")}
          data-quick-find-show-more="true"
          data-quick-find-show-more-section={sectionKey}
          onClick={handleShowMore}
        />
      )}
      </div>
  );
};
