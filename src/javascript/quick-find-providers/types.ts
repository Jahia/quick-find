/**
 * Provider API types for the quickFindProvider registry pattern.
 *
 * Architecture overview:
 * ────────────────────
 * QuickFind uses a plugin-based architecture where each search category
 * (features, JCR media, augmented search, URL reverse lookup, etc.) is
 * a self-contained "provider" that registers itself in the Jahia UI
 * extender registry under type `"quickFindProvider"`.
 *
 * The orchestration layer (`useSearchOrchestration`) and the rendering
 * layer (`QuickFindPanel`) are fully generic — they discover providers at
 * runtime via `getRegisteredProviders()` and have no knowledge of
 * individual provider implementations.
 *
 * To add a new search section (even from a separate Jahia module):
 *   1. Create a file that calls `registry.add("quickFindProvider", "my-key", { ...QuickFindProvider })`
 *   2. Import it at module init time.
 *   That's it — the new provider will appear in the search panel automatically.
 *
 * Why imperative providers instead of React hooks?
 * ────────────────────────────────────────────────
 * React hooks cannot be called in a loop over a dynamic list of providers.
 * Instead, each provider exposes a `createSearchProvider()` factory that
 * returns a plain object with `search()` and `reset()` methods. These
 * call `apolloClient.query()` directly (imperative), bypassing the need
 * for `useLazyQuery` or any hook-based API. The orchestration layer
 * manages all React state centrally via `useReducer`.
 */
import { registry } from "@jahia/ui-extender";
import type { ApolloClient, NormalizedCacheObject } from "@apollo/client";

/** A single content search result (returned by both augmented search and JCR queries). */
export type SearchHit = {
  /** Unique identifier — typically the JCR node UUID. */
  id: string;
  /** Absolute JCR path (e.g. /sites/mysite/home/about). */
  path: string;
  /** Human-readable name shown in the result list. */
  displayableName: string;
  /** HTML excerpt with search-term highlights, or null if unavailable. */
  excerpt: string | null;
  /** JCR primary node type (e.g. jnt:page, jnt:file). */
  nodeType: string;
  /** URL to a thumbnail image, if available (e.g. for media nodes). */
  thumbnailUrl?: string | null;
};

export type ApolloClientInstance = ApolloClient<NormalizedCacheObject>;

/** The result of a single search page. */
export type SearchResult = {
  hits: SearchHit[];
  hasMore: boolean;
};

/**
 * Imperative search provider created by a provider's `createSearchProvider()` factory.
 *
 * Each provider instance is long-lived (created once on mount) and manages
 * its own query execution. The orchestration layer calls `search()` and
 * `reset()` but never inspects internal provider state — all results flow
 * back through the returned `SearchResult` promise.
 *
 * Providers are responsible for their own stale-response filtering: if a
 * new `search()` call arrives before a previous one resolves, the provider
 * should discard the outdated response (typically via an `activeQuery` guard).
 */
export type QuickFindResultsProvider = {
  /** Execute a search and return results for the given page (0-based). */
  search(query: string, page: number): Promise<SearchResult>;
  /** Reset any internal state (e.g. active query tracking for stale response filtering). */
  reset(): void;
};

/**
 * Shape registered in the Jahia UI registry under type `"quickFindProvider"`.
 *
 * Each provider declares everything the orchestration and rendering layers
 * need — without those layers knowing what kind of data the provider handles.
 */
export type QuickFindProvider = {
  /** Display order — lower values appear first. */
  priority: number;
  /** I18n key for the section title. */
  title: string;
  /** Fallback title when the i18n key is not resolved. */
  titleDefault: string;
  /** Whether this provider is enabled (reads its own config key). */
  isEnabled: () => boolean;
  /** Maximum results to show initially (reads its own config key). */
  maxResults: () => number;
  /**
   * Optional async one-time availability check (e.g. site mixin query).
   * Returns true if the provider should be active for the current site.
   * When absent, the provider is always available (if enabled).
   * The orchestration layer caches the result per mount.
   */
  checkAvailability?: (client: ApolloClientInstance) => Promise<boolean>;
  /**
   * Optional query filter — if provided, the provider only fires when
   * this returns true for the current query string (e.g. URL-like input).
   * When absent, the provider fires for every query.
   */
  canHandle?: (query: string) => boolean;
  /** Factory that creates the imperative search provider. Called once on mount. */
  createSearchProvider: (client: ApolloClientInstance) => QuickFindResultsProvider;
  /** Primary action when a result row is clicked (e.g. navigate to node). */
  locate: (hit: SearchHit) => void;
  /** Optional secondary action (e.g. open content editor). Absent = no edit button. */
  edit?: (hit: SearchHit) => void;
};

/**
 * Type guard to safely check if a registry entry is a QuickFindProvider.
 */
function isQuickFindProvider(entry: unknown): entry is QuickFindProvider {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const maybe = entry as Record<string, unknown>;
  return (
    typeof maybe.priority === "number" &&
    typeof maybe.title === "string" &&
    typeof maybe.titleDefault === "string" &&
    typeof maybe.isEnabled === "function" &&
    typeof maybe.maxResults === "function" &&
    typeof maybe.createSearchProvider === "function" &&
    typeof maybe.locate === "function"
  );
}

/**
 * Reads all `quickFindProvider` registrations from the Jahia UI registry,
 * sorted by ascending priority (lower values appear first in the UI).
 *
 * `registry.find()` returns `StoredService[]` which is a generic wrapper.
 * We use a type guard to filter and type safely.
 */
export function getRegisteredProviders(): QuickFindProvider[] {
  const entries = registry.find({ type: "quickFindProvider" });

  const providers: QuickFindProvider[] = [];
  for (const entry of entries) {
    if (isQuickFindProvider(entry)) {
      providers.push(entry);
    }
  }

  return providers.sort((a, b) => a.priority - b.priority);
}
