/**
 * extract.js — DOM → ConsentItem[]. No per-site selectors, no AI.
 *
 * Everything here is structural: how a checkbox is labelled, where its legal
 * mark is printed, and where its terms text lives. jsdom-testable.
 */

import { parseMark, isSelectAllText, resolveMark } from '../core/labels.js';
import type { ConsentItem } from '../core/types.js';

const CONSENT_WORDS =
  /동의|약관|개인정보|수집|이용|제공|활용|수신|마케팅|광고|제\s?3\s?자|위탁|처리방침|고유식별|민감정보|국외 이전/;

/**
 * The same gate for pages that are not in Korean. Kept narrow on purpose: this
 * decides what Agreedee is allowed to touch, and "remember me" or "keep me
 * signed in" must never qualify. Consent, the documents being consented to,
 * and the purposes consent is asked for — nothing else.
 */
const CONSENT_WORDS_EN =
  /\b(?:terms\s+(?:of\s+(?:service|use)|and\s+conditions)|privacy\s+(?:policy|notice|statement)|cookie\s+policy|consent|i\s+(?:agree|accept|consent)|agree\s+to|marketing|newsletter|promotional|offers|third[-\s]part(?:y|ies)|personal\s+(?:data|information)|opt[-\s]?in|processing\s+of\s+my|cookies?)\b/i;

const MAX_ANCESTORS = 6;
/** Marks are never inherited across a moment boundary. */
const MARK_STOP = 'form, dialog, [role="dialog"], [aria-modal="true"], body, main';
const MAX_MARK_TEXT = 40;
const MIN_TERMS_TEXT = 40;
const MAX_TERMS_TEXT = 4000;

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

/** Text that belongs to this element only, not to nested elements. */
function ownText(el: Element): string {
  let out = '';
  for (const node of el.childNodes) if (node.nodeType === 3) out += node.textContent;
  return clean(out);
}

/**
 * A checkbox is ours only if it is about consent. Never touch a "remember my
 * ID" or "Remember me" box, in either language.
 */
export function isConsentCheckbox(text: string | null | undefined): boolean {
  const s = clean(text);
  if (!s) return false;
  if (isSelectAllText(s)) return true;
  if (parseMark(s).mark !== 'absent') return true;
  return CONSENT_WORDS.test(s) || CONSENT_WORDS_EN.test(s);
}

function labelFor(input: HTMLInputElement): Element | null {
  const doc = input.ownerDocument;
  if (input.id) {
    const escaped = /^[A-Za-z][\w-]*$/.test(input.id) ? `#${input.id}` : null;
    const byFor = escaped
      ? doc.querySelector(`label[for="${input.id.replace(/"/g, '\\"')}"]`)
      : null;
    if (byFor) return byFor;
  }
  return input.closest('label');
}

function labelText(input: HTMLInputElement): string {
  const el = labelFor(input);
  if (el && clean(el.textContent)) return clean(el.textContent);
  const aria = input.getAttribute('aria-label');
  if (clean(aria)) return clean(aria);
  const ref = input.getAttribute('aria-labelledby');
  if (ref) {
    const target = input.ownerDocument.getElementById(ref);
    if (target) return clean(target.textContent);
  }
  const sib = input.nextElementSibling;
  if (sib && clean(sib.textContent)) return clean(sib.textContent);
  return clean(input.parentElement && input.parentElement.textContent);
}

/**
 * Ordered candidates for the legal mark: the label first, then — walking
 * outward — any nearby text that does not belong to another consent item.
 * A block containing another checkbox is never consulted, so an item can
 * never inherit its neighbour's mark.
 */
function markCandidates(input: HTMLInputElement, text: string): string[] {
  const out: string[] = [text];
  let el = input.parentElement;
  for (let depth = 0; el && depth < MAX_ANCESTORS; depth++, el = el.parentElement) {
    if (el.matches(MARK_STOP)) break;
    const own = ownText(el);
    if (own && own.length <= MAX_MARK_TEXT) out.push(own);
    for (const child of el.children) {
      if (child.contains(input)) continue;
      if (child.querySelector('input[type="checkbox"]')) continue;
      const t = clean(child.textContent);
      if (t && t.length <= MAX_MARK_TEXT) out.push(t);
    }
  }
  return out;
}

const checkboxCount = (el: Element): number =>
  el.querySelectorAll('input[type="checkbox"]').length;

/** The largest ancestor that still contains only this checkbox. */
function rowContainer(input: HTMLInputElement): Element | null {
  let el = input.parentElement;
  for (let depth = 0; el && el.parentElement && depth < MAX_ANCESTORS; depth++) {
    const up = el.parentElement;
    if (checkboxCount(up) !== 1 || up.matches(MARK_STOP)) break;
    el = up;
  }
  return el || input.parentElement;
}

function inlineTerms(input: HTMLInputElement, row: Element | null, text: string): string | null {
  if (!row) return null;
  let best: string | null = null;
  for (const el of row.querySelectorAll('*')) {
    if (el.contains(input) || checkboxCount(el) > 0) continue;
    if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'SCRIPT') continue;
    const t = clean(el.textContent);
    if (t.length < MIN_TERMS_TEXT || t === text) continue;
    if (!best || t.length > best.length) best = t;
  }
  return best ? best.slice(0, MAX_TERMS_TEXT) : null;
}

function termsLink(_input: HTMLInputElement, row: Element | null): string | null {
  if (!row) return null;
  for (const a of row.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) continue;
    return (a as HTMLAnchorElement).href || href;
  }
  return null;
}

/** A path selector that survives a re-render of equivalent markup. */
function selectorFor(el: Element): string {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${el.id}`;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node.tagName !== 'HTML') {
    // Explicit annotations: TS 7's flow analysis loses the narrowing of `node`
    // across the reassignment at the bottom of this loop.
    const current: Element = node;
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const tag = current.tagName.toLowerCase();
    const sameTag = [...parent.children].filter((c) => c.tagName === current.tagName);
    parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})` : tag);
    node = parent;
  }
  return parts.join('>');
}

/** ConsentItem[] in document order. */
export function extractItems(root: Element | Document | null | undefined): ConsentItem[] {
  if (!root) return [];
  const boxes = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  const out: ConsentItem[] = [];
  for (const input of boxes) {
    const text = labelText(input);
    if (!isConsentCheckbox(text)) continue;
    const row = rowContainer(input);
    const inline = inlineTerms(input, row, text);
    const url = inline ? null : termsLink(input, row);
    const selector = selectorFor(input);
    const isSelectAll = isSelectAllText(text);
    out.push({
      id: `agreedee:${selector}`,
      selector,
      element: input,
      labelText: text,
      // A select-all control has no legal mark of its own; only its own label
      // can carry one, never the prose around it.
      mark: isSelectAll ? parseMark(text).mark : resolveMark(markCandidates(input, text)).mark,
      isSelectAll,
      checked: input.checked === true,
      disabled: input.disabled === true,
      required: input.hasAttribute('required'),
      termsText: inline,
      termsUrl: url,
      termsSource: inline ? 'inline' : 'unavailable',
    });
  }
  return out;
}
