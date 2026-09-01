/**
 * Registers the JCR pages search provider.
 * Searches `jnt:page` nodes via JCR `nodesByCriteria`.
 *
 * Only active when augmented search is NOT available on the current site.
 * When augmented search IS available, the augmented provider covers pages
 * (and more) with better ranking — so this provider disables itself to avoid
 * showing duplicate results.
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
import { JCR_NODES_BY_CRITERIA_QUERY } from "./query.ts";
import { createJcrSearchProvider } from "../jcrSearchProvider.ts";
import { openContentEditor } from "../../providerUtils.ts";

const pagesProvider: QuickFindProvider = {
  priority: 31,
  title: "search.jcrPages.title",
  titleDefault: "Pages",
  isEnabled: () => isProviderEnabled("jcrPagesEnabled"),
  maxResults: () => getProviderMaxResults("jcrPagesMaxResults", 4),
  checkAvailability: (client) =>
    checkAugmentedAvailable(client, getSiteKey()).then((v) => !v),
  createSearchProvider: (client) =>
    createJcrSearchProvider(client, JCR_NODES_BY_CRITERIA_QUERY),
  locate: (hit: SearchHit) => locateInJContent(hit.path, hit.nodeType),
  edit: openContentEditor,
};

registry.add("quickFindProvider", "quick-find-jcr-pages", pagesProvider);
