/**
 * messages.ts — the whole message protocol, in one place.
 *
 * Both ends import these types, and only the types: the shapes are erased at
 * build time, so naming them here creates no runtime dependency between the
 * content script and the background.
 */

import type { JudgePayload, JudgeRow, ProbeResult } from './providers/types.js';
import type { MomentKind, Regime } from '../core/types.js';

export interface JudgeMessage {
  type: 'agreedee:judge';
  payload: JudgePayload;
}

export type JudgeResponse = { ok: true; rows: JudgeRow[] } | { ok: false; reason: string };

/**
 * What the content script last found on one tab.
 *
 * This exists so the context menu can say something true. A passive extension
 * that is working correctly and one that failed to load look identical from
 * the outside, and that is a bug in the product rather than in the user.
 */
export interface PageStatus {
  host: string;
  moment: MomentKind;
  regime: Regime;
  /** Consent checkboxes found on the page. Zero is a real, reportable answer. */
  items: number;
  /** Boxes turned off, or offered for turning off when `pending`. */
  turnedOff: number;
  findings: number;
  /** True when we reported instead of acting, and a click is needed. */
  pending: boolean;
}

export interface StatusMessage {
  type: 'agreedee:status';
  status: PageStatus;
}

/** Sent by the options page to answer "is this configured correctly?". */
export interface ProbeMessage {
  type: 'agreedee:probe';
}

export type ProbeResponse = ProbeResult;

export type ToBackground = JudgeMessage | StatusMessage | ProbeMessage;

/** Background → content script. */
export type ToContent =
  | { type: 'agreedee:rescan' }
  | { type: 'agreedee:setRegime'; regime: Regime };
