/**
 * Jahia context resolution and jContent SPA navigation helpers.
 */
import { registry } from "@jahia/ui-extender";

type JContentGotoPayload = {
  site: string;
  language: string;
  mode: string;
  path: string;
  params?: Record<string, unknown>;
};

type JContentUtils = {
  buildUrl?: (data: {
    app?: string;
    site?: string;
    language?: string;
    mode?: string;
    path?: string;
    template?: string;
    params?: Record<string, unknown>;
  }) => string;
};

type ReduxActionEntry = {
  action?: (payload?: unknown) => unknown;
};

function logNavigationDebug(message: string, error: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(`[quick-find][navigation] ${message}`, error);
}

function logNavigationInfo(message: string, data?: unknown): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.debug(`[quick-find][navigation] ${message}`, data);
}

export function getSiteKey(): string {
  if (window.contextJsParameters.siteKey) {
    return window.contextJsParameters.siteKey;
  }

  // Fallback: parse from URL pattern /administration/{siteKey}/settings/...
  const parts = window.location.pathname.split("/");
  const adminIndex = parts.indexOf("administration");
  return adminIndex !== -1 && parts[adminIndex + 1]
    ? parts[adminIndex + 1]
    : "default";
}

export function getUiLanguage(): string {
  return window.contextJsParameters.uilang ?? "en";
}

export function getSearchLanguage(): string {
  return window.contextJsParameters.lang ?? "en";
}

/**
 * Pushes a URL in the parent window history and dispatches a synthetic
 * popstate so jContent's router reacts without a full page reload.
 * Centralized to keep feature-navigation and content-navigation behavior aligned.
 */
export function pushParentNavigation(url: string): void {
  // No documented app-shell API was found for cross-MFE route navigation.
  const navKey = String(Date.now());
  window.parent.history.pushState({ key: navKey }, "", url);
  window.parent.dispatchEvent(
    new PopStateEvent("popstate", { state: { key: navKey } }),
  );
}

/**
 * Navigates the parent Jahia shell to an in-app route path (admin routes,
 * jExperience, etc.) using the connected React Router history when available,
 * falling back to a raw pushState + synthetic popstate.
 *
 * `path` must be the in-app path WITHOUT the Jahia context root
 * (e.g. `/administration/mysite/jExperience/...`).
 *
 * The React Router history was created with `basename: urlbase` (typically `/jahia`),
 * so `routerHistory.push(path)` and the raw `pushState('/jahia' + path)` fallback
 * are functionally equivalent.
 */
export function pushRouteNavigation(path: string): void {
  // No stable app-shell API is documented for imperative route changes.
  const routerHistory = window.parent.jahia?.routerHistory;
  if (routerHistory) {
    // Opportunistic bridge: use it only when this runtime-specific object exists.
    routerHistory.push(path);
  } else {
    // Fallback kept because we could not identify another upstream navigation hook.
    pushParentNavigation(`/jahia${path}`);
  }
}

function getParentReduxStore(): {
  dispatch: (action: unknown) => unknown;
} | null {
  // This MFE runs in an iframe and relies on the parent jContent Redux store
  // for navigation and view-mode actions, so we bridge to it defensively.
  return window.parent.jahia?.reduxStore ?? null;
}

function dispatchParent(action: unknown): void {
  const store = getParentReduxStore();
  if (!store) {
    return;
  }

  try {
    store.dispatch(action);
  } catch (error) {
    logNavigationDebug("Unable to dispatch redux action", error);
  }
}

/**
 * Typed wrapper around runtime registry lookup.
 * Uses a guarded `any` bridge because registry typings do not expose `get`.
 */
function getRegistryEntry<T>(type: string, key: string): T | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (registry as any).get?.(type, key) as T;
}

function tryJContentGoto(payload: JContentGotoPayload): boolean {
  const store = getParentReduxStore();
  if (!store) {
    return false;
  }

  try {
    const entry = getRegistryEntry<ReduxActionEntry>(
      "redux-action",
      "jcontentGoto",
    );

    if (!entry?.action) {
      return false;
    }

    store.dispatch(entry.action(payload));
    return true;
  } catch (error) {
    logNavigationDebug("Unable to use jcontentGoto redux action", error);
    return false;
  }
}

function buildJContentRoutePath(payload: JContentGotoPayload): string | null {
  try {
    const utils = getRegistryEntry<JContentUtils>("jcontent", "utils");
    if (!utils?.buildUrl) {
      return null;
    }

    return utils.buildUrl({
      app: "jcontent",
      site: payload.site,
      language: payload.language,
      mode: payload.mode,
      path: payload.path,
      params: payload.params ?? {},
    });
  } catch (error) {
    logNavigationDebug("Unable to use jcontent buildUrl utility", error);
    return null;
  }
}

function setPageBuilderViewMode(): void {
  logNavigationInfo("setPageBuilderViewMode dispatch", {
    action: "SET_TABLE_VIEW_MODE",
    payload: "pageBuilder",
  });
  dispatchParent({
    type: "SET_TABLE_VIEW_MODE",
    payload: "pageBuilder",
  });
}

/**
 * Navigates the parent jContent SPA to the given node path by pushing a new
 * URL into its history and firing a synthetic popstate so React Router picks
 * it up — without a full page reload.
 *
 * For pages and content-folders modes we force Page Builder view by both
 * setting localStorage (read by extractParamsFromUrl on URL change) and
 * dispatching SET_TABLE_VIEW_MODE to Redux so jContent's store listener
 * does not overwrite localStorage with the stale viewMode after navigation.
 */
export function locateInJContent(nodePath: string, nodeType?: string): void {
  const site = getSiteKey();
  const language = getUiLanguage();
  const siteBase = `/sites/${site}`;

  let parentPath = nodePath;
  if (!parentPath || !parentPath.startsWith(siteBase)) {
    parentPath = siteBase;
  }

  let mode: string;
  let jcontentPath: string;
  let mediaPreviewPath: string | null = null;

  const normalizedNodeType = nodeType?.toLowerCase() ?? "";
  const isMediaNodeType =
    normalizedNodeType === "jnt:file" || normalizedNodeType === "jnt:folder";

  if (parentPath.startsWith(`${siteBase}/files`) || isMediaNodeType) {
    mode = "media";
    // Navigate to the parent folder so the file is visible in the listing.
    const filesRoot = `${siteBase}/files`;
    const lastSlash = parentPath.lastIndexOf("/");
    const folderPath =
      lastSlash > filesRoot.length
        ? parentPath.substring(0, lastSlash)
        : parentPath;
    jcontentPath = folderPath;
    mediaPreviewPath = nodePath;
  } else if (parentPath.startsWith(`${siteBase}/contents`)) {
    mode = "content-folders";
    jcontentPath = parentPath;
  } else {
    mode = "pages";
    jcontentPath = parentPath;
  }

  const gotoPayload: JContentGotoPayload = {
    site,
    language,
    mode,
    path: jcontentPath,
    params: {},
  };

  logNavigationInfo("locateInJContent resolved payload", {
    nodePath,
    nodeType,
    site,
    language,
    mode,
    jcontentPath,
  });

  // Reuse jContent's own redux navigation action when available.
  const navigatedWithJContent = tryJContentGoto(gotoPayload);
  if (navigatedWithJContent) {
    logNavigationInfo("navigation strategy", { strategy: "jcontentGoto" });
  } else {
    // If jcontentGoto is unavailable, no alternative official jContent API was found.
    logNavigationInfo("navigation strategy", {
      strategy: "buildUrl-or-fallback",
    });
    const builtPath = buildJContentRoutePath(gotoPayload);
    if (builtPath) {
      logNavigationInfo("navigation strategy", {
        strategy: "jcontent-buildUrl",
        builtPath,
      });
      pushRouteNavigation(builtPath);
    } else {
      // Last resort fallback if jContent registry entries are unavailable.
      const fallbackPath = jcontentPath.replace(siteBase, "") || "/";
      const encodedPath = fallbackPath.replace(/[^/]/g, encodeURIComponent);
      logNavigationInfo("navigation strategy", {
        strategy: "manual-fallback",
        fallbackPath,
      });
      pushRouteNavigation(
        `/jcontent/${site}/${language}/${mode}${encodedPath}`,
      );
    }
  }

  // Reuse jContent reducer action to force Page Builder mode.
  if (mode === "pages" || mode === "content-folders") {
    setPageBuilderViewMode();
  }

  // For media files: open jContent's preview drawer for the located file.
  // CM_DRAWER_STATES.SHOW = 2 (from jcontent redux/JContent.redux.js)
  if (mediaPreviewPath) {
    logNavigationInfo("open preview dispatch", {
      selectionAction: "CM_SET_PREVIEW_SELECTION",
      stateAction: "CM_SET_PREVIEW_STATE",
      previewPath: mediaPreviewPath,
    });
    dispatchParent({
      type: "CM_SET_PREVIEW_SELECTION",
      payload: mediaPreviewPath,
    });
    dispatchParent({
      type: "CM_SET_PREVIEW_STATE",
      payload: 2,
    });
  }
}
