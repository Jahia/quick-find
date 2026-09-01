/**
 * Entry point for the QuickFind Jahia module.
 *
 * Registers a callback with @jahia/ui-extender that fires at app init.
 * The callback loads i18n, mounts the search modal, and adds the primary
 * nav button.
 *
 * @see registerRoutes in routes.tsx for the actual bootstrap logic.
 */
import { registry } from "@jahia/ui-extender";
import "./quick-find-providers/registerAll.ts";
import { registerRoutes } from "./quick-find/routes.tsx";

export default function () {
  registry.add("callback", "quick-find", {
    targets: ["jahiaApp-init:2"],
    requireModuleInstalledOnSite: "quick-find",
    callback: registerRoutes,
  });
}
