# QuickFind

A Spotlight-style search modal for [Jahia CMS](https://www.jahia.com/) that lets editors quickly find and navigate to any content, page, media, feature, or URL directly from the authoring interface. Open it with **⌘K** (macOS) or **Ctrl+K** (Windows/Linux) and start typing — results appear instantly across multiple search providers.

## Known Issues

- GraphQL API field placement may not be ideal yet: `fuzzyUrlAndPathLookup` was added at the query root.
- `pom.xml` currently looks overly complex and likely needs simplification.
- In `package.json`, using `quick-find` as the package name appears to break Jahia UI behavior (root cause still unknown).
- For the `features` provider, discovering reliable Jahia feature/menu routes is difficult and currently relies on guesswork.
- A good reusable deterministic Java service method was not found to resolve a node from a URL across both vanity and regular URL forms (`/sites/{siteKey}/...`, etc.).
- Cypress tests were blocked by CSRF at one point, leading to a workaround that may no longer be necessary.
- Opening Page Builder and the preview drawer cannot currently be done through stable JavaScript APIs; the implemented behavior relies on workarounds.
- `configUtils` may be unnecessary and should be reassessed.

## Stack

React 18 + TypeScript, bundled with Vite 7 and Module Federation (`@jahia/vite-federation-plugin`). GraphQL queries run through Apollo Client 3 against Jahia's backend. The UI is built with [@jahia/moonstone](https://github.com/Jahia/moonstone) and styled with CSS Modules. Internationalization uses react-i18next (English, French, German). The module is packaged as an OSGi bundle via Maven.

## Keyboard Shortcuts

| Action                | Key                     |
| --------------------- | ----------------------- |
| Open / close modal    | **⌘K** / **Ctrl+K**     |
| Close modal           | **Esc**                 |
| Navigate results      | **Tab** / **Shift+Tab** |
| Go to selected result | **Enter**               |
| Edit selected result  | **E**                   |

A custom DOM event `quick-find:open-search` can also open the modal programmatically (used by the nav search button).

## Search Sections

The modal displays results in up to six sections, each powered by an independent search provider. Sections appear conditionally based on configuration and site capabilities.

**Direct URL Match** — When the query looks like a URL (starts with `http://`, `https://`, `/`, or contains a domain pattern), QuickFind resolves it against Jahia's vanity URLs and JCR paths via a custom GraphQL endpoint. Returns one or more matching nodes if found.

**Features** — Filters Jahia's UI registry in memory (no network call) to surface admin routes, jContent apps, and jExperience menu items matching the query. Results are computed locally and appear instantly once the minimum character threshold is reached.

**Media** — Searches for `jnt:file` nodes (images, videos, documents) via a JCR GraphQL query. Results include a 40×40 thumbnail preview when available. Fires independently of other search providers.

**Augmented Search** — When the site has a search index (`jmix:augmentedSearchIndexableSite` mixin), queries Jahia's Elasticsearch-backed augmented-search endpoint for pages, main resources, and documents. Supports server-side pagination and returns highlighted HTML excerpts.

**JCR Pages** — Fallback when augmented search is unavailable. Queries for `jnt:page` nodes via JCR GraphQL `nodesByCriteria`.

**JCR Main Resources** — Fallback when augmented search is unavailable. Queries for nodes with the `jmix:mainResource` mixin (full-page content items).

### URL Reverse Lookup Provider

`urlReverseLookupProvider` is registered like the other providers and runs only for URL-like input (`http://`, `https://`, absolute paths, or domain-like patterns).

On the backend, `QuickFindQueryExtensions.urlReverseLookup(url, siteKey)` extracts the path, tries multiple site-scoped candidates with Jahia's `URLResolver` (`rawPath`, `/sites/{siteKey}{path}`, `/sites/{siteKey}/home{path}`), and returns distinct matching nodes.

## Architecture

```
init.ts → registerRoutes()
  ├─ register built-in providers (features, urlReverseLookup, augmented, jcr/*)
  ├─ <QuickFindModal />           (separate React root)
  │   ├─ ApolloProvider       (client from window.jahia.apolloClient)
  │   └─ <QuickFindPanel />
  │       ├─ <QuickFindHeader />  (input + clear button)
  │       └─ <ResultsSection /> instances rendered from provider outputs
  └─ <NavSearchButton />      (in jcontent's React tree)
      └─ dispatches `quick-find:open-search` custom event
```

The module registers itself via `@jahia/ui-extender` at app startup. The modal runs in its own React root (outside jcontent's tree), and both the modal and provider orchestration read the shared Apollo client directly from `window.jahia.apolloClient`. The `useSearchOrchestration` hook coordinates all providers: it checks augmented-search availability, debounces input, routes queries to the appropriate providers, and aggregates results.

### Extensibility: Third-Party Providers

To keep the architecture clean, providers are declared separately and discovered through the registry. Built-in providers are loaded from `src/javascript/quick-find-providers/registerAll.ts`, where each provider registers itself with:

`registry.add("quickFindProvider", "my-provider-key", providerDefinition)`

The ability to extend QuickFind with additional providers from third-party modules has not been tested yet.

## Configuration

All settings are defined in the OSGi configuration file `org.jahia.pm.modules.quickfind.cfg` and injected at runtime into `window.contextJsParameters.quickFind` via a JSP.

| Property                                   | Default | Description                                         |
| ------------------------------------------ | ------- | --------------------------------------------------- |
| `minSearchChars`                           | 3       | Minimum characters before search fires              |
| `defaultDisplayedResults`                  | 5       | Initial results per section before "Show more"      |
| `augmentedFindDelayInTypingToLaunchSearch` | 300     | Debounce delay in ms (augmented search)             |
| `jcrFindDelayInTypingToLaunchSearch`       | 300     | Debounce delay in ms (JCR fallback)                 |
| `uiFeaturesEnabled`                        | true    | Show UI Features section                            |
| `uiFeaturesMaxResults`                     | 2       | Max features displayed initially                    |
| `jcrMediaEnabled`                          | true    | Show Media section                                  |
| `jcrMediaMaxResults`                       | 2       | Max media results initially                         |
| `jcrPagesEnabled`                          | true    | Show JCR Pages section (when augmented unavailable) |
| `jcrPagesMaxResults`                       | 4       | Max page results initially                          |
| `jcrMainResourcesEnabled`                  | true    | Show JCR Main Resources section                     |
| `jcrMainResourcesMaxResults`               | 4       | Max main resource results initially                 |
| `urlReverseLookupEnabled`                  | true    | Enable URL → node resolution                        |

## Internationalization

Translations live in `src/main/resources/javascript/locales/` under the `quick-find` i18n namespace. All keys are maintained in three locales: English (`en.json`), French (`fr.json`), and German (`de.json`). The active language aligns with Jahia's UI language (`window.contextJsParameters.uilang`) at module initialization. Every `t()` call includes a hardcoded fallback string for resilience.

## Build & Deploy

**Prerequisites**: Java 17, Maven 3, Node 22, Yarn 4 (tool versions managed via `mise.toml`).

```bash
yarn build              # Vite build → src/main/resources/javascript/apps/
yarn lint               # ESLint checks
mvn clean install       # Full build (includes Vite) → target/quick-find-*.jar
npx tsc --noEmit        # Type-check (vite.config.ts is intentionally excluded)
cd tests && yarn e2e:ci # Run Cypress E2E tests
./deploy.sh             # Deploy JAR to Jahia
```

The deploy script reads `JAHIA_URL`, `JAHIA_USER`, and `JAHIA_PASS` from a `.env` file, runs `mvn clean install`, then uploads the JAR to Jahia's provisioning API. The previous module version is automatically replaced.

## Contributing

Contributions are welcome. Use this workflow for pull requests:

1. Create a branch from `main`.
2. Keep commits focused and readable.
3. Run local checks before opening a PR (see Build & Deploy for commands).
4. Update `CHANGES.md` for user-visible changes.
5. Ensure CI passes (build + Cypress E2E).
6. Open a PR explaining what changed and why.

### Code Quality

- Never commit credentials or sensitive information.
- Escape/validate user input before using it in JCR criteria or GraphQL variables.
- Follow ESLint rules (`@jahia` preset); use `yarn lint:fix` when needed.
- Boolean React props should use `is*` / `has*` naming.
- Do not silently swallow failures; surface issues with logs (`console.warn` at minimum).

### Backend Constraints

- Java 17 + Maven OSGi packaging.
- Spring is not used in this module; do not add `org.springframework` dependencies.
- Keep backend scope minimal (GraphQL extension code under `graphql/`).

### AI Coding Skills

The project includes Copilot skill guides under `.github/skills/`:

- `moonstone-ui`: React UI with `@jahia/moonstone`
- `jahia-frontend`: Apollo client, registry pattern, CSS modules, `globals.d.ts`
- `jahia-config`: OSGi config surfaced to JavaScript via JSP + `contextJsParameters`
- `jahia-graphql-frontend`: TypeScript GraphQL queries (JCR and augmented search)
- `jahia-graphql-extension`: Java GraphQL extensions with `@GraphQLTypeExtension`

## Learnings

Debugging notes for this module's CI and test environment are in [docs/LEARNINGS.md](docs/LEARNINGS.md); test-authoring notes are in [tests/LEARNINGS.md](tests/LEARNINGS.md).

## License

Licensed under the [MIT License](LICENSE).
