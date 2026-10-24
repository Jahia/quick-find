/**
 * Generic result-item component used by every search result list.
 *
 * A 48px tile leads the row: the thumbnail of the node, or an icon of its kind.
 * Renders two or three lines depending on whether an excerpt is provided:
 * - Line 1: title (truncated at 80 chars)
 * - Line 2: type + path, on one line and cut at its start
 * - Line 3 (optional): HTML excerpt with highlighted terms
 *
 * When no excerpt is present the item uses a compact height (64px vs 96px).
 *
 * Keyboard:
 * - Enter / click → onAction (navigate to the node)
 * - E → onSecondaryAction (open content editor, if available)
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Button,
  Edit,
  File,
  FileContent,
  Page,
  Setting,
  Subdirectory,
  Tooltip,
  Typography,
} from "@jahia/moonstone";
import { useTranslation } from "react-i18next";
import { getResultTitleMaxLength } from "../shared/configUtils.ts";
import s from "./ResultCard.module.css";

const KIND_ICONS = {
  page: Page,
  file: File,
  content: FileContent,
  feature: Setting,
};

// The features provider sets a translated label as the type, with no namespace prefix.
const getKind = (type: string): keyof typeof KIND_ICONS => {
  if (type === "jnt:page") {
    return "page";
  }

  if (type === "jnt:file") {
    return "file";
  }

  return type.includes(":") ? "content" : "feature";
};

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
  const kind = getKind(type);
  const KindIcon = KIND_ICONS[kind];

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
              {thumbnailUrl ? (
                  <img
            className={s.thumbnail}
            src={thumbnailUrl}
            alt=""
            loading="lazy"
          />
        ) : (
            <span className={`${s.typeTile} ${s[kind]}`} aria-hidden="true">
                <KindIcon width={22} height={22}/>
            </span>
        )}
              <div className={s.resultRowInfo}>
                  <Typography isNowrap variant="body" weight="bold">{displayTitle}</Typography>
                  <div className={s.resultRowMeta}>
                      <Typography isNowrap variant="caption" weight="semiBold" className={s.resultRowType}>
                          {type}
                      </Typography>
                      <Typography isNowrap variant="caption" className={s.resultRowPath} title={path}>
                          <span dir="ltr">{path}</span>
                      </Typography>
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
              variant="ghost"
              icon={<Subdirectory width={20} height={20}/>}
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
                variant="ghost"
                icon={<Edit width={20} height={20}/>}
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
