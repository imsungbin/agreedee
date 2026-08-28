import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractItems } from '../src/content/extract.js';
import { applyDecisions } from '../src/content/apply.js';
import type { ConsentItem } from '../src/core/types.js';
import { q, byId, ANY_REASON } from './helpers.js';

function setup(html: string) {
  const { window } = new JSDOM(`<!doctype html><body>${html}</body>`);
  const doc = window.document;
  return { window, doc, items: extractItems(doc.body) };
}

function byLabel(items: readonly ConsentItem[], re: RegExp): ConsentItem {
  const found = items.find((i) => re.test(i.labelText));
  if (!found) throw new Error(`fixture has no item labelled ${re}`);
  return found;
}

test('unchecks a box the decision refuses', () => {
  const { doc, items } = setup(`<label><input type="checkbox" checked> 마케팅 수신 동의 (선택)</label>`);
  applyDecisions(doc, items, [{ id: items[0].id, action: 'uncheck', reason: 'optional_mark', flag: null }]);
  assert.equal(q(doc, 'input').checked, false);
});

test('checks a box the decision requires', () => {
  const { doc, items } = setup(`<label><input type="checkbox"> 이용약관 동의 (필수)</label>`);
  applyDecisions(doc, items, [{ id: items[0].id, action: 'check', reason: 'required_and_service_essential', flag: null }]);
  assert.equal(q(doc, 'input').checked, true);
});

test('a "leave" decision changes nothing', () => {
  const { doc, items } = setup(`<label><input type="checkbox" checked> 이용약관 동의 (필수)</label>`);
  const report = applyDecisions(doc, items, [{ id: items[0].id, action: 'leave', reason: ANY_REASON, flag: null }]);
  assert.equal(q(doc, 'input').checked, true);
  assert.equal(report.changed.length, 0);
});

test('dispatches input and change so React/Vue forms notice', () => {
  const { doc, items } = setup(`<label><input type="checkbox" checked> 마케팅 수신 동의 (선택)</label>`);
  const seen: Array<[string, boolean]> = [];
  const input = q(doc, 'input');
  input.addEventListener('input', (e) => seen.push(['input', e.bubbles]));
  input.addEventListener('change', (e) => seen.push(['change', e.bubbles]));
  applyDecisions(doc, items, [{ id: items[0].id, action: 'uncheck', reason: 'optional_mark', flag: null }]);
  assert.deepEqual(seen, [['input', true], ['change', true]]);
});

test('skips a disabled control and reports it', () => {
  const { doc, items } = setup(`<label><input type="checkbox" checked disabled> 마케팅 수신 동의 (선택)</label>`);
  const report = applyDecisions(doc, items, [{ id: items[0].id, action: 'uncheck', reason: ANY_REASON, flag: null }]);
  assert.equal(q(doc, 'input').checked, true);
  assert.equal(report.skipped[0].reason, 'disabled');
});

test('re-resolves an element the page replaced between extract and apply', () => {
  const { doc, items } = setup(`<div><label><input type="checkbox" checked> 마케팅 수신 동의 (선택)</label></div>`);
  const stale = items[0].element;
  q<HTMLDivElement>(doc, 'div').innerHTML = '<label><input type="checkbox" checked> 마케팅 수신 동의 (선택)</label>';
  assert.equal(stale.isConnected, false);
  applyDecisions(doc, items, [{ id: items[0].id, action: 'uncheck', reason: ANY_REASON, flag: null }]);
  assert.equal(q(doc, 'input').checked, false);
});

test('reports an item whose element has vanished entirely', () => {
  const { doc, items } = setup(`<div><label><input type="checkbox" checked> 마케팅 수신 동의 (선택)</label></div>`);
  q<HTMLDivElement>(doc, 'div').remove();
  const report = applyDecisions(doc, items, [{ id: items[0].id, action: 'uncheck', reason: ANY_REASON, flag: null }]);
  assert.equal(report.skipped[0].reason, 'detached');
});

test('applies the select-all before individual items so a site cascade cannot win', () => {
  const { doc, items } = setup(`
    <label><input type="checkbox" id="all" checked> 전체 동의</label>
    <label><input type="checkbox" id="a" checked> 이용약관 동의 (필수)</label>
    <label><input type="checkbox" id="b" checked> 마케팅 수신 동의 (선택)</label>
  `);
  const order: string[] = [];
  doc.addEventListener('change', (e) => order.push((e.target as HTMLElement).id), true);
  applyDecisions(doc, items, [
    { id: byLabel(items, /전체/).id, action: 'uncheck', reason: ANY_REASON, flag: null },
    { id: byLabel(items, /이용약관/).id, action: 'leave', reason: ANY_REASON, flag: null },
    { id: byLabel(items, /마케팅/).id, action: 'uncheck', reason: ANY_REASON, flag: null },
  ]);
  assert.deepEqual(order, ['all', 'b']);
});

test('re-applies once when a site handler fights back, then gives up cleanly', () => {
  const { doc, items } = setup(`
    <label><input type="checkbox" id="all" checked> 전체 동의</label>
    <label><input type="checkbox" id="b" checked> 마케팅 수신 동의 (선택)</label>
  `);
  // A site handler that re-checks everything whenever the select-all changes.
  let fights = 0;
  byId(doc, 'all').addEventListener('change', () => {
    fights++;
    byId(doc, 'b').checked = true;
  });
  const report = applyDecisions(doc, items, [
    { id: byLabel(items, /전체/).id, action: 'uncheck', reason: ANY_REASON, flag: null },
    { id: byLabel(items, /마케팅/).id, action: 'uncheck', reason: ANY_REASON, flag: null },
  ]);
  assert.equal(byId(doc, 'b').checked, false, 'the second pass must win');
  assert.equal(report.unresolved.length, 0);
  assert.ok(fights >= 1);
});

test('gives up after the second pass instead of looping forever', () => {
  const { doc, items } = setup(`<label><input type="checkbox" id="b" checked> 마케팅 수신 동의 (선택)</label>`);
  byId(doc, 'b').addEventListener('change', () => { byId(doc, 'b').checked = true; });
  const report = applyDecisions(doc, items, [{ id: items[0].id, action: 'uncheck', reason: ANY_REASON, flag: null }]);
  assert.equal(report.unresolved.length, 1);
  assert.equal(report.unresolved[0].id, items[0].id);
});

// --- S1 --------------------------------------------------------------
test('S1: apply never clicks and never submits', () => {
  const { window, doc, items } = setup(`
    <form><label><input type="checkbox" checked> 마케팅 수신 동의 (선택)</label>
    <button type="submit">가입하기</button></form>
  `);
  const clicks: string[] = [];
  const submits: string[] = [];
  window.HTMLElement.prototype.click = function (this: HTMLElement) { clicks.push(this.tagName); };
  window.HTMLFormElement.prototype.submit = function () { submits.push('submit'); };
  applyDecisions(doc, items, [{ id: items[0].id, action: 'uncheck', reason: ANY_REASON, flag: null }]);
  assert.deepEqual(clicks, []);
  assert.deepEqual(submits, []);
});

test('reports what changed, for the badge', () => {
  const { doc, items } = setup(`<label><input type="checkbox" checked> 마케팅 수신 동의 (선택)</label>`);
  const report = applyDecisions(doc, items, [{ id: items[0].id, action: 'uncheck', reason: 'optional_mark', flag: 'prechecked_optional' }]);
  assert.deepEqual(report.changed, [
    { id: items[0].id, labelText: '마케팅 수신 동의 (선택)', from: true, to: false, reason: 'optional_mark', flag: 'prechecked_optional' },
  ]);
});
