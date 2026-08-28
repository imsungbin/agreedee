import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { findConsentMoments } from '../src/content/observe.js';
import { runMoment } from '../src/content/run.js';
import type { BadgeHandle, BadgeState, RunOptions } from '../src/content/run.js';
import type { JudgePayload, JudgeRow } from '../src/bg/providers/types.js';
import { byId, fakeFetch, firstMoment, q } from './helpers.js';

const DIR = new URL('../goldenset/', import.meta.url);
function load(id: string, url = 'https://example.test/'): Document {
  const { window } = new JSDOM(readFileSync(new URL(`${id}/page.html`, DIR), 'utf8'), { url });
  return window.document;
}
interface FakeBadge extends BadgeHandle {
  states: BadgeState[];
  destroy(): void;
}

function fakeBadge(): FakeBadge {
  const states: BadgeState[] = [];
  return { states, render: (s: BadgeState) => { states.push(s); return true; }, destroy() {} };
}
const noFetch = fakeFetch(async () => { throw new Error('offline'); });

/** The last state the badge was asked to draw, or a loud failure. */
const lastState = (badge: FakeBadge): BadgeState => {
  const state = badge.states.at(-1);
  if (!state) throw new Error('the badge was never rendered');
  return state;
};

/** A stand-in for a perfect Claude: essential for required, marketing otherwise. */
const goodClaude = async (payload: JudgePayload): Promise<JudgeRow[]> =>
  payload.items.map((i: JudgePayload['items'][number]) => ({
    id: i.id,
    substance: i.mark === 'required' ? 'service_essential' : 'marketing',
    quote: (i.termsText || '').split('. ')[0] + '.',
  }));

test('signup: optional boxes come off and the badge says so', async () => {
  const doc = load('signup-basic');
  const moment = firstMoment(findConsentMoments(doc));
  const badge = fakeBadge();
  const result = await runMoment(doc, moment, { requestSubstances: goodClaude, badge, fetchImpl: noFetch });

  assert.equal(byId(doc, 'agree3').checked, false, 'optional item unchecked');
  assert.equal(byId(doc, 'agree1').checked, true, 'required item checked');
  assert.equal(result.degraded, false);
  assert.equal(result.applied, true);
  assert.equal(lastState(badge).changed.length, 3);
});

// --- S5: every failure mode still runs, and still unchecks ------------
type Requester = NonNullable<RunOptions['requestSubstances']>;
const FAILURE_MODES: Array<[string, Requester | null]> = [
  ['the API call throws', async () => { throw new Error('401 unauthorized'); }],
  ['the API returns garbage', async () => ({ nonsense: true })],
  ['the API returns nothing', async () => null],
  ['there is no API key at all', null],
];
for (const [name, requestSubstances] of FAILURE_MODES) {
  test(`S5: ${name} — the pipeline still strips optional consent`, async () => {
    const doc = load('signup-basic');
    const moment = firstMoment(findConsentMoments(doc));
    const badge = fakeBadge();
    const result = await runMoment(doc, moment, {
      requestSubstances,
      badge,
      fetchImpl: noFetch,
    });

    assert.equal(byId(doc, 'agree3').checked, false, 'the pre-checked optional item is off');
    assert.equal(result.degraded, true);
    assert.equal(lastState(badge).degraded, true);
    for (const d of result.decisions) {
      if (d.action === 'check') assert.fail('degraded mode must never check a box');
    }
  });
}

test('S5: a hanging API call times out instead of blocking the page', async () => {
  const doc = load('signup-basic');
  const moment = firstMoment(findConsentMoments(doc));
  const badge = fakeBadge();
  const started = Date.now();
  const result = await runMoment(doc, moment, {
    requestSubstances: () => new Promise(() => {}),
    badge,
    fetchImpl: noFetch,
    timeoutMs: 40,
  });
  assert.ok(Date.now() - started < 1000);
  assert.equal(result.degraded, true);
  assert.equal(byId(doc, 'agree3').checked, false);
});

test('S5: a broken terms prefetch does not stop the run', async () => {
  const doc = load('signup-custom-ui');
  const moment = firstMoment(findConsentMoments(doc));
  const badge = fakeBadge();
  const result = await runMoment(doc, moment, {
    requestSubstances: goodClaude,
    badge,
    fetchImpl: async () => { throw new Error('CORS'); },
  });
  assert.equal(byId(doc, 'c2').checked, false);
  assert.ok(result.decisions.length > 0);
});

// --- S3 ---------------------------------------------------------------
test('S3: a payment flow changes nothing until the user clicks', async () => {
  const doc = load('payment-checkout', 'https://shop.example.test/order/payment');
  const moment = firstMoment(findConsentMoments(doc));
  const badge = fakeBadge();
  const result = await runMoment(doc, moment, { requestSubstances: goodClaude, badge, fetchImpl: noFetch });

  assert.equal(result.context.moment, 'payment');
  assert.equal(result.applied, false);
  assert.equal(byId(doc, 'o3').checked, true, 'nothing was touched automatically');

  const state = lastState(badge);
  assert.equal(state.pending, true);
  assert.equal(state.changed.length, 1, 'it still reports what it would turn off');

  if (!state.onApply) throw new Error('a pending badge must offer an apply action');
  state.onApply();
  assert.equal(byId(doc, 'o3').checked, false, 'the click applies it');
  assert.equal(lastState(badge).pending, false);
});

test('S3: an unclassifiable page is treated as payment (no auto-apply)', async () => {
  const dom = new JSDOM(
    `<!doctype html><body><label><input type="checkbox" checked> 광고 수신 동의 (선택)</label></body>`,
    { url: 'https://example.test/x' }
  );
  const doc = dom.window.document;
  const moment = firstMoment(findConsentMoments(doc));
  const badge = fakeBadge();
  const result = await runMoment(doc, moment, { requestSubstances: null, badge, fetchImpl: noFetch });
  assert.equal(result.context.moment, 'other');
  assert.equal(result.applied, false);
  assert.equal(q(doc, 'input').checked, true);
});

// --- S1 ---------------------------------------------------------------
test('S1: runMoment never clicks or submits', async () => {
  const { window } = new JSDOM(readFileSync(new URL('signup-basic/page.html', DIR), 'utf8'), { url: 'https://example.test/join' });
  const doc = window.document;
  const clicks: string[] = [];
  window.HTMLElement.prototype.click = function (this: HTMLElement) { clicks.push(this.tagName); };
  window.HTMLFormElement.prototype.submit = function () { clicks.push('SUBMIT'); };
  const moment = firstMoment(findConsentMoments(doc));
  await runMoment(doc, moment, { requestSubstances: goodClaude, badge: fakeBadge(), fetchImpl: noFetch });
  assert.deepEqual(clicks, []);
});

test('only the label and terms text are sent for judging — never the page', async () => {
  const doc = load('signup-basic');
  const moment = firstMoment(findConsentMoments(doc));
  let payload: JudgePayload | null = null;
  await runMoment(doc, moment, {
    requestSubstances: async (p: JudgePayload) => { payload = p; return []; },
    badge: fakeBadge(),
    fetchImpl: noFetch,
  });
  const sent = payload as JudgePayload | null;
  if (!sent) throw new Error('nothing was sent for judging');
  for (const item of sent.items) {
    assert.deepEqual(Object.keys(item).sort(), ['id', 'labelText', 'mark', 'termsText']);
  }
  assert.equal(sent.moment, 'signup');
});

// --- acting before the model answers -----------------------------------
/**
 * The user must never be left in a less safe state while the model is still
 * thinking. Pass one is the degraded path S5 already guarantees, applied
 * before anything is awaited — so a slow model costs accuracy, not safety.
 */
test('optional boxes come off before the model has answered', async () => {
  const doc = load('signup-basic');
  const moment = firstMoment(findConsentMoments(doc));
  let offAtCallTime: boolean | null = null;

  await runMoment(doc, moment, {
    requestSubstances: async (p: JudgePayload) => {
      // Observed from inside the request: the page is already safe.
      offAtCallTime = byId(doc, 'agree3').checked;
      return goodClaude(p);
    },
    badge: fakeBadge(),
    fetchImpl: noFetch,
  });

  assert.equal(offAtCallTime, false, 'the optional box was off before the model replied');
});

test('a model that never answers still leaves the page safe', async () => {
  const doc = load('signup-basic');
  const moment = firstMoment(findConsentMoments(doc));
  const badge = fakeBadge();
  const result = await runMoment(doc, moment, {
    requestSubstances: async () => { throw new Error('offline'); },
    badge,
    fetchImpl: noFetch,
  });
  assert.equal(byId(doc, 'agree3').checked, false);
  assert.equal(result.degraded, true);
});

/** The refined pass must not erase what the fast pass already reported. */
test('the badge keeps reporting a box the fast pass turned off', async () => {
  const doc = load('signup-basic');
  const moment = firstMoment(findConsentMoments(doc));
  const badge = fakeBadge();
  await runMoment(doc, moment, {
    requestSubstances: goodClaude,
    badge,
    fetchImpl: noFetch,
  });
  assert.ok(lastState(badge).changed.length >= 3, 'the final badge still lists every change');
});
