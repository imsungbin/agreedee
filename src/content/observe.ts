/**
 * observe.js — find consent moments and watch for new ones.
 *
 * A "moment" is one group of consent checkboxes the user is being asked to
 * agree to at once: a form, or an overlay/dialog that appeared on top of one.
 * Overlays get their own group because re-consent modals are not forms.
 */

import { extractItems } from './extract.js';
import type { ConsentItem, ConsentMoment } from '../core/types.js';

export interface ObserveOptions {
  debounceMs?: number;
}

const MOMENT_ROOTS = 'form, dialog, [role="dialog"], [aria-modal="true"]';
const WATCHED_ATTRS = ['class', 'style', 'hidden', 'aria-hidden', 'disabled', 'required'];

function lowestCommonAncestor(elements: readonly Element[]): Element | null {
  const first = elements[0];
  if (!first) return null;
  const chain: Element[] = [];
  for (let el: Element | null = first; el; el = el.parentElement) chain.push(el);
  const seen = new Set(chain);
  let best: Element = first;
  for (const el of elements.slice(1)) {
    let node: Element | null = el;
    while (node && !seen.has(node)) node = node.parentElement;
    if (!node) return chain[chain.length - 1] ?? null;
    if (chain.indexOf(node) > chain.indexOf(best)) best = node;
  }
  return best;
}

export function findConsentMoments(doc: Document): ConsentMoment[] {
  const root: Element | Document = doc.body || doc.documentElement || doc;
  const items = extractItems(root);
  if (items.length === 0) return [];

  const groups = new Map<Element, ConsentItem[]>();
  const loose: ConsentItem[] = [];
  for (const item of items) {
    const container = item.element.closest(MOMENT_ROOTS);
    if (container) {
      const bucket = groups.get(container) ?? [];
      if (bucket.length === 0) groups.set(container, bucket);
      bucket.push(item);
    } else {
      loose.push(item);
    }
  }
  const moments = [...groups.entries()].map(([container, list]) => ({ container, items: list }));
  if (loose.length > 0) {
    const container =
      lowestCommonAncestor(loose.map((i) => i.element)) ??
      (root instanceof Element ? root : doc.documentElement);
    moments.push({ container, items: loose });
  }
  return moments.sort((a, b) =>
    a.container.compareDocumentPosition(b.container) & 4 ? -1 : 1
  );
}

/** Identity of a moment's item set — deliberately excludes checkbox state. */
export function momentFingerprint(moment: ConsentMoment | null | undefined): string {
  if (!moment) return '';
  return JSON.stringify(
    moment.items.map((i) => [i.id, i.labelText, i.mark, i.isSelectAll, i.termsSource])
  );
}

/**
 * Watch for consent moments. The callback fires only when the item set
 * actually changes, so applying our own decisions cannot retrigger analysis.
 *
 * @returns {Function} stop
 */
export function observeConsent(
  doc: Document,
  onMoments: (moments: ConsentMoment[]) => void,
  { debounceMs = 200 }: ObserveOptions = {}
): () => void {
  const win = doc.defaultView ?? (globalThis as unknown as Window & typeof globalThis);
  let timer: ReturnType<Window['setTimeout']> | undefined;
  let last: string | null = null;
  let stopped = false;

  const run = () => {
    if (stopped) return;
    const moments = findConsentMoments(doc);
    if (moments.length === 0) return;
    const fingerprint = moments.map(momentFingerprint).join('|');
    if (fingerprint === last) return;
    last = fingerprint;
    onMoments(moments);
  };

  const schedule = () => {
    if (stopped) return;
    win.clearTimeout(timer);
    timer = win.setTimeout(run, debounceMs);
  };

  const observer = new win.MutationObserver(schedule);
  observer.observe(doc.documentElement || doc, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: WATCHED_ATTRS,
  });
  schedule();

  return () => {
    stopped = true;
    win.clearTimeout(timer);
    observer.disconnect();
  };
}
