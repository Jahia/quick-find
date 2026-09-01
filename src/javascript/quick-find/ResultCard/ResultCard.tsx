/**
 * Generic result-item component used by every search result list.
 *
 * Renders two or three lines depending on whether an excerpt is provided:
 * - Line 1: title (truncated at 80 chars)
 * - Line 2: type badge (Chip) + path
 * - Line 3 (optional): HTML excerpt with highlighted terms
 *
 * When no excerpt is present the item uses a compact height (56px vs 96px).
 *
 * Keyboard:
 * - Enter / click → onAction (navigate to the node)
 * - E → onSecondaryAction (open content editor, if available)
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Button,
  Chip,
  Edit,
  Subdirectory,
  Tooltip,
  Typography,
} from "@jahia/moonstone";
import { useTranslation } from "react-i18next";
import { getResultTitleMaxLength } from "../shared/configUtils.ts";
import s from "./ResultCard.module.css";

type ResultCardProps = {
  readonly title: string;
  readonly type: string;
  readonly path: string;
  readonly excerpt?: string | null;
  readonly thumbnailUrl?: string | null;
  readonly rowIndex?: number;
  readonly tabIndex?: number;
  /** Called when the row is clicked or Enter is pressed. */
  readonly onAction: () => void;
  /** Optional secondary action button (e.g. edit). Hidden by default, shown on hover. */
  readonly onSecondaryAction?: () => void;
};

export const ResultCard = ({
  title,
  type,
  path,
  excerpt,
  thumbnailUrl,
  rowIndex,
  tabIndex = -1,
  onAction,
  onSecondaryAction,
}: ResultCardProps) => {
  const { t } = useTranslation();
  const maxNameLength = getResultTitleMaxLength();

  const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onAction();
      return;
    }

    if (onSecondaryAction && (event.key === "e" || event.key === "E")) {
      event.preventDefault();
      onSecondaryAction();
    }
  };

  const displayTitle =
    title.length > maxNameLength ? title.slice(0, maxNameLength) + "…" : title;

  return (
      <li
      data-quick-find-result
      data-quick-find-result-row="true"
      data-quick-find-result-index={rowIndex}
      className={excerpt ? s.resultRow : s.resultRowCompact}
      tabIndex={tabIndex}
      onClick={onAction}
      onKeyDown={handleRowKeyDown}
      >
          <div className={s.resultRowContent}>
              {thumbnailUrl && (
              <img
            className={s.thumbnail}
            src={thumbnailUrl}
            alt=""
            loading="lazy"
          />
        )}
              <div className={s.resultRowInfo}>
                  <Typography variant="subHeading">{displayTitle}</Typography>
                  <div className={s.resultRowMeta}>
                      <Chip color="accent" label={type}/>
                      <Typography variant="caption">{path}</Typography>
                  </div>
                  {excerpt && (
                  <Typography variant="caption" className={s.resultRowExcerpt}>
                      {/* Excerpt is sanitized upstream before rendering. */}
                      {/* eslint-disable-next-line react/no-danger */}
                      <span dangerouslySetInnerHTML={{ __html: excerpt }}/>
                  </Typography>
          )}
              </div>

              <div className={s.resultRowActions}>
                  <Tooltip label="Enter">
                      <Button
              size="big"
              variant="ghost"
              icon={<Subdirectory width={24} height={24}/>}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                onAction();
              }}
            />
                  </Tooltip>
                  {onSecondaryAction && (
                  <Tooltip label={t("search.action.edit", "Edit")}>
                      <Button
                size="big"
                variant="ghost"
                icon={<Edit width={24} height={24}/>}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onSecondaryAction();
                }}
              />
                  </Tooltip>
          )}
              </div>
          </div>
      </li>
  );
};
