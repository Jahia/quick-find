---
name: jahia-graphql-frontend
description: "Use when writing GraphQL queries in a Jahia module JavaScript/TypeScript codebase. Covers gql tagged templates, imperative client.query() pattern, nodesByCriteria for JCR content searches, augmented search vs JCR tradeoffs, stale response filtering, and schema introspection setup."
---

# Jahia GraphQL — Frontend Queries

## When to Use

Load this skill when writing GraphQL query definitions or executing queries from JavaScript/TypeScript in a Jahia module.

---

## Query Definitions

Define queries in **dedicated files** (e.g. `myFeatureQuery.ts`), never inline in components or providers.

```ts
// myFeatureQuery.ts
import { gql } from "@apollo/client";

export const MY_QUERY = gql`
  query MyQuery($param: String!, $siteKey: String!) {
    jcr {
      nodesByCriteria(
        criteria: { nodeType: "jnt:page", paths: ["/sites/$siteKey"] }
      ) {
        nodes {
          uuid
          path
          name
          displayName
          primaryNodeType {
            name
          }
        }
      }
    }
  }
`;
```

---

## Executing Queries — Imperative Pattern

Use `client.query(...)` directly (not `useQuery`/`useLazyQuery`) when calling from provider factories, utility functions, or any code that runs outside a React component:

```ts
const result = await client.query<{
  jcr: { nodesByCriteria: { nodes: GqlJcrNode[] } };
}>({
  query: MY_QUERY,
  variables: { nodeConstraint, sitePath, language, limit, offset },
  fetchPolicy: "network-only",
});

const nodes = result.data?.jcr?.nodesByCriteria?.nodes ?? [];
```

**Always type the response** with a generic type argument — it prevents silent `any` propagation.

**Always use `fetchPolicy: 'network-only'`** for search queries — Apollo's cache returns stale data that produces incorrect search results.

`useQuery` / `useLazyQuery` are only appropriate inside **React components** that render query state directly.

---

## JCR Content Search — `nodesByCriteria`

The standard pattern for searching JCR nodes by type and free-text content. The whole
constraint is built in TypeScript and passed as **one variable** — see the next section
for why the user's text must never reach `contains` directly:

```graphql
query SearchContent(
  $nodeConstraint: InputGqlJcrNodeConstraintInput!
  $sitePath: String!
  $language: String!
  $limit: Int!
  $offset: Int!
) {
  jcr {
    nodesByCriteria(
      criteria: {
        nodeType: "jnt:page"
        paths: [$sitePath]
        nodeConstraint: $nodeConstraint
      }
      size: $limit
      offset: $offset
      language: $language
    ) {
      nodes {
        uuid
        path
        name
        displayName
        primaryNodeType {
          name
        }
      }
    }
  }
}
```

Standard variable shapes:

| Variable         | Value pattern                                          |
| ---------------- | ------------------------------------------------------ |
| `nodeConstraint` | The clause tree built from the user's query (see below) |
| `sitePath`       | `/sites/{siteKey}`                                      |
| `language`       | Locale code (e.g. `en`, `fr`)                            |
| `limit`          | Page size + 1 to detect `hasMore`                        |
| `offset`         | `page * pageSize`                                        |

Request `pageSize + 1` items: if you receive more than `pageSize`, there are more pages — slice to `pageSize` before rendering.

---

## Never send raw user text to `contains`

`nodeConstraint: { contains: $searchTerm }` with the string the user typed is a defect,
and it is the shape this module shipped until the search-matching fix. Four measured
reasons, all against Jahia 8.2:

1. **`contains` parses its argument.** `privacy!`, `foo(`, `"unclosed`, a bare `OR` and
   `--` each raise `javax.jcr.RepositoryException: Invalid full text search expression`.
   A search box wired straight to `contains` fails on an exclamation mark.
2. **One bad clause fails the whole constraint.** The exception covers the entire
   `nodeConstraint`, so a broken `contains` also kills the `like` clauses beside it in
   an `any` list. Sanitization has to happen before the constraint is built.
3. **`contains` and `like` read different stores.** `contains` reads the Lucene index
   (lowercased, accent-folded, stemmed, tokenized). `like` reads the raw stored value,
   folds nothing, and JCR QOM requires a `property` for it. One operator alone cannot
   serve a search box.
4. **A `like` pattern carries the user's text, where `%` and `_` are wildcards.** A user
   typing `%` matches every node under the site. Escape `\`, `%` and `_`.

Build the constraint in a pure, dependency-free module so it can be reasoned about and
exercised on its own:

```ts
// The combining-mark range is written with \u escapes: the marks themselves are
// invisible in a source file and a reformat can silently alter them. The result is
// recomposed, because NFD decomposes far more than Latin accents — a Hangul syllable
// becomes its jamo, which this range does not strip, and a decomposed Korean term no
// longer matches an index that stores the composed form.
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

// Below this length a leading-wildcard term costs the most and discriminates the least.
const MIN_WILDCARD_TOKEN_LENGTH = 3;

export function buildSearchConstraint(input: string) {
  const lower = input.trim().toLowerCase();
  if (!lower) {
    // Send no query at all. Not an empty constraint: the repository refuses one —
    // `{any: []}` raises `InvalidQueryException: Constraints must not be null`, and
    // `{}` raises "at least one constraint field is expected".
    return null;
  }

  // \p{L}\p{N}, not \w: \w stays ASCII-only even under the u flag and would erase
  // every Cyrillic, Greek, Arabic, Hebrew or CJK term.
  const tokens = fold(lower)
    .replace(/[^\p{L}\p{N}_\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const fullText = tokens.join(" ");
  // Repeated inner whitespace is collapsed, to read like the stored value; the
  // pattern otherwise keeps the raw text, since `like` is the only clause that
  // still sees punctuation.
  const pattern = `%${escapeLike(lower.replace(/\s+/g, " "))}%`;

  return {
    any: [
      // Analyzed: folds accents and matches a complete word despite stemming.
      ...(fullText ? [{ contains: fullText }] : []),
      // Unanalyzed substring match, one clause per token because a wildcard term is
      // compared to a single index term. The nested `all` keeps the tokens ANDed:
      // as direct members of `any` they would turn a two-word search into an OR.
      // EVERY token joins the group. A token left out of it re-widens what the
      // analyzed clause narrowed: with short tokens dropped, `quokka zz` matched a
      // node holding only `quokka`. A short token joins in its analyzed form.
      ...(tokens.length
        ? [
            {
              all: tokens.map((t) => ({
                contains:
                  t.length >= MIN_WILDCARD_TOKEN_LENGTH ? `*${t}*` : t,
              })),
            },
          ]
        : []),
      // j:tagList is `nofulltext`: out of the aggregated node text, own full-text field.
      ...(fullText ? [{ contains: fullText, property: "j:tagList" }] : []),
      // LOWER_CASE lowercases the property, not the pattern — lowercase it yourself.
      { like: pattern, property: "jcr:title", function: "LOWER_CASE" },
      { like: pattern, property: "j:nodename", function: "LOWER_CASE" },
    ],
  };
}
```

Two more measured traps. A wildcard term skips the analyzer, so it matches the **stem**
held in the index: `*chateau*` matches "Châteaux et Haras" and `*chateaux*` does not —
keep the plain analyzed clause next to the wildcard ones. And `%term%` is not a wildcard
in full text: `%` has no meaning there, it only happens to shield the term from the
parser, which explicit sanitization does properly.

Two traps the shape above encodes, both measured by removing the line and searching
again. `fold` has to recompose: NFD alone turns a Hangul syllable into jamo that the
combining-mark range does not strip, and the decomposed term then matches an index
holding the composed form not at all. And the nested `all` group has to carry every
token: leave the short ones out and the group re-widens what the analyzed clause
narrowed, so `quokka zz` comes back with a node that holds only `quokka`.

The live implementation is
`src/javascript/quick-find-providers/jcrSearchConstraint.ts`.

---

## Augmented Search vs JCR

|                  | Augmented Search                                               | JCR (`nodesByCriteria`)              |
| ---------------- | -------------------------------------------------------------- | ------------------------------------ |
| **Engine**       | Elasticsearch-backed                                           | JCR repository query                 |
| **Speed**        | Fast, full-text                                                | Slower on large repos                |
| **Full-text**    | Yes (with excerpts/highlights)                                 | Limited (`contains` only)            |
| **Availability** | Requires `jmix:augmentedSearchIndexableSite` mixin on the site | Always available                     |
| **Use when**     | Site is indexed, need fast/rich full-text                      | Fallback, or structured node queries |

### Availability check

Before using augmented search, verify the site has the required mixin:

```graphql
query CheckSiteIndexed($path: String!) {
  jcr {
    nodeByPath(path: $path) {
      isNodeType(
        type: { multi: ANY, types: ["jmix:augmentedSearchIndexableSite"] }
      )
    }
  }
}
```

Cache the result per `siteKey` to avoid re-checking on every keystroke.

### Augmented search query shape

```graphql
query Search(
  $q: String!
  $siteKeys: [String]!
  $language: String!
  $size: Int!
  $page: Int!
) {
  search(q: $q, siteKeys: $siteKeys, language: $language, workspace: EDIT) {
    results(size: $size, page: $page) {
      totalHits
      hits {
        id
        path
        displayableName
        excerpt
        nodeType
      }
    }
  }
}
```

Note: augmented search uses **page-based** pagination (`page` number), while JCR uses **offset-based** (`offset`).

---

## Stale Response Filtering

When search queries fire on every keystroke, an earlier slow response can arrive after a later fast one, rendering stale results. Guard against this with an `activeQuery` tracker:

```ts
let activeQuery = "";

async function search(query: string, page: number): Promise<SearchResult> {
  activeQuery = query;

  const result = await client.query({
    query: MY_QUERY,
    variables: { q: query, page },
    fetchPolicy: "network-only",
  });

  // Discard if a newer query replaced this one while awaiting
  if (activeQuery !== query) {
    return { hits: [], hasMore: false };
  }

  return { hits: result.data?.search?.results?.hits ?? [], hasMore: false };
}

function reset() {
  activeQuery = "";
}
```

---

## Schema Introspection Artifact

Maintain a `graphql-schema.json` introspection file in the module for IDE support (GraphQL language server, Apollo VS Code extension for autocomplete and type validation).

Generate it by running an introspection query against your development Jahia instance:

```bash
npx apollo client:download-schema --endpoint=http://localhost:8080/modules/graphql graphql-schema.json
# or via yarn apollo script if configured
```

Reference it in Apollo VS Code extension config (`apollo.config.js`):

```js
module.exports = {
  client: {
    service: { localSchemaFile: "./graphql-schema.json" },
  },
};
```
