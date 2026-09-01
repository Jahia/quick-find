/**
 * Registers the JCR main resources search provider.
 * Searches `jmix:mainResource` nodes via JCR `nodesByCriteria`.
 *
 * Only active when augmented search is NOT available on the current site.
 * Same mutual-exclusion logic as the pages provider: augmented search
 * covers these content types with better ranking when enabled.
 */
import { registry } from "@jahia/ui-extender";
import type { QuickFindProvider, SearchHit } from "../../types.ts";
import {
  getSiteKey,
  locateInJContent,
} from "../../../quick-find/shared/navigationUtils.ts";
import {
  isProviderEnabled,
  getProviderMaxResults,
} from "../../../quick-find/shared/configUtils.ts";
import { checkAugmentedAvailable } from "../../../quick-find/shared/checkAugmentedAvailable.ts";
import { JCR_MAIN_RESOURCES_BY_CRITERIA_QUERY } from "./query.ts";
import { createJcrSearchProvider } from "../jcrSearchProvider.ts";
import { openContentEditor } from "../../providerUtils.ts";

const mainResourcesProvider: QuickFindProvider = {
  priority: 32,
  title: "search.jcrMainResources.title",
  titleDefault: "Main Resource (Full page content)",
  isEnabled: () => isProviderEnabled("jcrMainResourcesEnabled"),
  maxResults: () => getProviderMaxResults("jcrMainResourcesMaxResults", 4),
  checkAvailability: (client) =>
    checkAugmentedAvailable(client, getSiteKey()).then((v) => !v),
  createSearchProvider: (client) =>
    createJcrSearchProvider(client, JCR_MAIN_RESOURCES_BY_CRITERIA_QUERY),
  locate: (hit: SearchHit) => locateInJContent(hit.path, hit.nodeType),
  edit: openContentEditor,
};

registry.add(
  "quickFindProvider",
  "quick-find-jcr-main-resources",
  mainResourcesProvider,
);
