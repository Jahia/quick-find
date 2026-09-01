/**
 * Registers the JCR media search provider.
 * Searches `jnt:file` nodes. Independent of augmented search availability.
 */
import { registry } from "@jahia/ui-extender";
import type { QuickFindProvider, SearchHit } from "../../types.ts";
import { locateInJContent } from "../../../quick-find/shared/navigationUtils.ts";
import {
  isProviderEnabled,
  getProviderMaxResults,
} from "../../../quick-find/shared/configUtils.ts";
import { JCR_MEDIA_BY_CRITERIA_QUERY } from "./query.ts";
import { createJcrSearchProvider } from "../jcrSearchProvider.ts";
import { openContentEditor } from "../../providerUtils.ts";

const mediaProvider: QuickFindProvider = {
  priority: 20,
  title: "search.jcrMedia.title",
  titleDefault: "Media",
  isEnabled: () => isProviderEnabled("jcrMediaEnabled"),
  maxResults: () => getProviderMaxResults("jcrMediaMaxResults", 2),
  createSearchProvider: (client) =>
    createJcrSearchProvider(client, JCR_MEDIA_BY_CRITERIA_QUERY),
  locate: (hit: SearchHit) => locateInJContent(hit.path, hit.nodeType),
  edit: openContentEditor,
};

registry.add("quickFindProvider", "quick-find-jcr-media", mediaProvider);
