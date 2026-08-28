import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyControl, isRejectControl } from '../src/core/controls.js';

test('refusal is recognised in both languages', () => {
  for (const label of [
    '모두 거부', '거부', '동의 안 함', '동의하지 않습니다', '필수 항목만 동의', '필수만 동의',
    'Reject all', 'Decline all', 'Deny all', 'Refuse all',
    'Only necessary', 'Strictly necessary only', 'Essential cookies only',
    'Do not sell my personal information', 'Opt out',
  ]) {
    assert.equal(classifyControl(label), 'reject', label);
  }
});

test('granting is recognised and never confused for refusal', () => {
  for (const label of [
    '전체 동의', '모두 동의', '모두 허용', '수락',
    'Accept all', 'Accept cookies', 'Allow all', 'I agree', 'Got it', 'OK', 'Enable all',
  ]) {
    assert.equal(classifyControl(label), 'accept', label);
    assert.equal(isRejectControl(label), false, label);
  }
});

test('a panel opener is recognised but is not a refusal', () => {
  for (const label of ['설정', '맞춤 설정', '개별 선택', 'Manage preferences', 'Customize', 'More choices']) {
    assert.equal(classifyControl(label), 'manage', label);
    assert.equal(isRejectControl(label), false, label);
  }
});

/**
 * Scope decides, not verb. Real banners label their refusal button "Accept
 * only necessary" as often as "Reject all": it grants, but only what the site
 * cannot run without, which is the minimising action.
 */
test('a grant scoped to the essential is a refusal', () => {
  for (const label of [
    'Accept only necessary cookies',
    'Allow essential only',
    'Only strictly necessary',
    '필수 항목만 동의',
    '필수만 허용',
  ]) {
    assert.equal(classifyControl(label), 'reject', label);
  }
});

/**
 * S1b. Pressing Accept by mistake transmits consent and cannot be undone, so a
 * label that reads as both is not a licence to press it — the same rule that
 * makes an ambiguous mark resolve away from `required`.
 */
test('a label that says both things is never clickable', () => {
  for (const label of [
    'I accept — reject optional',
    'Accept all or reject',
    '전체 동의 / 거부',
  ]) {
    assert.equal(classifyControl(label), 'other', label);
    assert.equal(isRejectControl(label), false, label);
  }
});

/** A grant word inside a phrase that negates it grants nothing. */
test('a negated grant is a refusal, not an acceptance', () => {
  for (const label of ['Continue without accepting', 'Do not accept', '동의 안 함']) {
    assert.equal(classifyControl(label), 'reject', label);
  }
});

test('prose is not a button label', () => {
  const sentence =
    'We use cookies to personalise content and ads. You can accept all cookies or reject them below.';
  assert.equal(classifyControl(sentence), 'other');
});

test('nothing at all is not a refusal', () => {
  for (const label of ['', '   ', null, undefined, 'Close', '×', 'Learn more']) {
    assert.equal(isRejectControl(label), false, String(label));
  }
});

test('whitespace inside a word does not make a control', () => {
  // A word with a space inside it is not that word — the same rule labels.ts
  // applies to the printed mark.
  assert.equal(classifyControl('동 의 안 함'), 'other');
});
