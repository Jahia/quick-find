# quick-find Runtime Crash Handoff

## Objective

Fix fatal runtime crashes in Jahia administration page load after deploying the quick-find module.

## Environment

- Workspace: quick-find
- Target URL: /jahia/administration/manageModules
- Runtime context: Jahia with many federated modules loaded at once
- Build and deploy path works reliably

## Core Symptoms

The page does not complete loading and crashes with fatal JavaScript errors.

Most frequent fatal errors:

- Cannot read properties of null reading useMemo
- Cannot read properties of null reading useContext
- Cannot read properties of null reading useRef

Additional error seen after one config experiment:

- Cannot read properties of undefined reading react

Typical stack shape:

- serverSettings loadShare chunk
- jcontent chunk usage
- then quick-find bundle entry chunk

There are many federation warnings about unsatisfied singleton versions across the platform, especially around React, react-i18next, i18next, moonstone, redux, and others.

## Confirmed Root Cause

**Dual React instance caused by Vite federation pre-building.**

The `@module-federation/vite` plugin (used internally by `@jahia/vite-federation-plugin`) pre-builds full bundled copies of every shared dependency as fallback libraries. This means quick-find ships its own complete copy of React (~134KB), even when the intent is to use the host's React.

When the webpack app-shell initializes quick-find's remote, it populates the shared scope. quick-find's React entry has `lib: function` (a bundled fallback), making it a viable provider. If quick-find's entry wins the singleton version negotiation (e.g., same version 18.3.1 as the host → tie-breaking favors quick-find), the platform uses quick-find's bundled React instead of the host's. This creates two React instances: one rendering the component tree, another providing the hooks dispatcher → null dispatcher → crash.

### Diagnostic Evidence

Inspecting `__FEDERATION__.__INSTANCES__` at runtime revealed:

- **quick-find** shared entries for react/react-dom have `lib: function` (bundled fallback exists)
- **copy-to-other-languages** (a working module) shared entries have `lib: undefined` (no bundled fallback)

> **CORRECTION (2026-09-11).** This paragraph was wrong, and it was the load-bearing claim of
> the original diagnosis. `lib` is a **loaded** marker, not a capability marker:
> `isLoaded = Boolean(shared.loaded) || typeof shared.lib === 'function'`
> (`@module-federation/runtime-core/dist/index.esm.js:933-935`). Seeing `lib: function` on
> quick-find's react meant quick-find's copy had **already been elected and loaded**.
> `lib: undefined` on copy-to-other-languages meant only that its entry had not been loaded yet.
> copy-to-other-languages ships a full prebuilt React 18.2.0 and is perfectly capable of
> providing it, as this document itself says 150 lines further down. The `lib` observation was
> a symptom of having won the election, not the reason for winning it.

### How Vite Federation Pre-Building Works

1. `@jahia/vite-federation-plugin` auto-shares ALL `dependencies` from package.json as `{ singleton: true }`
2. `@module-federation/vite` generates pre-built bundles for each shared dep (files like `__prebuild__/react.mjs`)
3. These bundles become the `lib` property in the federation runtime config
4. The generated `get()` function either returns the pre-built bundle or throws (if `import: false`)
5. Webpack's `consumes` pattern calls `get()` on every remote's shared entries during initialization

## What Was Changed And Tested

### Phase 1: Original Attempts (Pre-Diagnosis)

#### 1) Package identity rename

- Changed package name from kfinder to quickfind
- Result: no functional improvement, crash persisted
- **Note for anyone reading [Jahia/quick-find#15](https://github.com/Jahia/quick-find/issues/15):** its console capture names `kfinder`, so it predates both this rename and the `version: "0.0.0"` config. Those lines are evidence of the *old* build's behaviour; re-capture before attributing any of them to the current artefact. The rename is also not cosmetic: the module name is the tie-break key when two registrants collide on the same version string

#### 2) Baseline alignment with reference repos

- Applied minimal config approach matching copy-to-other-languages, happy-paste, formidable
- Result: crash persisted (because the plugin auto-shares all deps regardless)

#### 3) Federation DTS setting

- Added dts false
- Result: reduced build noise but no runtime fix

#### 4) Explicit subpath sharing for React internals

- Added shared singleton entries for react/jsx-runtime and react-dom/client
- Result: crash persisted

#### 5) i18n share strategy experiment

- Set i18next and react-i18next singleton false
- Result: crash persisted

#### 6) Explicit react and react-dom sharing strategy experiment

- Added react and react-dom as shared singleton true with requiredVersion false
- Result: no fix, introduced "undefined reading react" error

#### 7) Dependency version alignment experiment

- Updated react-i18next from ^11.2.2 to ^11.18.6
- Result: no fix

### Phase 2: Targeted Fixes After Root Cause Diagnosis

#### 8) Remove shared overrides entirely

- Removed all custom shared config, relying on plugin defaults
- Result: build still produced 442 modules with bundled React. Plugin auto-shares all deps, so removing overrides doesn't prevent pre-building

#### 9) import: false without singleton

- Set `{ import: false }` without `singleton: true`
- Result: webpack treated entries as separate instances, calling quick-find's `get()` which threw
- Root cause: Jahia plugin's shallow merge — `{ import: false }` REPLACED `{ singleton: true }` entirely instead of merging

#### 10) singleton: true + import: false

- Set `{ singleton: true, import: false }` for react, react-dom, react/jsx-runtime, react-dom/client, react-i18next, i18next, @apollo/client, prop-types, graphql
- Result: webpack still called `get()` which threw `"Shared module 'X' must be provided by host"`
- Root cause: webpack `consumes` calls `get()` on ALL shared entries regardless of singleton — it's part of share scope population, not just fallback

#### 11) Patch get() to return undefined

- Post-build Vite plugin replacing throw statements with `return undefined`
- Result: `"a is not a function"` — webpack expects `get()` to return a factory function, not undefined

#### 12) Patch get() to return empty factory

- Post-build Vite plugin replacing throw statements with `return ()=>{}`
- Result: `"Cannot read properties of undefined (reading 'Component')"` from `security-filter-tools`
- Root cause: quick-find's empty factory wins singleton negotiation (same version as host), providing `{}` as React to ALL consumers on the platform. The fix broke other modules.

## Key Technical Details

### Jahia Plugin Shared Config Merge Behavior

```javascript
// node_modules/@jahia/vite-federation-plugin/dist/index.js
shared: {
    ...Object.fromEntries(Object.keys(dependencies).map((dep) => [dep, { singleton: true }])),
    ...options.shared,   // ← shallow merge: explicit overrides REPLACE defaults entirely
}
```

This means `shared: { react: { import: false } }` produces `{ react: { import: false } }` — the `singleton: true` from the default is lost. To keep both, you must specify `{ singleton: true, import: false }`.

### Vite Federation import: false Behavior

```javascript
// node_modules/@module-federation/vite/lib/index.mjs
shareItem?.shareConfig.import === false
    ? throw new Error("Shared module 'X' must be provided by host")
    : let pkg = await import("${getPreBuildLibImportId(pkg)}"); return pkg;
```

`import: false` prevents bundling the fallback BUT makes `get()` throw an error instead of returning nothing. This is incompatible with webpack's `consumes` pattern, which always calls `get()`.

### Webpack consumes Flow

When the webpack app-shell loads a remote:
1. Calls `init(shareScope)` — remote registers its shared entries into the scope
2. Calls `get("./init")` — remote returns its exposed module
3. During step 1, webpack's `consumes` handler walks ALL entries and calls their `get()` to populate the share scope
4. If any `get()` throws, the page fails to load

## Runtime Share Scope Analysis (quick-find undeployed, working state)

Inspected `__FEDERATION__.__INSTANCES__` and `shareScopeMap` on `/jahia/administration/iso-luxe/settings/properties`.

### Federation Instances Present

Only two federation instances when quick-find is undeployed:
1. `@jahia/copy-to-other-languages` — Vite-built module, 12 shared keys
2. `__mfe_internal__@jahia/server-settings` — webpack-built module, 9 shared keys

### React Entries in Share Scope

The `shareScopeMap.default.react` contains entries from multiple sources:

| Version | From | hasLib | loaded | Role |
|---------|------|--------|--------|------|
| 16.14.0 | content-release | false | false | Legacy consumer |
| 18.2.0 | @jahia/copy-to-other-languages | false | false | Consumer (own declared version) |
| **18.3.1** | **@jahia/copy-to-other-languages** | **true** | **true** | **Active provider** |
| 16.13.1 | @jahia/codemirror-editor | false | false | Legacy consumer |

### Critical Observation: Host-Injected Entries

React 18.3.1 with `hasLib: true` is listed as `from: "@jahia/copy-to-other-languages"` but copy-to-other-languages only declares react 18.2.0 in its own config. This means:

1. The webpack app-shell injects its own react 18.3.1 into the share scope during `init(shareScope)`
2. The `from` field reflects the scope context, not the true origin
3. The same pattern applies to `@apollo/client` (3.14.1 from copy-to-other-languages with `hasLib: true`) and other host-provided deps

### How copy-to-other-languages Works (No Crash)

- Declares react 18.2.0 with `hasLib: false, hasGet: true` — consumer only
- The host injects react 18.3.1 with `hasLib: true` into the shared scope
- Singleton negotiation picks 18.3.1 (highest version) which has a real `lib` function
- copy-to-other-languages' `loadShare("react")` resolves to the host's 18.3.1
- `useIn: ["@jahia/copy-to-other-languages"]` confirms it's consuming, not providing

### copy-to-other-languages Build Setup

From GitHub (Jahia/copy-to-other-languages):
- Uses `@jahia/vite-federation-plugin: ^0.1.0` (quick-find uses `^0.1.1`)
- Passes NO custom `shared` config — only `exposes` and plugin defaults
- react/react-dom are in `dependencies` (same as quick-find)
- The 0.1.0 plugin version may lack the auto-share-from-dependencies logic, OR it generates entries WITHOUT pre-built fallbacks

### The Provider/Consumer Duality

Each shared dependency has TWO resolution paths:
- **`get()`** = PROVIDER path — called by the webpack host to populate the share scope. Returns a factory wrapping a pre-built bundle.
- **`loadShare()`** = CONSUMER path — called by the Vite module to resolve its own imports from the shared scope. Uses the loadShare chunk files (`quickfind__loadShare__react__loadShare__.mjs-*.js`).

These paths are independent. The `loadShare` chunks call `loadShare("react")` on the federation runtime, which picks the winner from the shared scope. The `get()` is only called by the webpack host when populating the scope.

### Why copy-to-other-languages Works (Version Matters)

Inspecting copy-to-other-languages' pre-built React bundle reveals it is a **FULL COPY of React 18.2.0 production build** (7KB). If its `get()` ever won the singleton negotiation, it would create the EXACT SAME dual-instance crash.

It works because **version negotiation prevents it from ever winning**:
- copy-to-other-languages declares react **18.2.0**
- The host (server-settings) provides react **18.3.1**
- Singleton negotiation elects **loaded-first, then highest** → 18.3.1 wins *provided nothing lower has been loaded yet*
- copy-to-other-languages' `get()` for react is NEVER called
- copy-to-other-languages' `loadShare("react")` resolves to the host's 18.3.1

### Why quick-find Crashes (Version Tie)

quick-find declares react **18.3.1** — the SAME version as the host. When two entries collide on the same version key:
- The incumbent is replaced when `uniqueName > activeVersion.from` — a **lexicographic string compare**, not registration order (webpack `ShareRuntimeModule.js:103`; MF runtime-core mirror ~`:2735`). Both `kfinder` and `quickfind` sort after `@jahia/jcontent`, which is why quick-find took the 18.3.1 key. A rename changes this outcome; registration order never did
- quick-find's `get()` is called, returning either a separate React instance (pre-built) or an empty factory (patched)
- Either outcome breaks the platform

### copy-to-other-languages vs quick-find Bundle Comparison

**copy-to-other-languages react shared entry:**
```javascript
{name:"react", version:"18.2.0", ...,
 async get(){
   usedShared.react.loaded=!0;
   const {react:t} = importMap;          // loads pre-built React 18.2.0
   r = {...await t()};
   return function(){return r}            // proper factory
 }}
```

**quick-find react shared entry (with import:false + patch):**
```javascript
{name:"react", version:"18.3.1", ...,
 async get(){return ()=>{}},             // empty factory — provides {} as React
 shareConfig:{singleton:!0, import:!1}}
```

## Compatibility Gap

There is a fundamental incompatibility between:
- **Vite federation's `import: false`**: designed for Vite-to-Vite federation where `loadShare()` resolves from the runtime's share scope without ever calling `get()`
- **Webpack federation's `consumes`**: always calls `get()` on every shared entry to populate the scope, expecting a factory function

However, this gap is irrelevant IF the version negotiation prevents the Vite module from ever winning. The real fix is to ensure quick-find's shared entry versions are LOWER than the host's, matching copy-to-other-languages' pattern.

## Recommended Fix

### Downgrade react/react-dom to match copy-to-other-languages — SUPERSEDED, NOT APPLIED

> Kept for history. Its rationale ("the host's 18.3.1 always wins negotiation") is wrong:
> election is loaded-first, then highest. The `version: "0.0.0"` override in the Resolution
> section was shipped instead.

1. Change `react` and `react-dom` in package.json from `^18.3.1` to `^18.2.0`
2. Remove ALL custom `shared` config from vite.config.ts
3. Remove the `patchSharedGetThrows` plugin entirely
4. Let the Jahia plugin auto-share everything from `dependencies` as `{ singleton: true }`

**Result**: quick-find's react 18.2.0 entry has a real `get()` with a pre-built bundle. The host's 18.3.1 always wins negotiation, so quick-find's `get()` is never called. quick-find's `loadShare("react")` resolves to the host's 18.3.1. This matches exactly what copy-to-other-languages does.

**Risk**: If the platform ever downgrades react below 18.2.0, quick-find would become the provider. Very unlikely since the platform is moving to higher versions.

### Alternative: Use version override in shared config

If downgrading the dependency isn't desirable (e.g., for type compatibility), set an explicit low version in the shared config:
```typescript
shared: {
  react: { singleton: true, version: "0.0.0" },
  "react-dom": { singleton: true, version: "0.0.0" },
}
```
This makes quick-find lose a **contested** election against an unloaded higher version. It does **not** make quick-find lose an uncontested one: a sole registrant is elected unconditionally (`ConsumeSharedRuntimeModule.js:208`, `if (!exists(scope, key)) return useFallback(...)`), and loaded-stickiness means a 0.0.0 entry loaded first stays elected. When 0.0.0 wins it satisfies no caret range at all, so it both triggers the warning and hands the consumer quick-find's own bundled copy — strictly worse than advertising the real version.

## Resolution: version: "0.0.0" Override

### What Fixed the Crash

The fix that resolved the page-load crash:

1. **Removed `import: false`** from all shared entries — let the Vite plugin generate pre-built bundles normally (real factories, not empty/throwing ones)
2. **Removed the `patchSharedGetThrows` plugin** — no longer needed
3. **Set `version: "0.0.0"`** for seven host-provided deps, so quick-find loses a contested singleton election

This produces shared entries with real `get()` factories (matching copy-to-other-languages' pattern) but version 0.0.0, which loses to any *unloaded* higher version the host has registered. In practice the host's React is selected and the crash is gone.

> **The override does not cover everything it appears to.** `@jahia/vite-federation-plugin`
> auto-shares **every** `dependencies` key as `{singleton: true}` and merges the explicit
> `shared` block over that map **per key, replacing the whole value** (`dist/index.js:61-64`;
> `devDependencies` are not auto-shared). quick-find therefore ships **nine** shared singletons
> and the override reaches **seven**. Verified in the shipped artefact: `index.js` contains
> nine `from:"quickfind"` descriptors and exactly seven `version:"0.0.0"`, with
> `@jahia/moonstone` at `2.19.0` and `@jahia/ui-extender` at `1.2.0`. Both are **lower** than
> jcontent's 2.20.3 / 1.3.0, so if either is elected jcontent both warns and receives
> quick-find's older copy. The plugin's own JSDoc (`index.d.ts:18-22`) calls the block
> "Additional dependencies", which reads as additive and is not.

### Additional Fix: Restored Modified Source Files

Several source files had been modified during prior investigation and needed to be restored from the GitHub `main` branch:

- **`src/javascript/quick-find/routes.tsx`** — Had been changed to use `window.jahia?.i18n` instead of `import i18n from "i18next"`. The `mountModal()` function had an early return if `window.jahia.i18n` was undefined, silently preventing the modal from ever mounting. **This was why the search modal didn't appear even after the crash was fixed.**
- **`src/javascript/quick-find-providers/features/register.ts`** — Had been changed to use `window.jahia?.i18n?.t` instead of `import i18n from "i18next"`. Restored.
- **`src/javascript/globals.d.ts`** — Had extra `i18n` type declarations added for `window.jahia.i18n`. Restored.

To restore: `git checkout HEAD -- src/javascript/globals.d.ts src/javascript/quick-find-providers/features/register.ts`
For routes.tsx: compared against `https://raw.githubusercontent.com/Jahia/quick-find/main/src/javascript/quick-find/routes.tsx` and restored.

### Current Working vite.config.ts

```typescript
import { defineConfig } from "vite";
import jahia from "@jahia/vite-federation-plugin";

export default defineConfig(({ mode }) => ({
  build: {
    outDir: "./src/main/resources/javascript/apps/",
    minify: mode !== "development",
    sourcemap: mode === "development",
  },
  plugins: [
    jahia({
      exposes: {
        "./init": "./src/javascript/init.ts",
      },
      dts: false,
      shared: {
        react: { singleton: true, version: "0.0.0" },
        "react-dom": { singleton: true, version: "0.0.0" },
        "@apollo/client": { singleton: true, version: "0.0.0" },
        "prop-types": { singleton: true, version: "0.0.0" },
        graphql: { singleton: true, version: "0.0.0" },
        i18next: { singleton: true, version: "0.0.0" },
        "react-i18next": { singleton: true, version: "0.0.0" },
      },
    }),
  ],
}));
```

### What `version: "0.0.0"` does NOT change — the demand side

The override lowers only what quick-find **advertises**. What it **demands** is computed
separately as `^<installed version read from node_modules>`
(`@module-federation/vite/lib/index.mjs:583` and `:588`, reading the installed `package.json`
at `:557`). So `@apollo/client` ships as `version:"0.0.0"` with `requiredVersion:"^3.14.1"`
while `package.json` declares `^3.11.0`.

Two consequences:

1. The accept-anything setting is `requiredVersion: "*"`, not `version: "0.0.0"`.
2. The demand floor baked into the jar moves whenever the lockfile re-resolves, with no
   reviewable config change — and `src/main/resources/javascript/apps` is git-ignored
   (`.gitignore:18`), so the shipped descriptors never appear in a pull request.

Note the opposite convention on the host side: `@jahia/webpack-config` uses the **declared**
range (`getModuleFederationConfig.js:94`), not the installed version.

### The two warning strings — do not confuse them

`Unsatisfied version X from M of shared singleton module L (required R)` is **webpack's**
(`ConsumeSharedRuntimeModule.js:159`). `M` is the **elected supplier's** registrar. The consumer
is anonymous: only its range `R` is printed, so `R` can never identify who complained. `R` is
printed in its *emitted* form, not the declared one, so jcontent's moonstone prints
`>=2.20.3 <3.0.0-0` and its react `>=18.3.1 <19.0.0-0` (`getModuleFederationConfig.js:66-86`).

quick-find's own Module Federation runtime emits a **different** string —
`Version V from F of shared singleton module L does not satisfy the requirement of C which
needs R` (`runtime-core/index.esm.js:1064`) — and that one *does* name the consumer.

Any `Unsatisfied version` line therefore came from the webpack host, and `from quickfind` in it
means quick-find **supplied** the elected copy, not that quick-find complained.

### The election rule, stated once

Both runtimes elect **loaded-first, then highest version**:

```js
// webpack ConsumeSharedRuntimeModule.js:146-155
return !a || (!versions[a].loaded && versionLt(a, b)) ? b : a;
// MF runtime-core index.esm.js:966
return !isLoaded(versions[prev]) && versionLt(prev, cur);
```

A **lower version that is already loaded beats a higher unloaded one.** Three consequences that
the earlier sections of this document got wrong:

- A `0.0.0` entry is elected **unconditionally** when quick-find is the only registrant of that
  library (`ConsumeSharedRuntimeModule.js:208`).
- A `0.0.0` entry loaded before the host registers its own stays elected by stickiness.
- When a `0.0.0` entry wins, it satisfies **no** caret range, so the platform both warns and
  runs quick-find's bundled copy.

### Live quick-find-owned supply defects (as of 2026-09-11)

The nine descriptors actually shipped in `index.js`:

| Shared library | Supplied | Required |
|---|---|---|
| react | 0.0.0 | ^18.3.1 |
| react-dom | 0.0.0 | ^18.3.1 |
| @apollo/client | 0.0.0 | ^3.14.1 |
| prop-types | 0.0.0 | ^15.8.1 |
| graphql | 0.0.0 | ^16.13.1 |
| i18next | 0.0.0 | ^20.6.1 |
| react-i18next | 0.0.0 | ^11.18.6 |
| **@jahia/moonstone** | **2.19.0** | ^2.19.0 |
| **@jahia/ui-extender** | **1.2.0** | ^1.2.0 |

Three defects follow:

1. **i18next — quick-find is plausibly the sole registrant.** jcontent declares i18next but
   never imports it, so webpack emits no provide module for it (no `from 'i18next'` anywhere in
   `jcontent/src/javascript`, no `l("i18next",...)` in its `remoteEntry.js`). A sole registrant
   is elected unconditionally, and this document's own live capture below records
   `i18next loaded = from quickfind`. The platform then runs quick-find's bundled i18next
   advertised as `0.0.0`, satisfying nobody's range. This is the direct ancestor of the
   `o.on is not a function` failure documented further down.
2. **@jahia/moonstone and @jahia/ui-extender are unguarded and below the host.** Not
   hypothetical: issue #15 already contains `Unsatisfied version 2.17.5 from kfinder of shared
   singleton module @jahia/moonstone`, twice, from a live page.
3. **@apollo/client's demand floor drifts with the lockfile.** quick-find demands `^3.14.1`
   while jcontent supplies `3.14.0`, so quick-find's own runtime warns on every load.

### Verified Behavior

After deploying this config:
- Page loads successfully on `/jahia/administration/manageModules` — no crash
- Page loads successfully on `/jahia/administration/iso-luxe/settings/properties` — no crash
- Zero console errors
- quick-find federation instance loads with react version "0.0.0", `hasLib: false`, `loaded: false`
- quick-find registers 8 entries in the Jahia registry (6 providers, 1 nav item, 1 callback)
- The `quick-find is activated` debug message fires on site-scoped pages where quick-find is installed

### quick-find Search UI — RESOLVED (2026-06-25)

**Fix shipped:** `src/javascript/quick-find/routes.tsx` now unwraps the i18next default
import to the real instance before handing it to `<I18nextProvider>`:

```tsx
import i18nModule from "i18next";
const i18n =
  typeof (i18nModule as { on?: unknown }).on === "function"
    ? i18nModule
    : ((i18nModule as { default?: typeof i18nModule }).default ?? i18nModule);
```

Verified on the live `iso-luxe/settings/properties` page after deploy: the modal opens
via the nav Search button, Cmd+K, and Ctrl+K; translations render ("Welcome to quick-find",
footer hints, etc.); zero console errors.

---

**Symptom**: On `/jahia/administration/iso-luxe/settings/properties`, clicking the nav Search icon and pressing Cmd+K/Ctrl+K do nothing. No modal appears.

**Confirmed via live browser inspection (Claude-in-Chrome, tab on iso-luxe properties page):**

1. The callback `quick-find` and nav item `quick-find-search` are both correctly registered in the registry (`requireModuleInstalledOnSite: "quick-find"`, targets correct).
2. `mountModal()` DOES run — the `#quick-find-search-modal` container div is created and a React root is attached (`__reactContainer$...`).
3. BUT the React root commits **empty** — walking `fiberRoot.current.child` finds zero function components. The `<I18nextProvider><QuickFindModal/></I18nextProvider>` tree **throws during render**, React unmounts it (no error boundary), leaving an empty container. No effect runs → no `keydown`/`quick-find:open-search` listener attaches → clicking/Cmd+K do nothing.
4. Dispatching `quick-find:open-search` on `window` fires (probe confirmed) but has no handler.

**The render error (captured by intercepting console.error + window.onerror while re-invoking the callback):**
```
TypeError: o.on is not a function
  at .../serverSettings/.../_virtual_mf_..._loadShare__react_mf_2_i18next__loadShare__.mjs
  at .../serverSettings/.../_virtual_mf_..._loadShare___mf_0_jahia_mf_1_moonstone__loadShare__.mjs
```
This is react-i18next calling `i18n.on('languageChanged', ...)` on an i18n instance that lacks `.on`. The throw is inside **Moonstone's** react-i18next usage (Moonstone `<Modal>` is rendered by quick-find), react-i18next version **17.0.8** (provided by copy-to-other-languages).

**Resolved share-scope versions (from `window.__FEDERATION__.__SHARE__`):**
- `react-i18next` loaded = **17.0.8** (from `@jahia/copy-to-other-languages`); quickfind's `^11.18.6` entry is NOT loaded.
- `i18next` loaded = from `quickfind`, requiredVersion `^26.3.0`.
- `react` loaded = 18.3.1 (from cotl) — fine.

**Key clue that needs follow-up:**
- `window.jahia.i18n` has `t()` but **NO `.on`** (`typeof window.jahia.i18n.on === "undefined"`). It is a limited wrapper, NOT a full i18next instance.
- HOWEVER, the shared `i18next` instance resolved directly from the federation share scope (quickfind scope, via `entry.get()`) DOES have `.on` and `.t` (both functions). So `import i18n from "i18next"` *should* resolve to a valid instance with `.on`.

**Open contradiction to resolve tomorrow:** the shared i18next instance has `.on`, yet react-i18next throws `o.on is not a function`. Hypotheses to test next session:
  1. `import i18n from "i18next"` inside the quickfind bundle resolves to the ES module *namespace* (`{default: instance}`) rather than the instance itself, so `i18n.on` is undefined while `i18n.default.on` exists — i.e. an interop/`__esModule` default-unwrapping mismatch in the Vite-federation `loadShare` for i18next. Check what quick-find's built bundle actually binds for `import i18n from "i18next"`.
  2. The `o` that throws is the i18n Moonstone pulls from React context (the one quick-find passed to `<I18nextProvider i18n={i18n}>`). If quick-find passes the namespace object, Moonstone's react-i18next 17 calls `.on` on it → throws. Verify by logging the actual value quick-find passes.
  3. react-i18next 17 (cotl) vs the i18next instance interplay — possibly initReactI18next was never run against this i18n, but `.on` missing points more to #1/#2.

**Likely fix direction (validate before applying):** ensure quick-find passes a real i18next *instance* to `I18nextProvider`. Either:
  - unwrap default explicitly, or
  - use `window.jahia.i18n` only if it's a full instance (it is NOT — lacks `.on`), or
  - get the instance via `react-i18next`'s `getI18n()` / `useTranslation().i18n` instead of importing i18next directly, or
  - stop forcing i18next as a `version: "0.0.0"` shared singleton and let the host's canonical instance flow through.

Compare against how `copy-to-other-languages` (which works) imports/uses i18next + react-i18next — it provides react-i18next 17.0.8 itself, so its usage is the reference pattern.

### CONFIRMED ROOT CAUSE + FIX (2026-06-25, follow-up session)

Live runtime inspection (`window.__FEDERATION__.__SHARE__` + the deployed loadShare chunks) settled the contradiction. Hypotheses #1 and #2 were both correct:

- The shared-singleton i18next that consumers actually receive at runtime (the cached
  `.lib()` instance) **is literally `window.jahia.i18n`** — and that object is the i18next
  **module namespace**, not a live instance. It exposes `t`, `init`, `use`, `createInstance`,
  `loadNamespaces`, `changeLanguage`, … but **NOT** the EventEmitter/store API
  (`.on`, `.off`, `.store`, `.options`, `.language`, `.isInitialized`).
- The real, initialized i18next instance lives at **`window.jahia.i18n.default`** (`.on` is a
  function, `isInitialized: true`). It is also exactly the instance react-i18next already uses
  as its good default (`getI18n()`), which is why normal admin pages render fine.
- Because Jahia's shared i18next module has **no `__esModule` marker**, the Vite-federation
  loadShare glue (`const n = o.__esModule ? o.default : o`) leaves `import i18n from "i18next"`
  equal to the **namespace** (no `.on`) instead of unwrapping to `.default`.
- quick-find's `routes.tsx` then did `<I18nextProvider i18n={i18n}>` with that namespace object.
  Moonstone components inside the modal (`<Modal>`) call `useTranslation()`, which reads the
  i18n from context and runs `i18n.on('languageChanged', …)` during render →
  **`TypeError: o.on is not a function`**. React unmounts the whole modal subtree (no error
  boundary) → empty container, no `keydown`/`quick-find:open-search` listeners attach → the nav
  button and ⌘K/Ctrl+K silently do nothing.

**Empirical proof:** monkey-patching `window.jahia.i18n` to delegate `.on`/`.off`/`.store`
to its `.default` and re-running the mount produced zero errors and a visible modal — the
missing `.on` was the *sole* cause.

**Fix shipped** in `src/javascript/quick-find/routes.tsx` — unwrap to the real instance before
passing it to the provider (and it doubles as a guard for environments where the import is
already a live instance):

```tsx
import i18nModule from "i18next";
const i18n =
  typeof (i18nModule as { on?: unknown }).on === "function"
    ? i18nModule
    : ((i18nModule as { default?: typeof i18nModule }).default ?? i18nModule);
```

`register.ts` only calls `i18n.t(...)`, which works on the namespace wrapper, so it was left
unchanged. Verified end-to-end on the live `iso-luxe/settings/properties` page after deploy:
modal opens via nav button + ⌘K + Ctrl+K, translations render, no console errors.

### (original) Remaining note

The quick-find module needs to be installed/enabled on the specific site (via `requireModuleInstalledOnSite: "quick-find"`) for the callback to fire and the search modal to mount. The nav button renders globally but the callback (which mounts the modal and enables Cmd+K) only runs in site context where quick-find is deployed. Verify quick-find is enabled on the ISO Luxe site via Administration > Sites > ISO Luxe > Modules.

## Build Notes

- Node version: must use Node 22 via `eval "$(mise activate bash)"` (Vite requires Node 20.19+)
- Maven clean can fail on macOS due to xattr/DS_Store; use `xattr -cr target && find target -name '.DS_Store' -delete && rm -rf target` before `mvn install`
- Run from the repository root, not from a parent directory that also contains a `pom.xml`

## Quick Repro (Before Fix)

1. Deploy module with `import: false` or matching host version
2. Open /jahia/administration/manageModules
3. Observe load stall and fatal JS exceptions in console

## Outcome

**The page-load crash and the modal mount are RESOLVED.** The federation warnings are not.

Two causes were fixed:

1. **quick-find won the singleton election for react 18.3.1.** It collided with the host on the
   same version key and took it via the lexicographic `uniqueName` tie-break, then supplied its
   own bundled React. Mitigated by advertising `version: "0.0.0"` for seven libraries. Mitigated,
   not eliminated: see the election rule and the nine-versus-seven gap above.
2. **Modified source files.** `routes.tsx` and `features/register.ts` had been changed to use
   `window.jahia.i18n` instead of `import i18n from "i18next"`, silently breaking the modal
   mount. Fixed by restoring from GitHub `main`.

**STILL OPEN — the federation singleton warnings**
([Jahia/quick-find#15](https://github.com/Jahia/quick-find/issues/15)). The `0.0.0` override
fixed none of the eight quick-find-named lines in that ticket. Every consumer range in them
(`^16.x` react, `^19.x` i18next, `^1.x` moonstone, `^13.x` react-i18next) is unsatisfiable by
**any** version present in the modern share scope, including `0.0.0`, so each line re-fires
naming whichever module is elected. Closing #15 on the strength of the rename or the `0.0.0`
config would be wrong.
