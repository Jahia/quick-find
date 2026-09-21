/**
 * Builds the `nodeConstraint` that the three JCR search providers send to
 * `jcr.nodesByCriteria`.
 *
 * Pure and dependency-free on purpose — no React, no registry, no Apollo — so the
 * clause list can be exercised on its own.
 *
 * `contains` and `like` do not read the same store, and that is the whole reason this
 * builder emits several clauses instead of one. `contains` reads the Lucene index,
 * whose text is lowercased, accent-folded, stemmed and split into tokens. `like` reads
 * the raw stored property value and folds nothing. Every clause below was measured
 * against a live Jahia 8.2; each one catches input that the others miss.
 */

/** A `contains` clause reads the Lucene index; without a property it reads the whole node. */
type ContainsClause = {
  contains: string;
  property?: string;
};

/** A `like` clause reads the raw stored value, and JCR QOM requires a property for it. */
type LikeClause = {
  like: string;
  property: string;
  function: "LOWER_CASE";
};

/** A nested `all` group: every clause inside it has to hold on the same node. */
type AllGroup = {
  all: ContainsClause[];
};

/** Shape of the GraphQL `InputGqlJcrNodeConstraintInput` value this module produces. */
export type JcrSearchConstraint = {
  any: (ContainsClause | LikeClause | AllGroup)[];
};

/**
 * The index stores folded text, and a wildcard term is compared to it unanalyzed.
 *
 * NFD splits an accented letter into its base letter and a combining mark, and the
 * range dropped here is the Unicode "Combining Diacritical Marks" block. The range is
 * written with escapes rather than the marks themselves, which are invisible in a
 * source file and which a reformat could silently alter.
 *
 * The result is recomposed. NFD decomposes far more than Latin accents: a Hangul
 * syllable becomes its jamo, and those are outside the range stripped here, so a
 * decomposed Korean term no longer matches an index that stores the composed form.
 */
const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");

/** Inside a `like` pattern `%` and `_` are wildcards: a user typing `%` would match every node. */
const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

/** Below this length a leading-wildcard term costs the most and discriminates the least. */
const MIN_WILDCARD_TOKEN_LENGTH = 3;

/**
 * Turns raw search-box input into a node constraint, or `null` when the input is blank.
 *
 * `null` means "send no query at all", and it is returned for blank input only. It is
 * not an empty constraint: the repository refuses one. Measured on 8.2.3.2, `{any: []}`
 * comes back as `javax.jcr.query.InvalidQueryException: Constraints must not be null`,
 * and `{}` as "at least one constraint field is expected". So the caller has to skip
 * the request rather than send an empty constraint.
 *
 * Every other input produces a constraint, including one whose characters are all
 * stripped by the sanitization below: the two `like` clauses are always emitted, so a
 * term such as `%%%%` still asks the repository for a raw title or node name holding
 * that text, and normally comes back empty.
 */
export function buildJcrSearchConstraint(
  input: string,
): JcrSearchConstraint | null {
  const lowercased = input.trim().toLowerCase();
  if (!lowercased) {
    return null;
  }

  // `contains` parses its argument, and ordinary keyboard input breaks that parser:
  // `privacy!`, `foo(`, an unclosed quote, a bare `OR` and `--` each raise
  // `Invalid full text search expression`. One bad clause fails the whole `any` list,
  // so the term is reduced to letters, digits and underscores here, before any clause
  // is built. The classes are Unicode property escapes and not `\w`, because `\w` stays
  // ASCII-only even under the `u` flag and would erase every Cyrillic, Greek, Arabic,
  // Hebrew or CJK term, plus the letters NFD leaves undecomposed such as `ß` and `ø`.
  const tokens = fold(lowercased)
    .replace(/[^\p{L}\p{N}_\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const fullText = tokens.join(" ");
  // Whitespace is collapsed to match how the stored value reads; the pattern otherwise
  // keeps the raw text, since `like` is the only clause that still sees punctuation.
  const pattern = `%${escapeLike(lowercased.replace(/\s+/g, " "))}%`;

  const clauses: (ContainsClause | LikeClause | AllGroup)[] = [];

  if (fullText) {
    // Analyzed, so it folds accents and matches the stem of a complete word the editor
    // typed. The wildcard clauses below cannot replace it: they are not analyzed, and
    // they match the stem only, so `chateaux` finds "Châteaux et Haras" only here.
    clauses.push({ contains: fullText });
  }

  // A wildcard term skips the analyzer and is compared to the index as written — hence
  // the caller-side fold and lowercase above. This is what finds a fragment in the
  // middle of a word (`hateau`) and a short prefix (`chat`), which the analyzed clause
  // misses. Each token needs its own clause, because several tokens inside one
  // `contains` expression are ANDed and a wildcard term is matched against a single
  // index term. The clauses go inside a nested `all` group so that they keep being
  // ANDed: as separate members of `any` they would turn a two-word search into an OR,
  // and a node holding only one of the words would push the node the user meant off a
  // section that shows four rows.
  if (tokens.length > 0) {
    clauses.push({
      all: tokens.map((token) => ({
        // Every token joins the group, or the group re-widens what the analyzed clause
        // narrowed: dropping a short token made `quokka zz` match a node holding only
        // `quokka`. A short token keeps its analyzed form instead, because a leading
        // wildcard on one or two characters costs the most and discriminates the least.
        contains:
          token.length >= MIN_WILDCARD_TOKEN_LENGTH ? `*${token}*` : token,
      })),
    });
  }

  if (fullText) {
    // `j:tagList` is declared `nofulltext`, which keeps it out of the aggregated node
    // text but leaves it its own full-text field. Measured: the property-scoped query
    // matched more nodes than the unscoped one, so this is not a duplicate of the first
    // clause.
    clauses.push({ contains: fullText, property: "j:tagList" });
  }

  // `like` reads the raw value, so these two clauses recover what the analyzer dropped:
  // the accent the user actually typed, and the punctuation stripped from the tokens.
  // `LOWER_CASE` lowercases the property and not the pattern, which is why the pattern
  // carries the lowercased input.
  clauses.push({
    like: pattern,
    property: "jcr:title",
    function: "LOWER_CASE",
  });
  // The node name reaches the aggregated text but does not answer a property-scoped
  // `contains`, so a substring of a node name is reachable only through `like`.
  clauses.push({
    like: pattern,
    property: "j:nodename",
    function: "LOWER_CASE",
  });

  return { any: clauses };
}
