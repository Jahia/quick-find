/**
 * Registers the sites search provider, which switches jContent to another site.
 *
 * Lists the sites the jContent site switcher lists: every site the user has
 * `jContentAccess` on, sorted by title, with systemsite last. A site matches when
 * every word of the query appears in its title or its key. The current site is
 * listed but disabled.
 *
 * Enter on a site repeats the switch of jContent: it keeps the current language
 * when the site has it active in edit, and uses the default language of the site
 * otherwise (jContent's getTargetSiteLanguageForSwitch).
 */
import { registry } from "@jahia/ui-extender";
import i18n from "i18next";
import type {
  ApolloClientInstance,
  QuickFindProvider,
  QuickFindResultsProvider,
  SearchHit,
} from "../types.ts";
import {
  getCurrentJContentLanguage,
  getCurrentJContentSite,
  switchJContentSite,
} from "../../quick-find/shared/navigationUtils.ts";
import {
  isProviderEnabled,
  getProviderMaxResults,
} from "../../quick-find/shared/configUtils.ts";
import { searchTokens } from "../../quick-find/shared/searchTextUtils.ts";
import { withStaleResponseFiltering } from "../providerUtils.ts";
import { SITES_QUERY } from "./sitesQuery.ts";

type GqlSiteNode = {
  uuid: string;
  name: string;
  path: string;
  hasPermission: boolean;
  displayName: string | null;
  site: {
    defaultLanguage: string;
    languages: Array<{ language: string; activeInEdit: boolean }>;
  };
};

/** The sites of the last search, by path, so `locate()` can read their languages. */
const sitesByPath = new Map<string, GqlSiteNode>();

function getTargetLanguage(site: GqlSiteNode, currentLanguage: string): string {
  const hasCurrentLanguage = site.site.languages.some(
    (lang) => lang.activeInEdit && lang.language === currentLanguage,
  );
  return hasCurrentLanguage ? currentLanguage : site.site.defaultLanguage;
}

function sortSites(sites: GqlSiteNode[]): GqlSiteNode[] {
  const title = (site: GqlSiteNode) => site.displayName || site.name;
  return [...sites].sort((a, b) => {
    if (a.name === "systemsite" || b.name === "systemsite") {
      return Number(a.name === "systemsite") - Number(b.name === "systemsite");
    }

    return title(a).localeCompare(title(b));
  });
}

function matchesQuery(site: GqlSiteNode, queryTokens: string[]): boolean {
  const siteText = searchTokens(`${site.displayName ?? ""} ${site.name}`).join(" ");
  return queryTokens.every((token) => siteText.includes(token));
}

function siteToSearchHit(site: GqlSiteNode, currentSite: string): SearchHit {
  const isCurrent = site.name === currentSite;
  return {
    id: site.uuid,
    path: site.path,
    displayableName: site.displayName || site.name,
    excerpt: null,
    nodeType: isCurrent
      ? i18n.t("search.sites.currentChip", "Current site")
      : i18n.t("search.sites.chip", "Site"),
    isDisabled: isCurrent,
    kind: "site",
  };
}

/**
 * Loads the sites once per provider, so once per opening of the modal. The modal sends the
 * queries of one search as one batched request, which waits for its slowest query, so a
 * sites query per search would delay every section.
 */
function createSitesProvider(
  client: ApolloClientInstance,
): QuickFindResultsProvider {
  let allSites: Promise<GqlSiteNode[]> | null = null;
  const loadSites = () => {
    allSites ??= client
      .query<{ jcr: { nodesByQuery: { nodes: GqlSiteNode[] } } }>({
        query: SITES_QUERY,
        variables: { displayLanguage: getCurrentJContentLanguage() },
        fetchPolicy: "network-only",
      })
      .then((result) => result.data?.jcr?.nodesByQuery?.nodes ?? [])
      .catch((error: unknown) => {
        allSites = null;
        throw error;
      });
    return allSites;
  };
  // Loaded before the first search, so no search batch carries this query.
  loadSites().catch(() => {});

  return withStaleResponseFiltering(async (query) => {
    const queryTokens = searchTokens(query);
    const sites = sortSites(
      (await loadSites()).filter(
        (site) => site.hasPermission && matchesQuery(site, queryTokens),
      ),
    );

    sitesByPath.clear();
    sites.forEach((site) => sitesByPath.set(site.path, site));

    const currentSite = getCurrentJContentSite();
    return {
      hits: sites.map((site) => siteToSearchHit(site, currentSite)),
      hasMore: false,
    };
  });
}

const sitesProvider: QuickFindProvider = {
  priority: 3,
  title: "search.sites.title",
  titleDefault: "Sites",
  isEnabled: () => isProviderEnabled("sitesEnabled"),
  maxResults: () => getProviderMaxResults("sitesMaxResults", 3),
  createSearchProvider: createSitesProvider,
  locate: (hit: SearchHit) => {
    const site = sitesByPath.get(hit.path);
    if (!site) {
      return;
    }

    switchJContentSite(
      site.name,
      getTargetLanguage(site, getCurrentJContentLanguage()),
    );
  },
};

registry.add("quickFindProvider", "quick-find-sites", sitesProvider);
