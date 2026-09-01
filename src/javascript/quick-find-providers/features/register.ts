/**
 * Registers the UI features search provider.
 *
 * Scans Jahia's UI extender registry for `adminRoute` and
 * `jExperienceMenuEntry` items matching the search query.
 * Results are computed synchronously (no network request) —
 * the `search()` method resolves instantly with a pre-filtered list.
 *
 * Route resolution logic:
 * - `jExperienceMenuEntry` → `/jexperience/{siteKey}/{path}`
 * - `adminRoute` targeting jcontent → `/jcontent/{siteKey}/{lang}/apps/{key}`
 * - `adminRoute` targeting server → `/administration/{key}`
 * - Other admin routes → `/administration/{siteKey}/{key}`
 */
import { registry } from "@jahia/ui-extender";
import i18n from "i18next";
import type {
  QuickFindProvider,
  QuickFindResultsProvider,
  SearchHit,
} from "../types.ts";
import {
  getSiteKey,
  getSearchLanguage,
  pushRouteNavigation,
} from "../../quick-find/shared/navigationUtils.ts";
import {
  isProviderEnabled,
  getProviderMaxResults,
} from "../../quick-find/shared/configUtils.ts";

type FeatureRegistryEntry = {
  type: "adminRoute" | "jExperienceMenuEntry";
  key: string;
  label?: string;
  path?: string;
  targets?: Array<{ id: string }>;
};

function isFeatureRegistryEntry(entry: unknown): entry is FeatureRegistryEntry {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const maybe = entry as Record<string, unknown>;
  const hasAllowedType =
    maybe.type === "adminRoute" || maybe.type === "jExperienceMenuEntry";
  return hasAllowedType && typeof maybe.key === "string";
}

function getFeatureRegistryEntries(): FeatureRegistryEntry[] {
  const adminRoutes = registry.find({
    type: "adminRoute",
  });
  const jExperienceMenuEntries = registry.find({
    type: "jExperienceMenuEntry",
  });
  const combined = [...adminRoutes, ...jExperienceMenuEntries];

  const entries: FeatureRegistryEntry[] = [];
  for (const item of combined) {
    if (isFeatureRegistryEntry(item)) {
      entries.push(item);
    }
  }

  return entries;
}

function buildFeatureRoute(entry: FeatureRegistryEntry): string {
  // This route resolution should be provided by the Jahia UI framework,
  // but no shared helper is currently exposed for this use case.
  // Targets from ui-extender drive which application section owns the route.
  const targetIds: string[] = (entry.targets ?? []).map((tgt) => tgt.id);

  if (entry.type === "jExperienceMenuEntry") {
    const entryPath = (entry.path ?? entry.key).replace(/^\//, "");
    return `/jexperience/${getSiteKey()}/${entryPath}`;
  }

  if (targetIds.some((id) => id.startsWith("jcontent"))) {
    return `/jcontent/${getSiteKey()}/${getSearchLanguage()}/apps/${entry.key}`;
  }

  if (targetIds.some((id) => id.includes("server"))) {
    // Server-level admin entries are not site-scoped.
    return `/administration/${entry.key}`;
  }

  return `/administration/${getSiteKey()}/${entry.key}`;
}

function searchFeatures(query: string): SearchHit[] {
  const trimmed = query.trim().toLowerCase();
  const entries = getFeatureRegistryEntries();

  const results: SearchHit[] = [];
  for (const entry of entries) {
    const label: string = entry.label ? i18n.t(entry.label) : entry.key;
    if (
      !label.toLowerCase().includes(trimmed) &&
      !entry.key.toLowerCase().includes(trimmed)
    ) {
      continue;
    }

    const path = buildFeatureRoute(entry);

    const typeLabel = i18n.t("search.features.chip", "Feature");
    results.push({
      id: entry.key,
      path,
      displayableName: label,
      excerpt: null,
      nodeType: typeLabel,
    });
  }

  return results;
}

const featureProvider: QuickFindProvider = {
  priority: 10,
  title: "search.features.title",
  titleDefault: "Features",
  isEnabled: () => isProviderEnabled("uiFeaturesEnabled"),
  maxResults: () => getProviderMaxResults("uiFeaturesMaxResults", 2),
  createSearchProvider: (): QuickFindResultsProvider => ({
    search: (query) =>
      Promise.resolve({ hits: searchFeatures(query), hasMore: false }),
    reset: () => {},
  }),
  locate: (hit: SearchHit) => pushRouteNavigation(hit.path),
};

registry.add("quickFindProvider", "quick-find-features", featureProvider);
