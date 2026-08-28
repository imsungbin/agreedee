/**
 * helpers.ts — shared test utilities.
 *
 * `q` and `byId` exist because `doc.querySelector(...)!` hides a real failure
 * mode: when a fixture stops matching, the assertion that follows fails with
 * a confusing message about `null`. These throw where the mistake is.
 */

import type {
  Action,
  ConsentMoment,
  Flag,
  Mark,
  MomentKind,
  Reason,
  Regime,
  Substance,
} from '../src/core/types.js';

export function q<T extends Element = HTMLInputElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`fixture has no element matching ${selector}`);
  return el;
}

export function byId<T extends HTMLElement = HTMLInputElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id);
  if (!el) throw new Error(`fixture has no element with id ${id}`);
  return el as T;
}

/**
 * A placeholder for tests that assert on the action and ignore the wording.
 * Typed, so a test can never quietly invent a reason the product cannot emit.
 */
export const ANY_REASON: Reason = 'no_mark';

/** The badge's shadow root, or a loud failure if the badge never mounted. */
export function shadowOf(doc: Document): ShadowRoot {
  const host = q<HTMLElement>(doc, '[data-agreedee]');
  if (!host.shadowRoot) throw new Error('badge host has no shadow root');
  return host.shadowRoot;
}

/** The window a jsdom document belongs to. */
export function windowOf(doc: Document): Window & typeof globalThis {
  const win = doc.defaultView;
  if (!win) throw new Error('document has no default view');
  return win as Window & typeof globalThis;
}

/** The one decision with this id, or a loud failure. */
export function one<T extends { id: string }>(list: readonly T[], id: string): T {
  const found = list.find((d) => d.id === id);
  if (!found) throw new Error(`no entry with id ${id}`);
  return found;
}

/** The shape of a golden-set `expected.json`. */
export interface GoldenItem {
  label: string;
  mark: Mark;
  isSelectAll: boolean;
  substance: Substance;
  quote: string | null;
  action: Action;
  flag: Flag | null;
}

export interface GoldenExpected {
  moment: MomentKind;
  /** Absent means 'kr', so every fixture written before this existed is one. */
  regime?: Regime;
  expectedMoments: number;
  items: GoldenItem[];
}

/** The first consent moment on the page, or a loud failure. */
export function firstMoment(moments: readonly ConsentMoment[]): ConsentMoment {
  const first = moments[0];
  if (!first) throw new Error('fixture has no consent moment');
  return first;
}

/**
 * Wrap a minimal stub as a `fetch`. Production code reads only `ok`, `status`,
 * `text()` and `json()`, so a full Response is never worth constructing — but
 * the cast should be visible at each call site rather than hidden in `any`.
 */
export function fakeFetch(impl: (...args: unknown[]) => unknown): typeof fetch {
  return impl as unknown as typeof fetch;
}
