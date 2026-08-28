import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { findConsentBanners, soleRejectControl } from '../src/content/banner.js';
import { activateRefusal, refuseToPress, submits } from '../src/content/activate.js';
import { handleBanners } from '../src/content/banners.js';
import { q } from './helpers.js';

const dom = (html: string): Document =>
  new JSDOM(`<!doctype html><body>${html}</body>`, { pretendToBeVisual: true }).window.document;

const COOKIE_BANNER = `
  <div role="dialog" aria-label="Cookie notice">
    <p>We use cookies to personalise content and measure traffic.</p>
    <button id="reject" type="button">Reject all</button>
    <button id="manage" type="button">Manage preferences</button>
    <button id="accept" type="button">Accept all</button>
  </div>`;

const only = <T>(list: readonly T[]): T => {
  assert.equal(list.length, 1, `expected exactly one, got ${list.length}`);
  return list[0] as T;
};

// --- finding -----------------------------------------------------------
test('a dialog carrying consent vocabulary is a banner', () => {
  const banner = only(findConsentBanners(dom(COOKIE_BANNER)));
  assert.equal(banner.controls.length, 3);
  assert.deepEqual(
    banner.controls.map((c) => c.kind),
    ['reject', 'manage', 'accept']
  );
});

test('a dialog about something else is not a banner', () => {
  const doc = dom(`
    <div role="dialog"><p>Delete this file?</p>
      <button type="button">Cancel</button><button type="button">Delete</button></div>`);
  assert.deepEqual(findConsentBanners(doc), []);
});

test('ordinary page content is not a banner, however much it mentions cookies', () => {
  const doc = dom(`
    <article><h1>Cookie policy</h1><p>This page explains our cookie consent choices.</p>
      <button type="button">Print</button></article>`);
  assert.deepEqual(findConsentBanners(doc), []);
});

test('a banner nested in another is not counted twice', () => {
  const doc = dom(`
    <div role="dialog"><p>쿠키 동의</p>
      <div role="dialog"><p>쿠키 동의</p><button type="button">모두 거부</button></div>
      <button type="button">전체 동의</button>
    </div>`);
  const banner = only(findConsentBanners(doc));
  assert.equal(banner.controls.length, 2, 'the outer banner owns both controls');
});

// --- choosing ----------------------------------------------------------
test('the refusal control is the one offered', () => {
  const banner = only(findConsentBanners(dom(COOKIE_BANNER)));
  assert.equal(soleRejectControl(banner)?.labelText, 'Reject all');
});

/**
 * Two refusal controls means the banner is not the shape we think it is, and
 * pressing either would be a guess.
 */
test('nothing is offered when a banner has more than one refusal', () => {
  const doc = dom(`
    <div role="dialog"><p>cookie consent</p>
      <button type="button">Reject all</button>
      <button type="button">Only necessary</button>
      <button type="button">Accept all</button>
    </div>`);
  assert.equal(soleRejectControl(only(findConsentBanners(doc))), null);
});

test('nothing is offered when a banner only grants', () => {
  const doc = dom(`
    <div role="dialog"><p>cookie consent</p><button type="button">Accept all</button></div>`);
  assert.equal(soleRejectControl(only(findConsentBanners(doc))), null);
});

// --- S1a: never submit -------------------------------------------------
/**
 * A <button> inside a form defaults to type="submit". It is the likeliest way
 * to fire a form by accident, and a correct-looking label does not change that.
 */
test('a bare button inside a form is a submit button', () => {
  const doc = dom(`<form><button id="b">Reject all</button></form>`);
  assert.equal(submits(q<HTMLButtonElement>(doc, '#b')), true);
});

test('an explicit type="button" inside a form is not', () => {
  const doc = dom(`<form><button id="b" type="button">Reject all</button></form>`);
  assert.equal(submits(q<HTMLButtonElement>(doc, '#b')), false);
});

test('input[type=submit] and form-associated controls submit', () => {
  const doc = dom(`
    <form id="f"><input id="s" type="submit" value="Reject all"></form>
    <button id="o" type="button" form="f">Reject all</button>`);
  assert.equal(submits(q<HTMLInputElement>(doc, '#s')), true);
  assert.equal(submits(q<HTMLButtonElement>(doc, '#o')), true);
});

test('a refusal that would submit is never pressed', () => {
  const doc = dom(`<div role="dialog"><p>cookie consent</p>
    <form><button id="b">Reject all</button></form></div>`);
  const control = soleRejectControl(only(findConsentBanners(doc)));
  assert.equal(refuseToPress(control!), 'submits');
  let clicked = false;
  control!.element.addEventListener('click', () => { clicked = true; });
  assert.deepEqual(activateRefusal(control), { pressed: false, reason: 'submits' });
  assert.equal(clicked, false);
});

// --- pressing ----------------------------------------------------------
test('the refusal control is pressed, and nothing else is', () => {
  const doc = dom(COOKIE_BANNER);
  const pressed: string[] = [];
  for (const id of ['reject', 'manage', 'accept']) {
    q<HTMLButtonElement>(doc, `#${id}`).addEventListener('click', () => pressed.push(id));
  }
  const result = activateRefusal(soleRejectControl(only(findConsentBanners(doc))));
  assert.deepEqual(result, { pressed: true, labelText: 'Reject all' });
  assert.deepEqual(pressed, ['reject']);
});

test('a disabled or detached control is not pressed', () => {
  const doc = dom(`<div role="dialog"><p>cookie consent</p>
    <button id="b" type="button" disabled>Reject all</button></div>`);
  const control = soleRejectControl(only(findConsentBanners(doc)));
  assert.equal(activateRefusal(control).pressed, false);

  const gone = dom(COOKIE_BANNER);
  const detached = soleRejectControl(only(findConsentBanners(gone)));
  detached!.element.remove();
  assert.deepEqual(activateRefusal(detached), { pressed: false, reason: 'detached' });
});

/**
 * Banners re-render. A label read once and pressed later is exactly how
 * "Reject all" becomes "Accept all" in between, so it is read again.
 */
test('a control whose label changed under us is not pressed', () => {
  const doc = dom(COOKIE_BANNER);
  const control = soleRejectControl(only(findConsentBanners(doc)));
  let clicked = false;
  control!.element.addEventListener('click', () => { clicked = true; });
  control!.element.textContent = 'Accept all';
  assert.deepEqual(activateRefusal(control), { pressed: false, reason: 'label_changed' });
  assert.equal(clicked, false);
});

test('Korean banners work the same way', () => {
  const doc = dom(`
    <div role="dialog"><p>쿠키 사용에 동의해 주세요</p>
      <button id="r" type="button">필수만 동의</button>
      <button id="a" type="button">전체 동의</button></div>`);
  const banner = only(findConsentBanners(doc));
  const control = soleRejectControl(banner);
  assert.equal(control?.labelText, '필수만 동의');
  assert.equal(activateRefusal(control).pressed, true);
});

// --- the page as a whole -----------------------------------------------
test('handleBanners refuses and reports', () => {
  const doc = dom(COOKIE_BANNER);
  const pressed: string[] = [];
  for (const id of ['reject', 'manage', 'accept']) {
    q<HTMLButtonElement>(doc, `#${id}`).addEventListener('click', () => pressed.push(id));
  }
  const report = handleBanners(doc);
  assert.deepEqual(pressed, ['reject']);
  assert.equal(report?.pressed, true);
  assert.equal(report?.labelText, 'Reject all');
});

/**
 * Pressing changes the DOM, which wakes the MutationObserver, which calls back
 * in here. A site that leaves its banner up would otherwise be clicked forever.
 */
test('a control is pressed once, however often the page is re-analysed', () => {
  const doc = dom(COOKIE_BANNER);
  let clicks = 0;
  q<HTMLButtonElement>(doc, '#reject').addEventListener('click', () => { clicks++; });
  for (let i = 0; i < 5; i++) handleBanners(doc);
  assert.equal(clicks, 1);
});

test('a page with no banner reports nothing at all', () => {
  assert.equal(handleBanners(dom('<main><h1>Commits</h1></main>')), null);
});

test('a banner offering only acceptance is reported, not pressed', () => {
  const doc = dom(`
    <div role="dialog"><p>cookie consent</p>
      <button type="button">Accept all</button>
      <button type="button">Manage preferences</button></div>`);
  let clicks = 0;
  for (const b of doc.querySelectorAll('button')) b.addEventListener('click', () => { clicks++; });
  const report = handleBanners(doc);
  assert.equal(clicks, 0);
  assert.equal(report?.pressed, false);
  assert.equal(report?.banners, 1);
});
