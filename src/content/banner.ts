/**
 * banner.ts — find consent banners and the controls inside them.
 *
 * Structural signals only: a dialog role, a modal, or a pinned container that
 * holds consent vocabulary and at least one candidate control. No CMP-specific
 * selectors — a list of vendor ids is a maintenance treadmill, and the shapes
 * below are what those vendors render anyway.
 *
 * This module finds and classifies. It does not press anything; activate.ts
 * does, and only after checking again.
 */

import { classifyControl, type ControlKind } from '../core/controls.js';

/** Consent vocabulary, deliberately loose — the classifier is the strict gate. */
const CONSENT_TEXT =
  /쿠키|동의|개인정보|약관|cookie|consent|privacy|personal data|tracking|GDPR/i;

const DIALOG = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog';
const CANDIDATE = 'button, [role="button"], input[type="button"], input[type="submit"], a[href]';

/** Longer than this and the container is the page, not a banner over it. */
const MAX_BANNER_TEXT = 3000;

export interface BannerControl {
  element: HTMLElement;
  labelText: string;
  kind: ControlKind;
}

export interface ConsentBanner {
  container: Element;
  controls: BannerControl[];
}

const clean = (s: unknown): string =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';

/** A banner is pinned to the viewport; page content is not. */
function isPinned(el: Element): boolean {
  const win = el.ownerDocument.defaultView;
  if (!win) return false;
  try {
    const position = win.getComputedStyle(el).position;
    return position === 'fixed' || position === 'sticky';
  } catch {
    return false;
  }
}

/**
 * Tag names rather than `instanceof`: an element from an iframe is not an
 * instance of the top window's HTMLInputElement, and neither is one from
 * jsdom. The check that fails silently in another realm is worse than none.
 */
export const tagOf = (el: Element): string => el.tagName.toLowerCase();

/** What the user reads on the control, which is all we are allowed to judge by. */
export function controlLabel(el: Element): string {
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  if (tagOf(el) === 'input') return clean(el.getAttribute('value'));
  return clean(el.textContent);
}

function controlsIn(container: Element): BannerControl[] {
  const out: BannerControl[] = [];
  for (const el of container.querySelectorAll<HTMLElement>(CANDIDATE)) {
    const labelText = controlLabel(el);
    if (!labelText) continue;
    out.push({ element: el, labelText, kind: classifyControl(labelText) });
  }
  return out;
}

function isBanner(el: Element): boolean {
  const text = clean(el.textContent);
  if (!text || text.length > MAX_BANNER_TEXT) return false;
  return CONSENT_TEXT.test(text);
}

/**
 * Every consent banner on the page, outermost first. A banner nested inside
 * another is dropped: its controls already belong to the outer one, and
 * counting them twice would offer the same button as two separate choices.
 */
export function findConsentBanners(doc: Document): ConsentBanner[] {
  const root = doc.body ?? doc.documentElement;
  if (!root) return [];

  const candidates = new Set<Element>(root.querySelectorAll(DIALOG));
  for (const el of root.querySelectorAll<HTMLElement>('div, section, aside, footer, form')) {
    if (isPinned(el)) candidates.add(el);
  }

  const banners: ConsentBanner[] = [];
  for (const container of candidates) {
    if (!isBanner(container)) continue;
    if (banners.some((b) => b.container.contains(container))) continue;
    const controls = controlsIn(container);
    if (controls.length === 0) continue;
    banners.push({ container, controls });
  }
  return banners;
}

/**
 * The one control we may press, or null.
 *
 * Null when the banner offers none, and null when it offers more than one:
 * two refusal controls in one banner means the shape is not what we think it
 * is, and pressing either is a guess.
 */
export function soleRejectControl(banner: ConsentBanner): BannerControl | null {
  const rejects = banner.controls.filter((c) => c.kind === 'reject');
  return rejects.length === 1 ? (rejects[0] as BannerControl) : null;
}
