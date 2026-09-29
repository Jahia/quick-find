/**
 * One definition of "searchable text", shared by the minimum-length gate and by the
 * providers that build a query out of the same input.
 *
 * The gate and the query builder have to agree. If the gate counted raw characters it
 * would admit a term such as `%%%` that reduces to no token at all, and the provider
 * would then have to invent something to send: a `contains` clause built from an empty
 * expression raises `javax.jcr.RepositoryException: Invalid full text search expression`.
 * Counting the same characters the tokenizer keeps removes that case entirely.
 *
 * Pure and dependency-free on purpose — no React, no registry, no Apollo — so provider
 * code can import it and this file never imports provider code.
 */

/** Letters, digits and the underscore: what survives tokenization and what the gate counts. */
const SEARCHABLE_CHAR = /[\p{L}\p{N}_]/gu;

/** Everything else, replaced by a separator rather than deleted, so `a.b` stays two tokens. */
const NON_SEARCHABLE_CHAR = /[^\p{L}\p{N}_\s]/gu;

/**
 * Strips Latin accents, so the term reads like the accent-folded text in the index.
 *
 * NFD splits an accented letter into its base letter and a combining mark, and the range
 * dropped here is the Unicode "Combining Diacritical Marks" block. The range is written
 * with escapes rather than the marks themselves, which are invisible in a source file and
 * which a reformat could silently alter.
 *
 * The result is recomposed. NFD decomposes far more than Latin accents: a Hangul syllable
 * becomes its jamo, and those sit outside the range stripped here, so a decomposed Korean
 * term no longer matches an index that stores the composed form.
 */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC");
}

/**
 * Splits raw search-box input into the words a full-text query can carry.
 *
 * `contains` parses its argument, and ordinary keyboard input breaks that parser:
 * `privacy!`, `foo(`, an unclosed quote, a bare `OR` and `--` each raise
 * `Invalid full text search expression`, and one bad clause fails the whole constraint
 * around it. Reducing the term to letters, digits and underscores here is what keeps that
 * from reaching the repository.
 *
 * The classes are Unicode property escapes and not `\w`, because `\w` stays ASCII-only
 * even under the `u` flag: it would erase every Cyrillic, Greek, Arabic, Hebrew or CJK
 * term, plus the letters NFD leaves undecomposed such as `ß` and `ø`.
 */
export function searchTokens(value: string): string[] {
  return fold(value)
    .toLowerCase()
    .replace(NON_SEARCHABLE_CHAR, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Counts the characters of `value` that a search term can actually be built from.
 *
 * Whitespace and punctuation do not count, so `"->x<-"` holds one searchable character
 * and not five. This is the number the minimum-length gate compares against
 * `minSearchChars`.
 */
export function countSearchableChars(value: string): number {
  return fold(value.trim()).match(SEARCHABLE_CHAR)?.length ?? 0;
}
