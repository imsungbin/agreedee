/**
 * substances.ts — turning a consent moment into a question, and an answer
 * back into something the decision code can use.
 *
 * Both directions are narrow on purpose. Only three fields per item ever leave
 * the page, and only rows carrying an id we asked about ever come back in.
 */

import type { JudgePayload, JudgeRow } from '../bg/providers/types.js';
import type { ConsentItem, MomentKind, SubstanceMap } from '../core/types.js';

/** More than this and we are shipping a whole terms page for one checkbox. */
const MAX_TERMS_SENT = 4000;

/** Only the label, its mark and the terms text leave the page. */
export function payloadFor(items: readonly ConsentItem[], moment: MomentKind): JudgePayload {
  return {
    moment,
    items: items
      .filter((i) => !i.isSelectAll)
      .map((i) => ({
        id: i.id,
        labelText: i.labelText,
        mark: i.mark,
        termsText: (i.termsText || '').slice(0, MAX_TERMS_SENT),
      })),
  };
}

/**
 * `null` rather than an empty map when nothing usable came back, so the caller
 * can tell "the model had nothing to say" from "the model said none of these
 * matter". The first keeps the fast pass; the second is an answer.
 */
export function toSubstanceMap(response: unknown): SubstanceMap | null {
  const envelope = response as { items?: unknown } | null;
  const rows: unknown = Array.isArray(response) ? response : (envelope?.items ?? null);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const map: SubstanceMap = {};
  for (const row of rows as JudgeRow[]) {
    if (row && typeof row.id === 'string') {
      map[row.id] = { substance: row.substance, quote: row.quote };
    }
  }
  return Object.keys(map).length > 0 ? map : null;
}

/** Reject a promise that takes too long, without cancelling the work behind it. */
export function withTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
