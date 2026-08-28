/**
 * banners.ts — the banner half of a page's consent, wired to the badge.
 *
 * Checkbox forms and cookie banners are two different surfaces. This one is
 * handled on its own terms: there is no printed mark to read, no terms text to
 * quote, and nothing to untick — only a control that either refuses or does
 * not, and a label that either proves it or does not.
 */

import { findConsentBanners, soleRejectControl } from './banner.js';
import { activateRefusal, refuseToPress, type RefusalToPress } from './activate.js';

/**
 * Pressing changes the DOM, which wakes the observer, which calls back here.
 * Without this the extension would press the same control in a loop against
 * any site that leaves its banner up. Once per control, per page.
 */
const alreadyPressed = new WeakSet<Element>();

export interface BannerReport {
  /** How many consent banners were on the page. */
  banners: number;
  pressed: boolean;
  /** The label we pressed, or the one we declined to. */
  labelText: string;
  /** Why we did not press, when we did not. */
  blocked: RefusalToPress | null;
}

/**
 * Refuse on every banner that offers exactly one refusal control we are
 * allowed to press. Everything else is reported and left alone.
 *
 * This is not gated on the S3 payment rule. That rule exists because a form
 * that will not submit is expensive during checkout — a cookie banner is not
 * that form, and dismissing it cannot block a payment. What keeps this safe is
 * the control itself: proven to reduce consent, and proven unable to submit.
 */
export function handleBanners(doc: Document): BannerReport | null {
  const banners = findConsentBanners(doc);
  if (banners.length === 0) return null;

  let pressed = false;
  let labelText = '';
  let blocked: RefusalToPress | null = null;

  for (const banner of banners) {
    const control = soleRejectControl(banner);
    if (!control) continue;
    if (alreadyPressed.has(control.element)) continue;
    const reason = refuseToPress(control);
    if (reason) {
      if (!blocked) {
        blocked = reason;
        labelText = control.labelText;
      }
      continue;
    }
    alreadyPressed.add(control.element);
    if (activateRefusal(control).pressed) {
      pressed = true;
      labelText = control.labelText;
    }
  }

  return { banners: banners.length, pressed, labelText, blocked };
}
