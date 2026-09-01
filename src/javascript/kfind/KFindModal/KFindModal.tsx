/**
 * Root modal component for the kFind search dialog.
 *
 * - Opens/closes via Cmd+K / Ctrl+K / Escape or the `kfind:open-search` custom event.
 * - Wraps the search panel in an ApolloProvider using jcontent's captured client.
 * - Footer displays keyboard hints and build timestamp.
 *
 * This component mounts once at app startup (see routes.tsx) and persists
 * for the lifetime of the page.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApolloProvider } from "@apollo/client";
import { Modal, ModalFooter, Typography } from "@jahia/moonstone";
import { KFindPanel } from "../KFindPanel/KFindPanel.tsx";
import s from "./KFindModal.module.css";

function logModalDebug(message: string, error: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(`[kfind][modal] ${message}`, error);
}

export const KFindModal = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Apollo client is provided by Jahia's platform on window.jahia.apolloClient
  // before any module's registerRoutes fires — no async wait needed.
  const apolloClient = window.jahia?.apolloClient;

  // ── Keyboard shortcut & custom event listeners ──
  // Registered on both the iframe document and the parent document so the
  // shortcut works regardless of which frame has focus.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }

      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    const handleOpenEvent = () => setIsOpen(true);

    const targets: Document[] = [document];
    try {
      if (window.parent && window.parent.document && window.parent !== window) {
        targets.push(window.parent.document);
      }
    } catch (error) {
      // Cross-origin parent — skip
      logModalDebug("Unable to register parent keyboard listener", error);
    }

    targets.forEach((targetDoc) =>
      targetDoc.addEventListener("keydown", handleKeyDown),
    );
    window.addEventListener("kfind:open-search", handleOpenEvent);
    return () => {
      targets.forEach((targetDoc) =>
        targetDoc.removeEventListener("keydown", handleKeyDown),
      );
      window.removeEventListener("kfind:open-search", handleOpenEvent);
    };
  }, []);

  if (!apolloClient) {
    console.error(
      "[kfind] Apollo client is not available — modal cannot render.",
    );
    return null;
  }

  return (
      <Modal
      isOpen={isOpen}
      size="full"
      className={`search-modal ${s.modalWidth}`}
      data-kfind-modal="true"
      onOpenChange={setIsOpen}
      >
          <>
              <div className={s.content}>
                  <ApolloProvider client={apolloClient}>
                      <KFindPanel focusOnField onNavigate={() => setIsOpen(false)}/>
                  </ApolloProvider>
              </div>
              <ModalFooter>
                  <div className={s.footerLayout}>
                      <div className={s.footerHints}>
                          <Typography variant="caption">
                              {t(
                  "search.modal.hint",
                  "Press Ctrl+K or ⌘K to open · Esc to close · Tab to navigate · Enter to go · E to edit",
                )}
                          </Typography>
                          <Typography variant="caption">
                              {t(
                  "search.modal.reportIssuePrefix",
                  "Report bugs and improvements at",
                )}{" "}
                              <a
                  className={s.issueLink}
                  href="https://github.com/Jahia/kfind/issues"
                  target="_blank"
                  rel="noreferrer"
                              >
                                  https://github.com/Jahia/kfind/issues
                              </a>
                          </Typography>
                      </div>
                      {/* Build time shown only in dev builds */}
                      {import.meta.env.DEV && (
                      <Typography variant="caption" style={{ opacity: 0.4 }}>
                          {window.contextJsParameters.kfind?.buildTime ?? ""}
                      </Typography>
            )}
                  </div>
              </ModalFooter>
          </>
      </Modal>
  );
};
