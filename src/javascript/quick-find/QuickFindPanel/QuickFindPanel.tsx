/**
 * Main search panel — thin composition layer.
 *
 * Delegates search logic entirely to `useSearchOrchestration` and renders
 * result sections dynamically based on registered quickFindProvider entries.
 * Has no knowledge of specific providers (augmented, JCR, features, etc.).
 *
 * Rendering flow:
 *   1. User types in `QuickFindHeader` → `searchValue` state updates.
 *   2. `useSearchOrchestration` debounces, fires all active providers,
 *      and returns `providers[]` with per-provider state.
 *   3. Each provider maps to one `<ResultsSection>` via `.map()`.
 *   4. Empty sections auto-hide; a global "no results" empty state
 *      appears only when ALL sections are empty after a completed query.
 */
import { useCallback, useRef, useState } from "react";
import { Close, Search, Typography } from "@jahia/moonstone";
import { useTranslation } from "react-i18next";
import { QuickFindHeader } from "../QuickFindHeader/QuickFindHeader.tsx";
import { useSearchOrchestration } from "../shared/useSearchOrchestration.ts";
import { ResultsSection } from "../ResultsSection/ResultsSection.tsx";
import { getMinSearchChars } from "../shared/configUtils.ts";
import styles from "../shared/layout.module.css";
import s from "./QuickFindPanel.module.css";

type QuickFindPanelProps = {
  readonly focusOnField?: boolean;
  readonly onNavigate?: () => void;
};

export const QuickFindPanel = ({ focusOnField, onNavigate }: QuickFindPanelProps) => {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputWrapperRef = useRef<HTMLDivElement>(null);

  const { providers, currentQuery, triggerSearch } =
    useSearchOrchestration(searchValue);

  const trimmedQuery = searchValue.trim();
  const minChars = getMinSearchChars();

  // Aggregate loading/results state across all providers to decide whether
  // to show the global "no results" empty state.
  const isAnyLoading = providers.some((d) => d.state.loading);
  const hasAnyResults = providers.some((d) => d.state.allHits.length > 0);

  const showGlobalNoResults =
    trimmedQuery.length >= minChars &&
    currentQuery === trimmedQuery &&
    !isAnyLoading &&
    !hasAnyResults;

  const handleSearchClear = useCallback(() => setSearchValue(""), []);

  return (
      <div className={s.panel} data-quick-find-panel="true">
          <QuickFindHeader
        searchValue={searchValue}
        focusOnField={focusOnField}
        inputWrapperRef={inputWrapperRef}
        onSearchChange={setSearchValue}
        onSearchClear={handleSearchClear}
        onTriggerSearch={triggerSearch}
      />

          <div
        ref={scrollContainerRef}
        className={styles.scrollContainer}
        data-quick-find-scroll-container="true"
          >
              {/* ── Empty state ── */}
              {trimmedQuery.length < minChars && !hasAnyResults && (
              <div className={s.emptyState} data-quick-find-empty-state="hint">
                  <Search size="big"/>
                  <Typography variant="subheading" component="p">
                      {t("search.empty.title", "Find anything.")}
                  </Typography>
                  <Typography variant="body" component="p">
                      {t("search.empty.hint", { min: minChars })}
                  </Typography>
              </div>
        )}

              {/* ── Result sections — one per active provider ── */}
              {providers.map(({ key, registration, state, loadNextPage }) => (
                  <ResultsSection
            key={key}
            sectionKey={key}
            title={t(registration.title, registration.titleDefault)}
            hits={state.allHits}
            loading={state.loading}
            hasMore={state.hasMore}
            maxResults={registration.maxResults()}
            trimmedQuery={trimmedQuery}
            onHitAction={(hit) => {
              registration.locate(hit);
              onNavigate?.();
            }}
            onSecondaryAction={registration.edit ? (hit) => registration.edit!(hit) : undefined}
            onLoadMore={loadNextPage}
          />
        ))}

              {/* ── Global "no results" — shown only when every visible section is empty ── */}
              {showGlobalNoResults && (
              <div className={s.emptyState} data-quick-find-empty-state="no-results">
                  <Close/>
                  <Typography variant="subheading" component="p">
                      {t("search.noResults.title", "No results.")}
                  </Typography>
                  <Typography variant="body" component="p">
                      {t(
                "search.noResults.hint",
                'Nothing matched "{{q}}". Try different keywords or check for typos.',
                { q: trimmedQuery },
              )}
                  </Typography>
              </div>
        )}
          </div>
      </div>
  );
};
