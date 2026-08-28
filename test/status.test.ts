import test from 'node:test';
import assert from 'node:assert/strict';
import { summarise } from '../src/content/status.js';
import type { BadgeState } from '../src/content/run.js';

const state = (over: Partial<BadgeState> = {}): BadgeState => ({
  moment: 'signup',
  regime: 'kr',
  degraded: false,
  changed: [],
  findings: [],
  pending: false,
  ...over,
});

/**
 * The case the badge cannot express. A page with no consent items shows no
 * badge, which is indistinguishable from an extension that failed to load —
 * so the menu has to be able to say "nothing here, and I did look".
 */
test('a page with no consent moment still produces a status', () => {
  const status = summarise({ host: 'example.com', items: 0, states: [], detectedRegime: 'kr' });
  assert.equal(status.items, 0);
  assert.equal(status.moment, 'other');
  assert.equal(status.regime, 'kr');
  assert.equal(status.pending, false);
});

test('the detected regime is used only when no moment reported one', () => {
  assert.equal(
    summarise({ host: 'x', items: 0, states: [], detectedRegime: 'intl' }).regime,
    'intl',
    'a quiet English page is not judged under Korean law'
  );
  assert.equal(
    summarise({ host: 'x', items: 3, states: [state({ regime: 'kr' })], detectedRegime: 'intl' }).regime,
    'kr',
    'what the moment actually resolved to wins'
  );
});

test('counts add up across every moment on the page', () => {
  const status = summarise({
    host: 'example.com',
    items: 5,
    states: [
      state({
        changed: [{ id: 'a', labelText: 'a', from: true, to: false, reason: 'optional_mark', flag: null }],
        findings: [{ id: 'a', labelText: 'a', flag: 'prechecked_optional', reason: 'optional_mark' }],
      }),
      state({
        changed: [{ id: 'b', labelText: 'b', from: true, to: false, reason: 'no_mark', flag: null }],
        findings: [],
      }),
    ],
    detectedRegime: 'kr',
  });
  assert.equal(status.items, 5);
  assert.equal(status.turnedOff, 2);
  assert.equal(status.findings, 1);
});

test('one pending moment makes the whole page pending', () => {
  const status = summarise({
    host: 'x',
    items: 2,
    states: [state({ pending: false }), state({ pending: true })],
    detectedRegime: 'kr',
  });
  assert.equal(status.pending, true);
});

test('the moment comes from the first one on the page', () => {
  const status = summarise({
    host: 'x',
    items: 2,
    states: [state({ moment: 'payment' }), state({ moment: 'signup' })],
    detectedRegime: 'kr',
  });
  assert.equal(status.moment, 'payment');
});
