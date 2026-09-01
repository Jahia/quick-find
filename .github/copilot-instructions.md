# QuickFind — Workspace Instructions

## Project Overview

Jahia OSGi module (primarily frontend, with a lightweight Java GraphQL extension) providing a Spotlight-style search modal (⌘K / Ctrl+K) for Jahia CMS. Searches content via augmented search with a JCR fallback.

## Stack

- **React 18** + **TypeScript 5.9**, bundled with **Vite 7** (Module Federation via `@jahia/vite-federation-plugin`)
- **Apollo Client 3** for GraphQL queries
- **@jahia/moonstone** design system (custom local build, non-singleton)
- **react-i18next** for i18n (namespace `QuickFind`, locales: en/fr/de)
- **CSS Modules** for styling (`.module.css`)
- Java 17, Maven 3, Node LTS, Yarn 4 (managed via `mise.toml`)

## Java Implementation

- Java backend code lives in `src/main/java/org/jahia/pm/modules/quick-find/graphql/` and is intentionally limited to GraphQL extension wiring.
- `QuickFindQueryExtensions` adds the `urlReverseLookup(url, siteKey)` GraphQL query used by the UI to resolve live URLs to Jahia content paths.
- `QuickFindGraphQLExtensionProvider` registers the extension through OSGi (`DXGraphQLExtensionsProvider`) for Jahia runtime discovery.
- Keep backend additions aligned with OSGi service patterns documented in `contributing.md`.

## Build & Deploy

```bash
yarn build          # Vite build → src/main/resources/javascript/apps/
mvn clean install   # Full build → target/quick-find-*.jar
./deploy.sh         # Deploy JAR to Jahia (requires .env with JAHIA_URL, JAHIA_USER, JAHIA_PASS)
npx tsc --noEmit    # Type-check
```

E2E tests are available under `tests/` (Cypress setup).

## Architecture

```
src/javascript/
  init.ts                      → Entry: registers i18n + routes via @jahia/ui-extender
  globals.d.ts                 → Window augmentation (contextJsParameters, jahia, CE_API)
  quick-find/
    QuickFindModal.tsx             → Modal wrapper, shortcuts, ApolloProvider from window.jahia.apolloClient
    QuickFindPanel/                → Search input + section rendering
    routes.tsx                 → Jahia registry entry, mounts modal/header integration
    shared/                    → Navigation/config/orchestration helpers
  quick-find-providers/
    registerAll.ts             → Registers all search providers
    augmented/                 → Augmented search provider and queries
    jcr/                       → JCR fallback providers (pages/media/main resources)
    features/                  → UI features search provider
    urlReverseLookup/          → URL reverse lookup provider
```

- `useSearchOrchestration` is registry-driven and runs all enabled `quickFindProvider` providers.
- Provider availability uses `checkAvailability(client)` and is evaluated with `window.jahia.apolloClient`.
- Provider extensibility is registry-based: any module can register a provider with `registry.add("quickFindProvider", "<key>", provider)`.
- Third-party Jahia modules should add registrations in their own init callback; they do not need to edit `quick-find-providers/registerAll.ts`.
- Runtime config comes from `window.contextJsParameters.quickFind` (populated from OSGi `.cfg`/JSP).
- Navigation to jContent is handled via shared helpers in `quick-find/shared/navigationUtils.ts`.

## Conventions

- **Check Jahia first**: Before implementing any utility, resolver, lookup, or data-access logic, verify whether Jahia already provides an equivalent out of the box — existing GraphQL fields, JCR services, OSGi utilities, or Moonstone components. Only build custom logic when no Jahia equivalent exists.
- **Imports**: Always include `.ts`/`.tsx` extensions (e.g., `import { foo } from "./bar.ts"`)
- **CSS**: Use CSS Modules — import as `import s from "./Component.module.css"`
- **Components**: `.tsx` for React components, `.ts` for hooks/utilities/queries
- **GraphQL**: Keep queries in dedicated files (`*Query.ts`/`*.ts`); provider implementations typically use `client.query(...)`
- **i18n**: Nested keys (e.g., `search.placeholder`), always provide fallback string in `t()` calls, keep en/fr/de in sync
- **Types**: Prefer inline types + `searchTypes.ts` for shared types; augment `Window` in `globals.d.ts`
- **No `index.ts` barrel files** — import from specific files directly
- **Hooks**: Keep orchestration in shared hooks (for example `useSearchOrchestration`) and keep providers framework-agnostic

## Code Quality

- ESLint with `@jahia` preset; boolean props use `is*`/`has*` naming
- No credentials in source code
- Escape user input when constructing JCR criteria/queries

## AI Skills

Deeper domain guidance lives in on-demand skills. Copilot loads these automatically when relevant — or reference them explicitly:

- `moonstone-ui` — Typography, component catalog, Vite federation config
- `jahia-frontend` — `window.jahia.apolloClient`, `registry.add()`, CSS modules, `globals.d.ts`
- `jahia-config` — OSGi `.cfg` → JSP → `contextJsParameters` → accessor functions
- `jahia-graphql-frontend` — `gql` queries, imperative `client.query()`, `nodesByCriteria`, stale filtering
- `jahia-graphql-extension` — Java `@GraphQLTypeExtension`, OSGi registration, security
- `jahia-ui-extensions-build-deploy` — Jahia UI extension build/package/deploy workflow, including recreating `deploy.sh` and provisioning API usage
