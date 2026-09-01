/// <reference types="vite/client" />

declare interface Window {
  contextJsParameters: {
    currentUser: string;
    uilang?: string;
    lang?: string;
    siteKey?: string;
    /** Populated server-side by reading org.jahia.pm.modules.quickfind.cfg */
    quickFind?: {
      /** Server-rendered build/request timestamp from quickFind.jsp. */
      buildTime?: string;
      /** Minimum characters before a content search query is fired. Default: 3. */
      minSearchChars?: number;
      /** Number of results shown per section before clicking "show more". Default: 5. */
      defaultDisplayedResults?: number;
      /** Debounce delay (ms) before firing a search when augmented search is enabled. Default: 300. */
      augmentedFindDelayInTypingToLaunchSearch?: number;
      /** Debounce delay (ms) before firing a search when augmented search is NOT enabled (JCR fallback). Default: 300. */
      jcrFindDelayInTypingToLaunchSearch?: number;
      /** Whether the UI features table is enabled. Default: true. */
      uiFeaturesEnabled?: boolean;
      /** Max results shown in the UI features table. Default: 2. */
      uiFeaturesMaxResults?: number;
      /** Whether the JCR media table is enabled. Default: true. */
      jcrMediaEnabled?: boolean;
      /** Max results shown in the JCR media table. Default: 2. */
      jcrMediaMaxResults?: number;
      /** Whether the JCR pages table is enabled. Default: true. */
      jcrPagesEnabled?: boolean;
      /** Max results shown in the JCR pages table. Default: 4. */
      jcrPagesMaxResults?: number;
      /** Whether the JCR main resources table is enabled. Default: true. */
      jcrMainResourcesEnabled?: boolean;
      /** Max results shown in the JCR main resources table. Default: 4. */
      jcrMainResourcesMaxResults?: number;
      /** Whether the URL reverse lookup feature is enabled. Default: true. */
      urlReverseLookupEnabled?: boolean;
    };
    [key: string]: unknown;
  };
  CE_API?: {
    edit: (opts: { path: string }) => void;
  };
  jahia?: {
    /** Jahia's shared Apollo client — available before any module's registerRoutes fires. */
    apolloClient?: import("@apollo/client").ApolloClient<
      import("@apollo/client").NormalizedCacheObject
    >;
    routerHistory?: { push: (path: string) => void; [k: string]: unknown };
    reduxStore?: {
      dispatch: (action: unknown) => unknown;
    };
    uiExtender?: {
      registry?: {
        registry?: Record<
          string,
          {
            key: string;
            type: string;
            label?: string;
            path?: string;
            route?: string;
            targets?: { id: string; priority: number }[];
            [k: string]: unknown;
          }
        >;
      };
    };
  };
}

// Build time now comes from contextJsParameters.quickFind.buildTime via JSP.

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
