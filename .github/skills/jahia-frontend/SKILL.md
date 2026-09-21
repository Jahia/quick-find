---
name: jahia-frontend
description: "Use when building JavaScript/TypeScript code for a Jahia module. Covers window.jahia.apolloClient usage, registry.add() extension pattern for @jahia/ui-extender, CSS modules convention, TypeScript window augmentation in globals.d.ts, and imperative Apollo client usage inside search providers."
---

# Jahia Frontend Patterns

## When to Use

Load this skill when writing JavaScript/TypeScript for a Jahia OSGi module — particularly when working with the Apollo client, the Jahia UI Extender registry, CSS modules, or typing global `window` properties.

---

## Apollo Client — `window.jahia.apolloClient`

The Jahia platform injects a shared Apollo Client instance on `window.jahia.apolloClient` **before** any module's init callback fires. No async wait or lazy initialization is needed.

### Access pattern

Retrieve the client once in the app root component and pass it down:

```tsx
// In your root modal/app component
const apolloClient = window.jahia?.apolloClient;

return (
  <ApolloProvider client={apolloClient}>
    <MyPanel apolloClient={apolloClient} />
  </ApolloProvider>
);
```

- Wrap with `<ApolloProvider>` so child React components can use hooks if needed.
- Also pass `apolloClient` as a **constructor argument** to provider/utility objects that run queries outside of React components.

### Typing in `globals.d.ts`

```ts
declare interface Window {
  jahia?: {
    apolloClient?: import("@apollo/client").ApolloClient<
      import("@apollo/client").NormalizedCacheObject
    >;
    routerHistory?: { push: (path: string) => void };
    // ... other platform globals
  };
}
```

Mark all fields `?` — different platform versions may not expose all properties.

---

## Imperative `client.query()` — use inside providers, not hooks

React hooks (`useQuery`, `useLazyQuery`) cannot be called inside a loop over a dynamic list of providers. For plugin-style architectures, call the Apollo client **imperatively**:

```ts
// ✅ correct — imperative, inside a provider factory (not a React component)
const result = await client.query<{
  jcr: { nodesByCriteria: { nodes: Node[] } };
}>({
  query: SEARCH_QUERY,
  variables: { searchTerm, wildcardTerm, likePattern, sitePath, language, limit, offset },
  fetchPolicy: "network-only",
});

// ❌ wrong — useQuery/useLazyQuery inside a non-component function
const { data } = useQuery(SEARCH_QUERY, { variables });
```

Always use `fetchPolicy: 'network-only'` for search queries — stale cached data causes incorrect results.

The search variables are sanitized in the caller, never the raw string the user typed: `contains` parses its argument, so an exclamation mark, a parenthesis, an unclosed quote or a bare `OR` raises `Invalid full text search expression` and fails the whole constraint around it. The constraint itself stays fixed in the query document. See `jahia-graphql-frontend` for the shape.

---

## Jahia UI Extender Registry — `registry.add()`

Extensions are registered as **side effects** using `registry.add(type, key, shape)` from `@jahia/ui-extender`.

### Canonical init flow

```
init.ts
  └── imports registerAll.ts
        └── imports ./features/register.ts      (side effect: registry.add)
        └── imports ./augmented/register.ts     (side effect: registry.add)
        └── imports ./jcr/media/register.ts     (side effect: registry.add)
        └── ...
```

### `register.ts` template

```ts
import { registry } from "@jahia/ui-extender";
import type { MyProviderType } from "../types.ts";

const myProvider: MyProviderType = {
  priority: 10,
  title: "my.i18n.key",
  isEnabled: () => true,
  checkAvailability: async (client) => {
    /* ... */
  },
  createSearchProvider: (client) => ({
    /* ... */
  }),
};

registry.add("myProviderType", "my-provider-key", myProvider);
```

- The file **must** be imported at module init time to trigger the `registry.add` call.
- Third-party Jahia modules can register in their own init callback — they do **not** need to edit the host module's `registerAll.ts`.

### App-level callback registration (in `init.ts`)

```ts
registry.add("callback", "my-module", {
  targets: ["jahiaApp-init:2"],
  requireModuleInstalledOnSite: "my-module",
  callback: registerRoutes,
});
```

---

## CSS Modules

One `.module.css` file per component, co-located in the same directory. Import as `s`:

```ts
import s from './MyComponent.module.css';

// Usage
<div className={s.container}>
    <div className={s.header}>...</div>
</div>
```

Shared cross-component layout styles go in `shared/layout.module.css`, imported as `styles`:

```ts
import styles from "../shared/layout.module.css";
```

### Declare in `globals.d.ts`

```ts
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

---

## TypeScript Window Augmentation (`globals.d.ts`)

Extend `declare interface Window` (not `declare global { interface Window }`) to type all `window.*` globals:

```ts
/// <reference types="vite/client" />

declare interface Window {
  contextJsParameters: {
    currentUser: string;
    siteKey?: string;
    lang?: string;
    // module-specific sub-object added by your JSP
    myModule?: {
      someFlag?: boolean;
    };
    [key: string]: unknown;
  };
  jahia?: {
    apolloClient?: import("@apollo/client").ApolloClient<
      import("@apollo/client").NormalizedCacheObject
    >;
  };
  // Other platform globals (e.g. CE_API for content editor)
  CE_API?: {
    edit: (opts: { path: string }) => void;
  };
}

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

- All fields should be `?` to handle partial environments safely.
- Use `import(...)` inside type positions to avoid polluting the module scope.
