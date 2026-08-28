/**
 * status.ts — what the page turned out to be, as one plain value.
 *
 * Pure, so the summary the right-click menu depends on can be tested without
 * a browser. main.ts stays wiring.
 */

import type { BadgeState } from './badge.js';
import type { PageStatus } from '../bg/messages.js';
import type { Regime } from '../core/types.js';

export interface SummaryInput {
  host: string;
  /** Consent checkboxes found, across every moment on the page. */
  items: number;
  /** One per consent moment. Empty means the page had none. */
  states: readonly BadgeState[];
  /**
   * What the page itself was read as. A page with no consent moment still has
   * a language, a host and a body of text, so it still has an answer — and
   * defaulting to 'kr' instead would tell the menu that github.com is judged
   * under Korean law.
   */
  detectedRegime: Regime;
}

export function summarise({ host, items, states, detectedRegime }: SummaryInput): PageStatus {
  const first = states[0];
  return {
    host,
    moment: first?.moment ?? 'other',
    regime: first?.regime ?? detectedRegime,
    items,
    turnedOff: states.reduce((n, s) => n + (s.changed?.length ?? 0), 0),
    findings: states.reduce((n, s) => n + (s.findings?.length ?? 0), 0),
    pending: states.some((s) => s.pending),
  };
}
