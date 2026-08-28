import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymize } from '../tools/anonymize.js';

test('strips scripts, styles and images', () => {
  const out = anonymize(`
    <script>var tracker = 1</script>
    <style>.a{color:red}</style>
    <img src="https://cdn.example.com/logo.png" alt="브랜드">
    <label><input type="checkbox"> 이용약관 동의 (필수)</label>
  `);
  assert.doesNotMatch(out, /tracker/);
  assert.doesNotMatch(out, /color:red/);
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /이용약관 동의 \(필수\)/);
});

test('keeps the consent markup that the extractor depends on', () => {
  const out = anonymize(`
    <div class="row"><input type="checkbox" id="a1" checked>
    <label for="a1">개인정보 수집·이용 동의</label><span class="tag">선택</span>
    <a href="/policy/privacy">보기</a></div>
  `);
  assert.match(out, /type="checkbox"/);
  assert.match(out, /id="a1"/);
  assert.match(out, /checked/);
  assert.match(out, /label for="a1"/);
  assert.match(out, /선택/);
  assert.match(out, /href="\/policy\/privacy"/);
});

test('redacts anything that looks like a person', () => {
  const out = anonymize(`
    <p>홍길동 010-1234-5678 hong@realmail.co.kr 주민번호 900101-1234567</p>
    <p>카드 1234-5678-9012-3456 · 주문번호 20240513001234</p>
  `);
  assert.doesNotMatch(out, /010-1234-5678/);
  assert.doesNotMatch(out, /hong@realmail\.co\.kr/);
  assert.doesNotMatch(out, /900101-1234567/);
  assert.doesNotMatch(out, /1234-5678-9012-3456/);
  assert.doesNotMatch(out, /20240513001234/);
});

test('removes inline event handlers and absolute URLs', () => {
  const out = anonymize(`<div onclick="track('user-42')"><a href="https://shop.realbrand.co.kr/order/9931">주문</a></div>`);
  assert.doesNotMatch(out, /onclick/);
  assert.doesNotMatch(out, /realbrand/);
  assert.match(out, /example\.test/);
});

test('applies caller-supplied brand replacements', () => {
  const out = anonymize('<h1>리얼브랜드 회원가입</h1>', { replace: [['리얼브랜드', '서비스']] });
  assert.match(out, /서비스 회원가입/);
  assert.doesNotMatch(out, /리얼브랜드/);
});
