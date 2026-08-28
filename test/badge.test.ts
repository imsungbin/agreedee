import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createBadge } from '../src/content/badge.js';
import type { BadgeState } from '../src/content/run.js';
import { q, shadowOf, windowOf } from './helpers.js';

const fresh = () => new JSDOM('<!doctype html><body><h1>page</h1></body>').window.document;

const state = (over: Partial<BadgeState> = {}): BadgeState => ({
  moment: 'signup',
  regime: 'kr',
  degraded: false,
  changed: [
    {
      id: 'a',
      labelText: '광고성 정보 수신 동의 (선택)',
      from: true,
      to: false,
      reason: 'optional_mark',
      flag: 'prechecked_optional',
    },
  ],
  findings: [],
  pending: false,
  onApply: () => {},
  ...over,
});

test('renders inside a shadow root so page CSS cannot reach it', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  badge.render(state());
  const host = doc.querySelector('[data-agreedee]');
  assert.ok(host, 'host element is in the page');
  assert.ok(host.shadowRoot, 'content lives in a shadow root');
  assert.equal(host.textContent, '', 'nothing leaks into the light DOM');
  badge.destroy();
});

test('page-derived label text is never parsed as HTML', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  badge.render(state({
    changed: [{ id: 'a', labelText: '<img src=x onerror=alert(1)> 마케팅 동의 (선택)', from: true, to: false, reason: 'optional_mark', flag: null }],
  }));
  const root = shadowOf(doc);
  assert.equal(root.querySelectorAll('img').length, 0);
  assert.match(root.textContent, /<img src=x onerror=alert\(1\)>/);
  badge.destroy();
});

test('states how many boxes were turned off', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  badge.render(state({
    changed: [
      { id: 'a', labelText: '광고 수신 (선택)', from: true, to: false, reason: 'optional_mark', flag: null },
      { id: 'b', labelText: '제3자 제공 (선택)', from: true, to: false, reason: 'optional_mark', flag: null },
    ],
  }));
  const root = shadowOf(doc);
  assert.match(root.textContent, /2/);
  badge.destroy();
});

test('the panel lists every item that was turned off', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  badge.render(state());
  const root = shadowOf(doc);
  q(root, '[data-toggle]').dispatchEvent(new (windowOf(doc).Event)('click'));
  assert.match(root.textContent, /광고성 정보 수신 동의 \(선택\)/);
  badge.destroy();
});

test('S3: in a payment flow it offers a button instead of acting', () => {
  const doc = fresh();
  let applied = 0;
  const badge = createBadge(doc);
  badge.render(state({ moment: 'payment', pending: true, onApply: () => { applied++; } }));
  const root = shadowOf(doc);
  const button = root.querySelector('[data-apply]');
  assert.ok(button, 'an apply button is offered');
  button.dispatchEvent(new (windowOf(doc).Event)('click'));
  assert.equal(applied, 1);
  badge.destroy();
});

test('says so when it is running without an API key', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  badge.render(state({ degraded: true }));
  const root = shadowOf(doc);
  assert.match(root.textContent, /표기 기준|API 키/);
  badge.destroy();
});

test('shows findings even when nothing needed changing', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  const shown = badge.render(state({
    changed: [],
    findings: [{ id: 'x', labelText: '이용약관 동의', flag: 'missing_mark', reason: 'no_mark' }],
  }));
  assert.equal(shown, true);
  assert.match(shadowOf(doc).textContent, /이용약관 동의/);
  badge.destroy();
});

test('stays silent when there is nothing to say', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  const shown = badge.render(state({ changed: [], findings: [] }));
  assert.equal(shown, false);
  assert.equal(doc.querySelector('[data-agreedee]'), null);
});

test('re-rendering reuses the same host', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  badge.render(state());
  badge.render(state());
  assert.equal(doc.querySelectorAll('[data-agreedee]').length, 1);
  badge.destroy();
});

test('destroy removes the badge from the page', () => {
  const doc = fresh();
  const badge = createBadge(doc);
  badge.render(state());
  badge.destroy();
  assert.equal(doc.querySelector('[data-agreedee]'), null);
});
