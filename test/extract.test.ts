import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractItems, isConsentCheckbox } from '../src/content/extract.js';

const dom = (html: string) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const items = (html: string) => extractItems(dom(html).body);

test('associates a checkbox with its label[for]', () => {
  const [it] = items(`
    <input type="checkbox" id="t1"><label for="t1">이용약관 동의 (필수)</label>
  `);
  assert.equal(it.labelText, '이용약관 동의 (필수)');
  assert.equal(it.mark, 'required');
});

test('associates a checkbox wrapped in its label', () => {
  const [it] = items(`<label><input type="checkbox"> 개인정보 수집·이용 동의 (선택)</label>`);
  assert.equal(it.mark, 'optional');
  assert.match(it.labelText, /개인정보 수집/);
});

test('reads a mark that sits in a sibling span', () => {
  const [it] = items(`
    <div class="row">
      <input type="checkbox" id="t1">
      <label for="t1">마케팅 정보 수신 동의</label>
      <span class="tag">선택</span>
    </div>
  `);
  assert.equal(it.mark, 'optional');
});

test('reads a mark from an ancestor heading up to two levels up', () => {
  const [it] = items(`
    <section>
      <h3>선택 항목</h3>
      <div><div><input type="checkbox" id="t1"><label for="t1">광고성 정보 수신</label></div></div>
    </section>
  `);
  assert.equal(it.mark, 'optional');
});

test('an item with no mark anywhere is "absent", which is a §22 finding', () => {
  const [it] = items(`<label><input type="checkbox"> 개인정보 처리방침에 동의합니다</label>`);
  assert.equal(it.mark, 'absent');
});

test('detects the select-all control', () => {
  const list = items(`
    <label><input type="checkbox"> 아래 약관에 모두 동의합니다</label>
    <label><input type="checkbox"> 이용약관 동의 (필수)</label>
  `);
  assert.equal(list[0].isSelectAll, true);
  assert.equal(list[1].isSelectAll, false);
});

test('captures checked, disabled and the HTML required attribute', () => {
  const [it] = items(`<label><input type="checkbox" checked disabled required> 이용약관 동의 (필수)</label>`);
  assert.equal(it.checked, true);
  assert.equal(it.disabled, true);
  assert.equal(it.required, true);
});

test('captures inline terms text sitting next to the item', () => {
  const [it] = items(`
    <div class="row">
      <label><input type="checkbox"> 개인정보 수집·이용 동의 (필수)</label>
      <div class="terms">회사는 회원가입 및 서비스 제공을 위하여 이름, 이메일을 수집합니다. 보유기간은 회원 탈퇴 시까지입니다.</div>
    </div>
  `);
  assert.equal(it.termsSource, 'inline');
  assert.match(it.termsText ?? '', /회원가입 및 서비스 제공을 위하여/);
});

test('a terms link is recorded for prefetch and starts out unavailable', () => {
  const [it] = items(`
    <div class="row">
      <label><input type="checkbox"> 이용약관 동의 (필수)</label>
      <a href="/terms/service">약관 보기</a>
    </div>
  `);
  assert.equal(it.termsSource, 'unavailable');
  assert.match(it.termsUrl ?? '', /\/terms\/service$/);
});

test('does not treat the terms link text itself as the terms body', () => {
  const [it] = items(`
    <div class="row"><label><input type="checkbox"> 이용약관 동의 (필수)</label><a href="/t">보기</a></div>
  `);
  assert.equal(it.termsText, null);
});

// --- the "do not touch unrelated checkboxes" rule ---------------------
test('ignores checkboxes that are not consent controls', () => {
  const list = items(`
    <label><input type="checkbox" id="save"> 아이디 저장</label>
    <label><input type="checkbox" id="keep"> 로그인 상태 유지</label>
    <label><input type="checkbox" id="ad"> 광고성 정보 수신 동의 (선택)</label>
  `);
  assert.deepEqual(list.map((i) => i.id.includes('ad')), [true]);
});

test('isConsentCheckbox recognises consent vocabulary and marks', () => {
  assert.equal(isConsentCheckbox('이용약관 동의'), true);
  assert.equal(isConsentCheckbox('개인정보 수집 및 이용'), true);
  assert.equal(isConsentCheckbox('제3자 제공'), true);
  assert.equal(isConsentCheckbox('마케팅 활용'), true);
  assert.equal(isConsentCheckbox('전체 동의'), true);
  assert.equal(isConsentCheckbox('(선택)'), true);
  assert.equal(isConsentCheckbox('아이디 저장'), false);
  assert.equal(isConsentCheckbox('로그인 상태 유지'), false);
  assert.equal(isConsentCheckbox(''), false);
});

// --- identity + re-resolution -----------------------------------------
test('every item gets a stable id and a selector that finds it again', () => {
  const d = dom(`
    <form><label><input type="checkbox"> 이용약관 동의 (필수)</label>
    <label><input type="checkbox"> 마케팅 수신 (선택)</label></form>
  `);
  const list = extractItems(d.body);
  assert.equal(new Set(list.map((i) => i.id)).size, 2);
  for (const it of list) {
    assert.equal(d.querySelector(it.selector), it.element);
  }
});

test('ids are stable across two extractions of the same DOM', () => {
  const d = dom(`<label><input type="checkbox"> 이용약관 동의 (필수)</label>`);
  assert.equal(extractItems(d.body)[0].id, extractItems(d.body)[0].id);
});

test('hidden checkboxes styled as custom controls are still extracted', () => {
  const [it] = items(`
    <label class="custom"><input type="checkbox" style="opacity:0;position:absolute"> 이용약관 동의 (필수)</label>
  `);
  assert.equal(it.mark, 'required');
});

test('extracting from an empty container yields nothing', () => {
  assert.deepEqual(items('<div>no checkboxes here</div>'), []);
});
