import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyContext, canAutoApply } from '../src/core/context.js';
import type { ContextSignals, MomentKind, PageContext, Regime } from '../src/core/types.js';

const at = (over: ContextSignals = {}): PageContext =>
  classifyContext({ url: '', title: '', text: '', ...over });

/** canAutoApply reads moment, certain and regime; scores are irrelevant. */
const ctx = (moment: MomentKind, certain: boolean, regime: Regime = 'kr'): PageContext =>
  ({ moment, certain, regime }) as PageContext;

test('classifies a checkout flow', () => {
  const c = at({
    url: 'https://shop.example.com/order/payment',
    text: '결제수단 선택 무통장입금 최종 결제 금액 결제하기',
  });
  assert.equal(c.moment, 'payment');
  assert.equal(c.certain, true);
});

test('classifies a signup form', () => {
  const c = at({
    url: 'https://example.com/member/join',
    title: '회원가입',
    text: '아이디 비밀번호 확인 이용약관 동의 가입하기',
  });
  assert.equal(c.moment, 'signup');
  assert.equal(c.certain, true);
});

test('classifies an event entry form', () => {
  const c = at({ url: 'https://example.com/event/2024', text: '이벤트 응모하기 경품 추첨 쿠폰 지급' });
  assert.equal(c.moment, 'entry');
  assert.equal(c.certain, true);
});

test('classifies a re-consent modal', () => {
  const c = at({ text: '개인정보 처리방침 개정 안내 약관 재동의 동의하고 계속하기' });
  assert.equal(c.moment, 'reconsent');
  assert.equal(c.certain, true);
});

test('classifies social login linking', () => {
  const c = at({ text: '카카오 간편로그인 계정 연동 소셜 로그인 정보 제공 동의' });
  assert.equal(c.moment, 'link');
  assert.equal(c.certain, true);
});

test('classifies identity verification', () => {
  const c = at({ text: '본인확인 휴대폰 본인인증 통신사 선택 실명확인' });
  assert.equal(c.moment, 'verify');
  assert.equal(c.certain, true);
});

test('an unrecognisable page is "other" and never certain', () => {
  const c = at({ url: 'https://example.com/', text: '동의합니다' });
  assert.equal(c.moment, 'other');
  assert.equal(c.certain, false);
});

test('S3: payment signals beat every other moment', () => {
  const c = at({
    url: 'https://example.com/order/checkout',
    text: '회원가입 이벤트 응모 결제하기 카드결제 최종 결제 금액',
  });
  assert.equal(c.moment, 'payment');
});

test('S3: a single weak signal is not enough to be certain', () => {
  const c = at({ text: '가입하기' });
  assert.equal(c.certain, false);
});

// --- the auto-apply gate ----------------------------------------------
test('canAutoApply: only for a confidently non-payment moment', () => {
  assert.equal(canAutoApply(ctx('signup', true)), true);
  assert.equal(canAutoApply(ctx('entry', true)), true);
  assert.equal(canAutoApply(ctx('reconsent', true)), true);
});

test('S3: canAutoApply is false for payment, for uncertainty, and for junk', () => {
  assert.equal(canAutoApply(ctx('payment', true)), false);
  assert.equal(canAutoApply(ctx('signup', false)), false);
  assert.equal(canAutoApply(ctx('other', true)), false);
  assert.equal(canAutoApply(null), false);
  assert.equal(canAutoApply(undefined), false);
  assert.equal(canAutoApply({} as PageContext), false);
});
