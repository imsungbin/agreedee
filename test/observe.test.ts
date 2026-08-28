import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { findConsentMoments, momentFingerprint, observeConsent } from '../src/content/observe.js';
import type { ConsentMoment } from '../src/core/types.js';
import { byId } from './helpers.js';

const dom = (html: string) => new JSDOM(`<!doctype html><body>${html}</body>`, { pretendToBeVisual: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TERMS = `<label><input type="checkbox"> 이용약관 동의 (필수)</label>
  <label><input type="checkbox"> 개인정보 수집·이용 동의 (필수)</label>
  <label><input type="checkbox" checked> 마케팅 정보 수신 동의 (선택)</label>`;

test('finds one moment for a signup form', () => {
  const d = dom(`<form id="join">${TERMS}</form>`).window.document;
  const moments = findConsentMoments(d);
  assert.equal(moments.length, 1);
  assert.equal(moments[0].container.id, 'join');
  assert.equal(moments[0].items.length, 3);
});

test('finds nothing on a page with no consent checkboxes', () => {
  const d = dom(`<form><label><input type="checkbox"> 아이디 저장</label></form>`).window.document;
  assert.deepEqual(findConsentMoments(d), []);
});

test('separates two forms into two moments', () => {
  const d = dom(`<form id="a">${TERMS}</form><form id="b">${TERMS}</form>`).window.document;
  assert.deepEqual(findConsentMoments(d).map((m) => m.container.id), ['a', 'b']);
});

test('treats a re-consent modal as its own moment, separate from the page behind it', () => {
  const d = dom(`
    <form id="page">${TERMS}</form>
    <div role="dialog" id="modal"><h2>약관 개정 안내</h2>${TERMS}</div>
  `).window.document;
  const ids = findConsentMoments(d).map((m) => m.container.id);
  assert.deepEqual(ids.sort(), ['modal', 'page']);
});

test('falls back to the common ancestor when there is no form', () => {
  const d = dom(`<div id="wrap"><div>${TERMS}</div></div>`).window.document;
  const moments = findConsentMoments(d);
  assert.equal(moments.length, 1);
  assert.equal(moments[0].items.length, 3);
});

test('the fingerprint ignores checkbox state so our own writes cannot retrigger analysis', () => {
  const d = dom(`<form>${TERMS}</form>`).window.document;
  const before = momentFingerprint(findConsentMoments(d)[0]);
  for (const cb of d.querySelectorAll('input')) cb.checked = !cb.checked;
  assert.equal(momentFingerprint(findConsentMoments(d)[0]), before);
});

test('the fingerprint changes when the item set changes', () => {
  const d = dom(`<form id="f">${TERMS}</form>`).window.document;
  const before = momentFingerprint(findConsentMoments(d)[0]);
  byId(d, 'f').insertAdjacentHTML('beforeend', `<label><input type="checkbox"> 제3자 제공 동의 (선택)</label>`);
  assert.notEqual(momentFingerprint(findConsentMoments(d)[0]), before);
});

test('debounces a burst of mutations into a single analysis', async () => {
  const { window } = dom(`<div id="host"></div>`);
  const calls: ConsentMoment[][] = [];
  const stop = observeConsent(window.document, (m) => calls.push(m), { debounceMs: 20 });
  const host = byId(window.document, 'host');
  for (let i = 0; i < 5; i++) host.insertAdjacentHTML('beforeend', `<form>${TERMS}</form>`);
  await sleep(80);
  stop();
  assert.equal(calls.length, 1, 'one callback for the whole burst');
  assert.equal(calls[0].length, 5, 'carrying all five moments');
});

test('does not re-analyse when nothing about the consent items changed', async () => {
  const { window } = dom(`<form>${TERMS}</form>`);
  const calls: ConsentMoment[][] = [];
  const stop = observeConsent(window.document, (m) => calls.push(m), { debounceMs: 20 });
  await sleep(40);
  window.document.body.insertAdjacentHTML('beforeend', '<p>unrelated content</p>');
  await sleep(60);
  stop();
  assert.equal(calls.length, 1);
});

test('stop() detaches the observer', async () => {
  const { window } = dom(`<div id="host"></div>`);
  const calls: ConsentMoment[][] = [];
  const stop = observeConsent(window.document, (m) => calls.push(m), { debounceMs: 10 });
  stop();
  byId(window.document, 'host').insertAdjacentHTML('beforeend', `<form>${TERMS}</form>`);
  await sleep(40);
  assert.equal(calls.length, 0);
});
