/**
 * Central search orchestration hook — registry-driven.
 *
 * Reads all registered `quickFindProvider` entries from the Jahia UI registry
 * and manages their lifecycle generically. Has no knowledge of specific
 * providers (augmented, JCR, features, etc.).
 *
 * Responsibilities:
 * - Reads `getRegisteredProviders()` on mount, filters by `isEnabled()`,
 *   creates `QuickFindResultsProvider` instances via `createSearchProvider(client)`.
 * - Runs `checkAvailability()` for providers that declare it.
 * - Debounces user keystrokes with a single global timer.
 * - Fires `search(query, 0)` on each active provider after debounce.
 * - Manages per-provider state (hits, loading, hasMore, page) via `useReducer`.
 * - Exposes pagination helpers (`loadNextPage`) per provider.
 *
 * @param searchValue — The raw (untrimmed) value from the search input.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  getRegisteredProviders,
  type QuickFindProvider,
  type QuickFindResultsProvider,
  type SearchHit,
} from "../../quick-find-providers/types.ts";
import { getMinSearchChars, getDebounceDelay } from "./configUtils.ts";

// ── Per-provider state ──
// Each provider gets its own independent state slice, keyed by the provider's
// registry key (e.g. "quick-find-jcr-media"). This allows each section to load,
// paginate, and error independently.
type ProviderState = {
  allHits: SearchHit[];
  loading: boolean;
  hasMore: boolean;
  page: number;
};

const INITIAL_PROVIDER_STATE: ProviderState = {
  allHits: [],
  loading: false,
  hasMore: false,
  page: 0,
};

// ── Reducer ──
// All state mutations flow through this reducer so that batched dispatches
// (e.g. multiple providers completing around the same time) are handled atomically.
type State = {
  providerStates: Record<string, ProviderState>;
  currentQuery: string;
  availabilityResolved: boolean;
  providerAvailability: Record<string, boolean>;
};

type Action =
  | { type: "SEARCH_START"; key: string }
  | {
      type: "SEARCH_SUCCESS";
      key: string;
      hits: SearchHit[];
      hasMore: boolean;
      page: number;
    }
  | { type: "SEARCH_ERROR"; key: string }
  | { type: "SET_CURRENT_QUERY"; query: string }
  | { type: "RESET_ALL"; keys: string[] }
  | { type: "SET_AVAILABILITY"; key: string; available: boolean }
  | { type: "AVAILABILITY_COMPLETE" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SEARCH_START":
      return {
        ...state,
        providerStates: {
          ...state.providerStates,
          [action.key]: {
            ...(state.providerStates[action.key] ?? INITIAL_PROVIDER_STATE),
            loading: true,
          },
        },
      };
    case "SEARCH_SUCCESS": {
      // On page 0: replace all hits (new search).
      // On page N > 0: append to existing hits (pagination).
      const prev = state.providerStates[action.key] ?? INITIAL_PROVIDER_STATE;
      const allHits =
        action.page === 0 ? action.hits : [...prev.allHits, ...action.hits];
      return {
        ...state,
        providerStates: {
          ...state.providerStates,
          [action.key]: {
            allHits,
            loading: false,
            hasMore: action.hasMore,
            page: action.page,
          },
        },
      };
    }

    case "SEARCH_ERROR":
      return {
        ...state,
        providerStates: {
          ...state.providerStates,
          [action.key]: {
            ...(state.providerStates[action.key] ?? INITIAL_PROVIDER_STATE),
            loading: false,
          },
        },
      };
    case "SET_CURRENT_QUERY":
      return { ...state, currentQuery: action.query };
    case "RESET_ALL": {
      const providerStates: Record<string, ProviderState> = {};
      for (const key of action.keys) {
        providerStates[key] = INITIAL_PROVIDER_STATE;
      }

      return { ...state, providerStates, currentQuery: "" };
    }

    case "SET_AVAILABILITY":
      return {
        ...state,
        providerAvailability: {
          ...state.providerAvailability,
          [action.key]: action.available,
        },
      };
    case "AVAILABILITY_COMPLETE":
      return { ...state, availabilityResolved: true };
    default:
      return state;
  }
}

// ── Public types ──
export type SearchOrchestrationResult = {
  providers: {
    key: string;
    registration: QuickFindProvider;
    state: ProviderState;
    loadNextPage: () => void;
  }[];
  currentQuery: string;
  triggerSearch: (value: string) => void;
};

// ── Hook ──
export const useSearchOrchestration = (
  searchValue: string,
): SearchOrchestrationResult => {
  // ── 1. Discover and initialize providers (once on mount) ──
  // We use a ref (not state) because the provider list is stable for the
  // component's lifetime — providers are discovered from the registry once
  // and never change. This avoids unnecessary re-renders.
  const providersRef = useRef<
    | {
        key: string;
        registration: QuickFindProvider;
        provider: QuickFindResultsProvider;
      }[]
    | null
  >(null);

  if (providersRef.current === null) {
    const client = window.jahia?.apolloClient ?? null;
    const all = getRegisteredProviders().filter((d) => d.isEnabled());
    providersRef.current = all.map((reg) => ({
      key: (reg as unknown as { key: string }).key,
      registration: reg,
      provider: client
        ? reg.createSearchProvider(client)
        : {
            search: () => Promise.resolve({ hits: [], hasMore: false }),
            reset: () => {},
          },
    }));
  }

  const providers = providersRef.current;
  const providerKeys = useMemo(() => providers.map((d) => d.key), [providers]);

  // ── 2. State ──
  const initialState: State = useMemo(() => {
    const providerStates: Record<string, ProviderState> = {};
    for (const key of providerKeys) {
      providerStates[key] = INITIAL_PROVIDER_STATE;
    }

    // Optimistically mark as resolved if no provider has checkAvailability.
    const needsCheck = providers.some((d) => d.registration.checkAvailability);
    return {
      providerStates,
      currentQuery: "",
      availabilityResolved: !needsCheck,
      providerAvailability: {},
    };
  }, [providerKeys, providers]);

  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Mutable refs for callbacks ──
  const stateRef = useRef(state);
  stateRef.current = state;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 3. Availability checks ──
  // Some providers need an async check (e.g. "is augmented search enabled
  // on this site?") before they can be shown. We defer these checks until
  // the user first types enough characters — no wasted network requests
  // if the modal is opened and closed without searching.
  const availabilityTriggeredRef = useRef(false);

  const triggerAvailabilityChecks = useCallback(() => {
    if (availabilityTriggeredRef.current) {
      return;
    }

    availabilityTriggeredRef.current = true;

    const client = window.jahia?.apolloClient ?? null;
    if (!client) {
      dispatch({ type: "AVAILABILITY_COMPLETE" });
      return;
    }

    const checks = providers
      .filter((d) => d.registration.checkAvailability)
      .map((d) =>
        d.registration.checkAvailability!(client)
          .then((available) => {
            dispatch({ type: "SET_AVAILABILITY", key: d.key, available });
          })
          .catch(() => {
            // Safe fallback: treat failed availability checks as unavailable.
            dispatch({
              type: "SET_AVAILABILITY",
              key: d.key,
              available: false,
            });
          }),
      );

    if (checks.length === 0) {
      dispatch({ type: "AVAILABILITY_COMPLETE" });
    } else {
      Promise.all(checks).finally(() => {
        dispatch({ type: "AVAILABILITY_COMPLETE" });
      });
    }
  }, [providers]);

  // ── 4. Search execution ──
  const executeSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < getMinSearchChars()) {
        return;
      }

      if (!stateRef.current.availabilityResolved) {
        return;
      }

      dispatch({ type: "SET_CURRENT_QUERY", query: trimmed });

      for (const d of providers) {
        // Skip providers that failed availability check.
        if (d.registration.checkAvailability) {
          const available = stateRef.current.providerAvailability[d.key];
          if (available === false) {
            continue;
          }

          // If availability hasn't been resolved yet for this specific provider, skip.
          if (available === undefined) {
            continue;
          }
        }

        // Skip providers that can't handle this query.
        if (d.registration.canHandle && !d.registration.canHandle(trimmed)) {
          continue;
        }

        dispatch({ type: "SEARCH_START", key: d.key });
        d.provider
          .search(trimmed, 0)
          .then((result) => {
            dispatch({
              type: "SEARCH_SUCCESS",
              key: d.key,
              hits: result.hits,
              hasMore: result.hasMore,
              page: 0,
            });
          })
          .catch(() => {
            dispatch({ type: "SEARCH_ERROR", key: d.key });
          });
      }
    },
    [providers],
  );

  // Stable ref for triggerSearch so effects don't re-fire.
  const executeSearchRef = useRef(executeSearch);
  executeSearchRef.current = executeSearch;

  // Public imperative trigger (e.g. pressing Enter).
  const triggerSearch = useCallback(
    (value: string) => executeSearchRef.current(value),
    [],
  );

  // ── 5. Reset all providers ──
  const resetAll = useCallback(() => {
    for (const d of providers) {
      d.provider.reset();
    }

    dispatch({ type: "RESET_ALL", keys: providerKeys });
  }, [providers, providerKeys]);

  // ── 6. Effect: debounce keystrokes ──
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (searchValue.trim().length < getMinSearchChars()) {
      resetAll();
      return;
    }

    // Kick off availability checks the first time minChars is reached.
    triggerAvailabilityChecks();

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      executeSearchRef.current(searchValue);
    }, getDebounceDelay());

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  // ── 7. Effect: re-fire search when availability resolves ──
  // Availability checks are async — they may resolve AFTER the initial
  // search already fired. When that happens, we re-fire the search so that
  // newly-available providers get their results too. We intentionally do NOT
  // clear an active debounce here, so we don't interrupt the user's typing.
  useEffect(() => {
    if (!state.availabilityResolved) {
      return;
    }

    if (
      !debounceRef.current &&
      searchValue.trim().length >= getMinSearchChars()
    ) {
      executeSearchRef.current(searchValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.availabilityResolved]);

  // ── 8. Build active providers for the consumer ──
  // Filters out providers that are disabled or failed their availability
  // check, then wraps each surviving provider with its current state and
  // a `loadNextPage` callback for client-driven pagination.
  const activeProviders: SearchOrchestrationResult["providers"] =
    useMemo(() => {
      return providers
        .filter((d) => {
          // Must be enabled (already filtered on mount, but defensive).
          if (!d.registration.isEnabled()) {
            return false;
          }

          // If has availability check, must be resolved and true.
          if (d.registration.checkAvailability) {
            const available = state.providerAvailability[d.key];
            if (available !== true) {
              return false;
            }
          }

          return true;
        })
        .map((d) => ({
          key: d.key,
          registration: d.registration,
          state: state.providerStates[d.key] ?? INITIAL_PROVIDER_STATE,
          loadNextPage: () => {
            const ds = stateRef.current.providerStates[d.key];
            if (!ds || ds.loading || !ds.hasMore) {
              return;
            }

            const nextPage = ds.page + 1;
            const query = stateRef.current.currentQuery;
            if (!query) {
              return;
            }

            dispatch({ type: "SEARCH_START", key: d.key });
            d.provider
              .search(query, nextPage)
              .then((result) => {
                dispatch({
                  type: "SEARCH_SUCCESS",
                  key: d.key,
                  hits: result.hits,
                  hasMore: result.hasMore,
                  page: nextPage,
                });
              })
              .catch(() => {
                dispatch({ type: "SEARCH_ERROR", key: d.key });
              });
          },
        }));
    }, [providers, state.providerStates, state.providerAvailability]);

  return {
    providers: activeProviders,
    currentQuery: state.currentQuery,
    triggerSearch,
  };
};
