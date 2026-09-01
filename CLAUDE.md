# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QuickFind is a Jahia CMS OSGi module providing a Spotlight-style search modal (⌘K/Ctrl+K) for the Jahia administration interface. React 18 + TypeScript frontend with a lightweight Java GraphQL extension backend.

## Build & Development Commands

```bash
# Frontend
yarn build                    # Vite production build → src/main/resources/javascript/apps/
yarn build:dev                # Dev build with sourcemaps
yarn lint                     # ESLint (JS/TS/JSON)
yarn lint:fix                 # Auto-fix lint issues
npx tsc --noEmit              # Type-check only (vite.config.ts intentionally excluded)

# Full build
mvn clean install             # Maven build (runs Vite via frontend-maven-plugin) → target/quick-find-*.jar

# Deploy (requires .env with JAHIA_URL, JAHIA_USER, JAHIA_PASS)
./deploy.sh dev deploy        # Deploy dev build to Jahia
./deploy.sh prod deploy test  # Deploy prod + run E2E tests

# E2E tests (Cypress, run from tests/ directory)
cd tests && yarn e2e:ci       # Headless Cypress run
cd tests && yarn e2e:debug    # Interactive Cypress UI
```

Tool versions are managed via `mise.toml`: Java temurin-17, Node 22, Yarn 4, Maven 3.

## Architecture

### Provider Pattern (Core Abstraction)

The search system is registry-driven. Providers implement `QuickFindProvider` (defined in `src/javascript/quick-find-providers/types.ts`) and register via Jahia's UI Extender registry as type `"quickFindProvider"`. Third-party modules can register their own providers without modifying this codebase.

**Built-in providers** (in `src/javascript/quick-find-providers/`):
- `features/` — Scans UI registry for admin routes + jExperience items (in-memory, no network)
- `urlReverseLookup/` — Resolves pasted URLs to JCR nodes via custom GraphQL query
- `augmented/` — Elasticsearch-backed full-text search (when augmented search mixin is available on site)
- `jcr/media/`, `jcr/pages/`, `jcr/mainResources/` — JCR criteria-based fallback searches

Providers are framework-agnostic (no React hooks). They expose imperative factory methods (`createSearchProvider`) returning a `QuickFindResultsProvider`.

### Search Orchestration

`useSearchOrchestration` (`src/javascript/quick-find/shared/useSearchOrchestration.ts`) is the central hook. It discovers enabled providers from the registry, runs availability checks, debounces queries, and manages per-provider state via `useReducer`.

### Jahia Integration Points

- **Apollo Client**: `window.jahia.apolloClient` (provided by Jahia runtime)
- **i18n**: Jahia's shared i18next. ⚠️ `window.jahia.i18n` (and the default import `import i18n from "i18next"`) is the i18next **module namespace**, not a live instance — it has `t()` but NOT `.on`/`.store`. The real instance is at `window.jahia.i18n.default`. Passing the namespace to `<I18nextProvider>` makes react-i18next/Moonstone throw `o.on is not a function` and unmounts the subtree. Always unwrap to the instance with `.on` (see `quick-find/routes.tsx`).
- **Router**: `window.jahia.routerHistory.push()` for navigation
- **Config**: `window.contextJsParameters.quickFind` (OSGi `.cfg` → JSP → browser)
- **UI Registry**: `@jahia/ui-extender` for provider registration and feature discovery

### Module Federation

Vite builds with `@jahia/vite-federation-plugin`. Exposes `./init` entry. React/ReactDOM are shared singletons; i18next and react-i18next are explicitly **not** singletons.

### Java Backend

Minimal — two files in `src/main/java/org/jahia/pm/modules/quick-find/graphql/`:
- `QuickFindGraphQLExtensionProvider` — OSGi service registration
- `QuickFindQueryExtensions` — `fuzzyUrlAndPathLookup(url, siteKey)` GraphQL query resolving URLs to JCR nodes via path matching + vanity URL service

### OSGi Configuration

Default config in `src/main/resources/META-INF/configurations/org.jahia.pm.modules.quickfind.cfg`. Injected to browser via JSP at `src/main/resources/configs/quickFind.jsp`. Controls per-provider enable/disable, max results, search debounce delays, and min search chars.

## Conventions

- **Imports**: Always include `.ts`/`.tsx` extensions in import paths
- **CSS**: CSS Modules — `import s from "./Component.module.css"`
- **File types**: `.tsx` for React components, `.ts` for hooks/utilities/queries
- **GraphQL**: Queries in dedicated files (`*Query.ts`)
- **i18n**: Nested keys, always provide fallback string in `t()` calls, keep en/fr/de in sync (locales in `src/main/resources/javascript/locales/`)
- **No `index.ts` barrel files** — import from specific files directly
- **Boolean props**: Use `is*`/`has*` naming (enforced by ESLint)
- **Jahia first**: Check for existing Jahia equivalents (GraphQL fields, JCR services, Moonstone components, OSGi utilities) before building custom logic
- **Escape user input** in JCR criteria and GraphQL variables
- **Package name**: `"quickfind"` in package.json (not `"quick-find"`) — workaround for a Jahia UI rendering bug

## Known Issues

**Runtime crash (RESOLVED)**: Was caused by singleton version negotiation tie-breaking — quick-find declared the same React version as the host, winning the tie and providing its own React instance to all consumers. Fixed by setting `version: "0.0.0"` for all host-provided shared deps in `vite.config.ts`. See `HANDOFF_RUNTIME_ISSUE.md` for full investigation history and fix details.

## AI Skills

Domain-specific guidance lives in `.github/skills/`:
- `moonstone-ui` — Jahia design system components and federation config
- `jahia-frontend` — Apollo client access, registry API, CSS modules, window globals
- `jahia-config` — OSGi config → JSP → contextJsParameters pipeline
- `jahia-graphql-frontend` — GraphQL queries, `client.query()`, `nodesByCriteria`
- `jahia-graphql-extension` — Java GraphQL extensions, OSGi registration
- `jahia-ui-extensions-build-deploy` — Build/package/deploy workflow, `deploy.sh`, provisioning API
