/**
 * apply.js — the only module that writes to the page.
 *
 * S1: it sets `checked` on checkboxes and dispatches input/change. It never
 * calls click(), never submits a form, never touches any other element.
 */

import type { ConsentItem, Decision } from '../core/types.js';

export interface ApplyChange {
  id: string;
  labelText: string;
  from: boolean;
  to: boolean;
  reason: Decision['reason'];
  flag: Decision['flag'];
}

export interface ApplyReport {
  changed: ApplyChange[];
  skipped: Array<{ id: string; reason: 'detached' | 'disabled' }>;
  unresolved: Array<{ id: string; labelText: string; wanted: boolean }>;
}

const MAX_PASSES = 2;

/** Re-resolve before every write: the page may have re-rendered. */
function resolve(doc: Document, item: ConsentItem): HTMLInputElement | null {
  const el = item.element;
  if (el && el.isConnected) return el;
  try {
    return doc.querySelector<HTMLInputElement>(item.selector);
  } catch {
    return null;
  }
}

/**
 * Set .checked through the native setter so React's value tracker sees the
 * change, then notify listeners.
 */
function setChecked(el: HTMLInputElement, next: boolean): void {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, 'checked');
  if (desc && typeof desc.set === 'function') desc.set.call(el, next);
  else el.checked = next;
  const win = el.ownerDocument.defaultView ?? window;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
  el.dispatchEvent(new win.Event('change', { bubbles: true }));
}

export function applyDecisions(
  doc: Document,
  items: readonly ConsentItem[],
  decisions: readonly Decision[]
): ApplyReport {
  const byId = new Map(items.map((i) => [i.id, i]));
  const wanted: Array<{ decision: Decision; item: ConsentItem; target: boolean }> = [];
  const skipped: ApplyReport['skipped'] = [];

  for (const d of decisions) {
    const item = byId.get(d.id);
    if (!item || d.action === 'leave') continue;
    const el = resolve(doc, item);
    if (!el) {
      skipped.push({ id: d.id, reason: 'detached' });
      continue;
    }
    if (el.disabled) {
      skipped.push({ id: d.id, reason: 'disabled' });
      continue;
    }
    wanted.push({ decision: d, item, target: d.action === 'check' });
  }

  // Select-all first: any cascade it triggers is corrected by the items after it.
  wanted.sort((a, b) => Number(b.item.isSelectAll) - Number(a.item.isSelectAll));

  const changed = new Map<string, ApplyChange>();
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let wrote = 0;
    for (const w of wanted) {
      const el = resolve(doc, w.item);
      if (!el || el.disabled || el.checked === w.target) continue;
      const from = el.checked;
      setChecked(el, w.target);
      wrote++;
      if (!changed.has(w.decision.id)) {
        changed.set(w.decision.id, {
          id: w.decision.id,
          labelText: w.item.labelText,
          from,
          to: w.target,
          reason: w.decision.reason,
          flag: w.decision.flag,
        });
      }
    }
    if (wrote === 0) break;
  }

  const unresolved = wanted
    .filter((w) => {
      const el = resolve(doc, w.item);
      return el && !el.disabled && el.checked !== w.target;
    })
    .map((w) => ({ id: w.decision.id, labelText: w.item.labelText, wanted: w.target }));

  return { changed: [...changed.values()], skipped, unresolved };
}
