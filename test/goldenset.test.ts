import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { findConsentMoments } from '../src/content/observe.js';
import { applyDecisions } from '../src/content/apply.js';
import { analyzeMoment } from '../src/core/pipeline.js';
import type { ConsentItem, SubstanceMap } from '../src/core/types.js';
import { firstMoment, one, type GoldenExpected } from './helpers.js';

const DIR = new URL('../goldenset/', import.meta.url);
const fixtures = readdirSync(DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const read = (id: string, file: string): string =>
  readFileSync(new URL(`${id}/${file}`, DIR), 'utf8');
const expectationsFor = (id: string): GoldenExpected =>
  JSON.parse(read(id, 'expected.json')) as GoldenExpected;
const load = (id: string): JSDOM =>
  new JSDOM(read(id, 'page.html'), {
    url: (JSON.parse(read(id, 'meta.json')) as { url?: string }).url || 'https://example.test/',
  });

/** Ground-truth substances keyed by the extracted item ids, in document order. */
function oracle(items: readonly ConsentItem[], expected: GoldenExpected): SubstanceMap {
  const out: SubstanceMap = {};
  items.forEach((item: ConsentItem, i: number) => {
    const e = expected.items[i];
    if (e) out[item.id] = { substance: e.substance, quote: e.quote };
  });
  return out;
}

test('the golden set is not empty', () => {
  assert.ok(fixtures.length > 0);
});

for (const id of fixtures) {
  const expected = expectationsFor(id);

  test(`${id}: detects the consent moment`, () => {
    const doc = load(id).window.document;
    assert.equal(findConsentMoments(doc).length, expected.expectedMoments);
  });

  test(`${id}: extracts exactly the consent items, in order`, () => {
    const doc = load(id).window.document;
    const items = findConsentMoments(doc).flatMap((m) => m.items);
    assert.deepEqual(
      items.map((i) => i.labelText),
      expected.items.map((i) => i.label)
    );
  });

  test(`${id}: reads the printed legal mark correctly`, () => {
    const doc = load(id).window.document;
    const items = findConsentMoments(doc).flatMap((m) => m.items);
    assert.deepEqual(
      items.map((i) => `${i.labelText}=${i.mark}${i.isSelectAll ? '*' : ''}`),
      expected.items.map((i) => `${i.label}=${i.mark}${i.isSelectAll ? '*' : ''}`)
    );
  });

  test(`${id}: classifies the consent moment`, () => {
    const doc = load(id).window.document;
    const moment = firstMoment(findConsentMoments(doc));
    assert.equal(analyzeMoment(doc, moment, {}).context.moment, expected.moment);
  });

  test(`${id}: is judged under the right body of law`, () => {
    const doc = load(id).window.document;
    const moment = firstMoment(findConsentMoments(doc));
    assert.equal(analyzeMoment(doc, moment, {}).context.regime, expected.regime ?? 'kr');
  });

  test(`${id}: decides as the ground truth says, given perfect substance data`, () => {
    const doc = load(id).window.document;
    const moments = findConsentMoments(doc);
    const items = moments.flatMap((m) => m.items);
    const subs = oracle(items, expected);
    const decisions = moments.flatMap((m) => analyzeMoment(doc, m, subs).decisions);
    assert.deepEqual(
      decisions.map((d) => `${d.action}/${d.flag}`),
      expected.items.map((i) => `${i.action}/${i.flag}`)
    );
  });

  test(`${id}: degraded mode (no Claude) never checks a box that is not required`, () => {
    const doc = load(id).window.document;
    for (const m of findConsentMoments(doc)) {
      const { decisions } = analyzeMoment(doc, m, {});
      for (const d of decisions) {
        if (d.action === 'check') assert.equal(one(m.items, d.id).mark, 'required');
      }
    }
  });
}

// --- S1, over every fixture -------------------------------------------
test('S1: a full pipeline run over the golden set never clicks or submits', () => {
  for (const id of fixtures) {
    const expected = expectationsFor(id);
    const { window } = load(id);
    const doc = window.document;
    const clicked: string[] = [];
    const submitted: string[] = [];
    window.HTMLElement.prototype.click = function (this: HTMLElement) {
      clicked.push(`${id}:${this.tagName}`);
    };
    window.HTMLFormElement.prototype.submit = function () { submitted.push(id); };

    const moments = findConsentMoments(doc);
    const items = moments.flatMap((m) => m.items);
    const subs = oracle(items, expected);
    for (const m of moments) {
      const { decisions } = analyzeMoment(doc, m, subs);
      applyDecisions(doc, m.items, decisions);
    }
    assert.deepEqual(clicked, [], `${id} must not click anything`);
    assert.deepEqual(submitted, [], `${id} must not submit anything`);
  }
});

test('S1: no form in the golden set is left submitted or navigated', () => {
  for (const id of fixtures) {
    const { window } = load(id);
    const doc = window.document;
    let navigated = false;
    window.addEventListener('submit', () => { navigated = true; });
    const moments = findConsentMoments(doc);
    for (const m of moments) applyDecisions(doc, m.items, analyzeMoment(doc, m, {}).decisions);
    assert.equal(navigated, false, `${id} fired a submit event`);
  }
});
