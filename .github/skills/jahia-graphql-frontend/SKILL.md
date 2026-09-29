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
  variables: { searchTerm, wildcardTerm, likePattern, sitePath, language, limit, offset },
  fetchPolicy: "network-only",
});

const nodes = result.data?.jcr?.nodesByCriteria?.nodes ?? [];
```

**Always type the response** with a generic type argument — it prevents silent `any` propagation.

**Always use `fetchPolicy: 'network-only'`** for search queries — Apollo's cache returns stale data that produces incorrect search results.

`useQuery` / `useLazyQuery` are only appropriate inside **React components** that render query state directly.

---

## JCR Content Search — `nodesByCriteria`

The standard pattern for searching JCR nodes by type and free-text content. Keep the
constraint **fixed in the document** and pass only sanitized scalars, so a reader of the
query file can see the call the repository receives. See the next section for why the
user's text must never reach `contains` directly:

```graphql
query SearchContent(
  $searchTerm: String! # sanitized words; the repository ANDs them
  $wildcardTerm: String! # the same words wrapped in *, for substring matching
  $likePattern: String! # %escaped raw text%
  $sitePath: String!
  $language: String!
  $limit: Int!
  $offset: Int!
) {
  jcr(workspace: EDIT) {
    nodesByCriteria(
      limit: $limit
      offset: $offset
      criteria: {
        nodeType: "jnt:page"
        paths: [$sitePath]
        pathType: ANCESTOR
        language: $language
        # Five clauses and not one: contains reads the folded, stemmed Lucene
        # index and like reads the raw stored value, so each clause catches
        # input the others miss.
        nodeConstraint: {
          any: [
            { contains: $searchTerm }
            { contains: $wildcardTerm }
            { contains: $searchTerm, property: "j:tagList" }
            { like: $likePattern, property: "jcr:title", function: LOWER_CASE }
            { like: $likePattern, property: "j:nodename", function: LOWER_CASE }
          ]
        }
      }
    ) {
      nodes {
        uuid
        path
        name
        displayName(language: $language)
        primaryNodeType {
          name
        }
      }
    }
  }
}
```

Standard variable shapes:

| Variable       | Value pattern                                       |
| -------------- | --------------------------------------------------- |
| `searchTerm`   | Sanitized words joined by a space                    |
| `wildcardTerm` | The same words, each wrapped in `*` from 3 chars up  |
| `likePattern`  | `%` + escaped, lowercased raw text + `%`             |
| `sitePath`     | `/sites/{siteKey}`                                   |
| `language`     | Locale code (e.g. `en`, `fr`)                        |
| `limit`        | Page size + 1 to detect `hasMore`                    |
| `offset`       | `page * pageSize`                                    |

A `function` value is a GraphQL **enum**, so it is written `LOWER_CASE` in the document
and never quoted.

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

Sanitize in a pure, dependency-free module, and let it produce the three scalars the
document above declares:

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

// \p{L}\p{N}, not \w: \w stays ASCII-only even under the u flag and would erase every
// Cyrillic, Greek, Arabic, Hebrew or CJK term, plus the letters NFD leaves
// undecomposed such as `ß` and `ø`.
const searchTokens = (s: string) =>
  fold(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

// Below this length a leading-wildcard term costs the most and discriminates the least.
const MIN_WILDCARD_TOKEN_LENGTH = 3;

export function buildSearchVariables(input: string) {
  const tokens = searchTokens(input);
  if (tokens.length === 0) {
    // Send no query at all. `contains ""` and `contains " "` both raise
    // `Invalid full text search expression`, and an empty constraint is refused too:
    // `{any: []}` raises `InvalidQueryException: Constraints must not be null`.
    return null;
  }

  return {
    // Analyzed: folds accents and matches a complete word despite stemming. Several
    // words inside ONE expression are ANDed by the repository, so a second word
    // narrows the result — measured, `*chat* haras` matches and `*chat* zz` does not.
    // That is why one expression is enough and a clause per word is not needed.
    searchTerm: tokens.join(" "),
    // Unanalyzed, so it matches a fragment inside a word — and so the caller has to
    // fold and lowercase first. EVERY word joins it, including one under three
    // characters, which keeps its analyzed form: leave the short ones out and the
    // expression re-widens what the rest narrowed, and `quokka zz` comes back with a
    // node holding only `quokka`.
    wildcardTerm: tokens
      .map((t) => (t.length >= MIN_WILDCARD_TOKEN_LENGTH ? `*${t}*` : t))
      .join(" "),
    // LOWER_CASE lowercases the property, not the pattern — lowercase it yourself.
    // Repeated inner whitespace is collapsed, to read like the stored value; the
    // pattern otherwise keeps the raw text, since `like` is the only clause that
    // still sees punctuation. `%` and `_` are escaped because they are wildcards
    // inside a `like` pattern: a user typing `%` would otherwise match every node.
    likePattern: `%${escapeLike(input.trim().toLowerCase().replace(/\s+/g, " "))}%`,
  };
}
```

Gate the search box on the **same** definition of a searchable character that the
tokenizer uses: count `/[\p{L}\p{N}_]/gu` in the folded input, not raw length. A gate on
raw length admits `%%%%`, which reduces to no word at all, and the builder then has
nothing to send. With the gate and the builder agreeing, the `null` above is unreachable
in normal use and stays only as a defensive guard.

Two more measured traps. A wildcard term skips the analyzer, so it matches the **stem**
held in the index: `*chateau*` matches "Châteaux et Haras" and `*chateaux*` does not —
keep the plain analyzed term next to the wildcard one. And `%term%` is not a wildcard in
full text: `%` has no meaning there, it only happens to shield the term from the parser,
which explicit sanitization does properly.

One trap the shape above encodes, measured by removing the line and searching again.
`fold` has to recompose: NFD alone turns a Hangul syllable into jamo that the
combining-mark range does not strip, and the decomposed term then matches an index
holding the composed form not at all.

The live implementation is split in two.
`src/javascript/quick-find/shared/searchTextUtils.ts` holds the fold, the tokenizer and
the character count, so the minimum-length gate and the providers share one definition;
`src/javascript/quick-find-providers/jcr/jcrSearchProvider.ts` builds the three scalars
from the tokens.

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
