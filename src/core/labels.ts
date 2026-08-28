/**
 * labels.ts — deterministic parsing of the printed consent mark.
 *
 * Korean consent forms print every item as required (`필수`) or optional
 * (`선택`). That mark is the answer key; this module reads it. The Korean
 * words below are the literals printed on the page, so they are data, not
 * prose. No AI, no DOM, no network.
 *
 * The convention began with article 22 of the Personal Information Protection
 * Act, which requires it for personal data, but it did not stay there: terms of
 * service, payment terms and marketing consent are marked the same way, and
 * those are governed by other statutes — or by contract law and no privacy
 * statute at all. This module reads the mark and takes no view on which law
 * applies to the item carrying it.
 *
 * Safety rule (S2): ambiguity must never resolve to "required", because
 * "required" is the only value that can lead to a box being checked.
 */

import type { Mark } from './types.js';

const REQUIRED = /필수/;
const OPTIONAL = /선택/;

/** A printed denial of required: "not required", "non-required". */
const NEGATED_REQUIRED = /비\s*필수|필수(?:가|는|를|도)?\s*아[니닙님]/;

/** "agree to all" and its variants, with a bounded gap for wordier phrasings. */
const SELECT_ALL = /(?:전체|모두|일괄|전부)[^\n]{0,8}?(?:동의|선택)/;

/**
 * Collapse runs of whitespace without deleting them: a mark with a space
 * inside it ("필 수") must NOT collapse into a mark ("필수"). A word split
 * across characters is not a word.
 */
function normalize(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function parseMark(text: string | null | undefined): { mark: Mark } {
  const s = normalize(text);
  if (!s) return { mark: 'absent' };

  const negated = NEGATED_REQUIRED.test(s);
  const required = REQUIRED.test(s) && !negated;
  const optional = OPTIONAL.test(s) || negated;

  // Both marks in one scope is ambiguous. Ambiguity resolves toward optional,
  // which resolves toward unchecked. Never toward required.
  if (optional) return { mark: 'optional' };
  if (required) return { mark: 'required' };
  return { mark: 'absent' };
}

/** True when the text labels a select-all ("agree to everything") control. */
export function isSelectAllText(text: string | null | undefined): boolean {
  const s = normalize(text);
  if (!s) return false;
  return SELECT_ALL.test(s);
}

/**
 * Walk an ordered list of candidate texts (label, then siblings, then
 * ancestors) and return the first mark found. `source` is the index that
 * carried the mark, or -1.
 */
export function resolveMark(
  candidates: ReadonlyArray<string | null | undefined>
): { mark: Mark; source: number } {
  const list = Array.isArray(candidates) ? candidates : [];
  for (let i = 0; i < list.length; i++) {
    const { mark } = parseMark(list[i]);
    if (mark !== 'absent') return { mark, source: i };
  }
  return { mark: 'absent', source: -1 };
}
