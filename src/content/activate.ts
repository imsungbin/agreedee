/**
 * activate.ts — the only module allowed to press anything on a page.
 *
 * S1a stands: no form is ever submitted, and no submit, continue or accept
 * control is ever pressed. S1b is what this module implements — a control may
 * be pressed only when its own label proves it reduces consent, and only when
 * the element itself cannot submit.
 *
 * banner.ts already classified the label. Everything here is the second
 * opinion, on the element rather than the text, because a label that reads
 * "Reject all" on a `<button>` inside a form with no explicit type is still a
 * submit button.
 */

import { isRejectControl } from '../core/controls.js';
import { controlLabel, tagOf, type BannerControl, type ConsentBanner } from './banner.js';

export type RefusalToPress =
  | 'not_a_reject_label'
  | 'label_changed'
  | 'submits'
  | 'disabled'
  | 'detached'
  | 'invisible';

export type ActivationResult =
  | { pressed: true; labelText: string }
  | { pressed: false; reason: RefusalToPress };

/**
 * A `<button>` inside a form defaults to `type="submit"`. That default is the
 * likeliest way to fire a form by accident, so it is checked explicitly rather
 * than trusted.
 */
export function submits(el: Element): boolean {
  if (tagOf(el) === 'input') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    return type === 'submit' || type === 'image';
  }
  // A form-associated control submits that form from anywhere in the document.
  if (el.hasAttribute('form')) return true;
  if (tagOf(el) !== 'button') return false;
  const explicit = el.getAttribute('type');
  if (explicit) return explicit.toLowerCase() === 'submit';
  return el.closest('form') !== null;
}

function isVisible(el: HTMLElement): boolean {
  const win = el.ownerDocument.defaultView;
  if (!win) return true; // jsdom without layout: the other checks still apply
  try {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return style.opacity !== '0';
  } catch {
    return true;
  }
}

/** Every reason this control must not be pressed, or null if there is none. */
export function refuseToPress(control: BannerControl): RefusalToPress | null {
  const el = control.element;
  if (!isRejectControl(control.labelText)) return 'not_a_reject_label';
  // Re-read the label off the element: banners re-render, and a stale label is
  // exactly how "Reject all" becomes "Accept all" between decision and press.
  if (!isRejectControl(controlLabel(el))) return 'label_changed';
  if (!el.isConnected) return 'detached';
  if (submits(el)) return 'submits';
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
    return 'disabled';
  }
  if (!isVisible(el)) return 'invisible';
  return null;
}

/**
 * Press the banner's refusal control, if it has exactly one and every check
 * passes. Returns what happened either way; it never throws at the caller.
 */
export function activateRefusal(control: BannerControl | null): ActivationResult {
  if (!control) return { pressed: false, reason: 'not_a_reject_label' };
  const reason = refuseToPress(control);
  if (reason) return { pressed: false, reason };
  control.element.click();
  return { pressed: true, labelText: control.labelText };
}

/** What a banner would do if asked, without asking. Used by the badge. */
export function previewRefusal(banner: ConsentBanner, control: BannerControl | null): {
  control: BannerControl | null;
  blocked: RefusalToPress | null;
  offered: number;
} {
  return {
    control,
    blocked: control ? refuseToPress(control) : null,
    offered: banner.controls.filter((c) => c.kind === 'reject').length,
  };
}
