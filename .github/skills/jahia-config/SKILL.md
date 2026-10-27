---
name: jahia-config
description: "Use when surfacing configuration from a Jahia OSGi module to JavaScript. Covers the full config bridge: OSGi .cfg → JSP as text/javascript → window.contextJsParameters → typed accessor functions. Includes known reactivity limitations and when to use GraphQL for dynamic config instead."
---

# Jahia Module Configuration

## When to Use

Load this skill when you need to make OSGi module configuration available to JavaScript/TypeScript code in a Jahia module.

---

## The Config Bridge — 4 Layers

```
org.jahia.[org].[module].cfg          (1) OSGi config properties
        ↓  read by JSP via getConfigValues()
src/main/resources/configs/[module].jsp (2) JSP served as text/javascript
        ↓  writes to window
window.contextJsParameters.[module]   (3) JS runtime object
        ↓  consumed via accessor functions
shared/configUtils.ts                 (4) typed accessors with fallback defaults
```

---

### Layer 1 — OSGi `.cfg` file

Location: `src/main/resources/META-INF/configurations/org.jahia.[org].[module].cfg`

```properties
# Default values — deployed with the bundle
minSearchChars=3
defaultDisplayedResults=5
someFeatureEnabled=true
someFeatureMaxResults=4
```

These defaults are overridable at runtime via the Jahia configuration panel or by dropping a `.cfg` file in `$JAHIA_DATA/karaf/etc/`.

---

### Layer 2 — JSP served as `text/javascript`

Location: `src/main/resources/configs/[module].jsp`

```jsp
<%@ page language="java" contentType="text/javascript" import="java.util.Date" %>
<%@ taglib prefix="c" uri="http://java.sun.com/jsp/jstl/core" %>
<%@ taglib prefix="functions" uri="http://www.jahia.org/tags/functions" %>
<c:set var="cfg" value="${functions:getConfigValues('org.jahia.[org].[module]')}"/>
<c:choose>
    <c:when test="${! empty cfg}">
        contextJsParameters.[module]={
            minSearchChars:${cfg['minSearchChars']},
            defaultDisplayedResults:${cfg['defaultDisplayedResults']},
            someFeatureEnabled:${cfg['someFeatureEnabled']},
            someFeatureMaxResults:${cfg['someFeatureMaxResults']}
        }
    </c:when>
    <c:otherwise>
        console.warn("[module] configuration is not available");
    </c:otherwise>
</c:choose>
```

Key rules:

- `contentType="text/javascript"` — the JSP is loaded as a JS script, not HTML.
- Use `${functions:getConfigValues('...')}` — the JSTL function that reads the OSGi config.
- Always wrap with `<c:choose>` and emit `console.warn` in the `<c:otherwise>` branch so failures are visible in the browser console.
- The JSP writes directly to `contextJsParameters` (already available as a global object on the page) — do **not** use `var` or `window.`.
- The example above prints each value raw, so one malformed value (`3a`, `True`) is a script error that drops the whole object. Check each value against the form of its key before it is printed, print `undefined` otherwise, and log a warning that names the key. `src/main/resources/configs/quickFind.jsp` does it.

---

### Layer 3 — Type in `globals.d.ts`

Declare the shape under `window.contextJsParameters` with all fields optional and JSDoc defaults:

```ts
declare interface Window {
  contextJsParameters: {
    currentUser: string;
    siteKey?: string;
    lang?: string;
    /** Populated by [module].jsp from org.jahia.[org].[module].cfg */
    [module]?: {
      /** Minimum characters before search fires. Default: 3. */
      minSearchChars?: number;
      /** Results shown per section before "show more". Default: 5. */
      defaultDisplayedResults?: number;
      /** Whether the feature is enabled. Default: true. */
      someFeatureEnabled?: boolean;
      /** Max results for the feature. Default: 4. */
      someFeatureMaxResults?: number;
    };
    [key: string]: unknown;
  };
}
```

---

### Layer 4 — Typed accessor functions (`shared/configUtils.ts`)

```ts
type ModuleConfig = NonNullable<typeof window.contextJsParameters.[module]>;
type ModuleConfigKey = keyof ModuleConfig;

const cfg = () => window.contextJsParameters.[module];

export function getMinSearchChars(): number {
    return cfg()?.minSearchChars ?? 3;
}

export function getDefaultDisplayedResults(): number {
    return cfg()?.defaultDisplayedResults ?? 5;
}

export function isFeatureEnabled(key: ModuleConfigKey): boolean {
    return cfg()?.[key] !== false;
}

export function getFeatureMaxResults(key: ModuleConfigKey, fallback: number): number {
    return (cfg()?.[key] as number | undefined) ?? fallback;
}
```

Rules:

- **Fallback defaults live here**, not in the JSP. Keeping them in TypeScript means they're enforced in type-safe code.
- The `cfg()` arrow function is called fresh on every access — config is a live read from `window`, not a captured value.
- Use `!== false` (not `=== true`) for booleans so that `undefined` (missing config) defaults to enabled.

---

## Known Limitations

| Limitation             | Detail                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Static snapshot**    | Config is evaluated when the JSP is loaded (page load). Changing the `.cfg` file requires a page reload to take effect in JS. |
| **No reactivity**      | `window.contextJsParameters` is a plain object. It does not emit events; you cannot `watch` or subscribe to changes.          |
| **No per-user config** | All users on the same page receive the same config values.                                                                    |

### When to use GraphQL instead

Use a dedicated GraphQL query (rather than this bridge) when you need:

- **Dynamic** config that changes without a page reload
- **Per-user** or **per-site** config evaluated at query time
- Config values that depend on JCR node state

---

## Debugging

If config is missing at runtime, the JSP's `console.warn` will appear in the browser console. Common causes:

- The `.cfg` file is not deployed with the bundle (check `src/main/resources/META-INF/configurations/`).
- The `getConfigValues()` JSTL function returns empty because the bundle's config PID doesn't match the `.cfg` filename.
- The JSP is not included in the page template (check that `configs/[module].jsp` is referenced in the module's template resources).
