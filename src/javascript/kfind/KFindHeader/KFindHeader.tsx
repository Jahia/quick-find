/**
 * Sticky header for the kFind search panel.
 *
 * Layout:
 *   - Top row: "Welcome to kFind" title (left) + site/language info (right)
 *   - Bottom row: search input with clear button
 *
 * Keyboard handling:
 *   - Enter submits the form (immediate re-query).
 *
 * The moonstone Input renders a clear button that is focusable by default;
 * a MutationObserver patches its tabIndex to −1 so it doesn't interfere
 * with keyboard tab order.
 */
import React, { useEffect } from "react";
import type { FormEvent } from "react";
import { Input, Search, Typography } from "@jahia/moonstone";
import { useTranslation } from "react-i18next";
import { getSiteKey, getSearchLanguage } from "../shared/navigationUtils.ts";
import s from "./KFindHeader.module.css";

type KFindHeaderProps = {
  readonly searchValue: string;
  readonly onSearchChange: (value: string) => void;
  readonly onSearchClear: () => void;
  readonly onTriggerSearch: (value: string) => void;
  readonly focusOnField?: boolean;
  readonly inputWrapperRef: React.RefObject<HTMLDivElement>;
};

export const KFindHeader = ({
  searchValue,
  onSearchChange,
  onSearchClear,
  onTriggerSearch,
  focusOnField,
  inputWrapperRef,
}: KFindHeaderProps) => {
  const { t } = useTranslation();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onTriggerSearch(searchValue);
  };

  // Moonstone Input (v2.17.5 here) has no prop to control clear-button tab focus,
  // so we patch it after render.
  useEffect(() => {
    const wrapper = inputWrapperRef.current;
    if (!wrapper) {
      return;
    }

    const patch = () => {
      wrapper
        .querySelectorAll<HTMLElement>(".moonstone-baseInput_clearButton")
        .forEach((el) => {
          el.tabIndex = -1;
        });
    };

    patch();
    const observer = new MutationObserver(patch);
    observer.observe(wrapper, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [inputWrapperRef]);

  return (
      <div className={s.header}>
          <div className={s.titleRow}>
              <Typography variant="title">
                  {t("search.modal.title", "Welcome to kFind")}
              </Typography>
              <Typography variant="caption" className={s.siteInfo}>
                  {t("search.modal.siteInfo", "Searching in {{site}}, {{language}}", {
            site: getSiteKey(),
            language: getSearchLanguage(),
          })}
              </Typography>
          </div>
          <div ref={inputWrapperRef} data-kfind-search-input-wrapper="true">
              <form
          role="search"
          data-kfind-search-form="true"
          onSubmit={handleSubmit}
              >
                  <Input
            size="big"
            type="search"
            placeholder={t("search.placeholder", "Search…")}
            value={searchValue}
            icon={<Search/>}
            focusOnField={focusOnField}
            onChange={(e) => onSearchChange(e.target.value)}
            onClear={onSearchClear}
          />
              </form>
          </div>
      </div>
  );
};
