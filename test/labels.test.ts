import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMark, isSelectAllText, resolveMark } from '../src/core/labels.js';

// --- required variants -------------------------------------------------
const REQUIRED = [
  '(필수)',
  '[필수]',
  '필수',
  '*필수',
  '필수동의',
  '필수 항목',
  '※필수',
  '<필수>',
  '【필수】',
  '(필수) 이용약관 동의',
  '이용약관 동의 (필수)',
  '만 14세 이상입니다 [필수]',
  '필수 이용약관에 동의합니다',
  '개인정보 수집·이용 동의(필수)',
  '필수)',
  '- 필수',
  '· 필수 항목',
  '필수 입력',
  '필수사항',
];

test('parseMark: required variants', () => {
  for (const text of REQUIRED) {
    assert.deepEqual(parseMark(text), { mark: 'required' }, `expected required for ${JSON.stringify(text)}`);
  }
});

// --- optional variants -------------------------------------------------
const OPTIONAL = [
  '(선택)',
  '[선택]',
  '선택',
  '선택동의',
  '선택 항목',
  '(선택사항)',
  '※선택',
  '*선택',
  '광고성 정보 수신 동의 (선택)',
  '(선택) 마케팅 활용 동의',
  '선택적 동의',
  '선택 입력',
  '<선택>',
];

test('parseMark: optional variants', () => {
  for (const text of OPTIONAL) {
    assert.deepEqual(parseMark(text), { mark: 'optional' }, `expected optional for ${JSON.stringify(text)}`);
  }
});

// --- no mark at all ----------------------------------------------------
const ABSENT = [
  '',
  '   ',
  '이용약관 동의',
  '개인정보 처리방침에 동의합니다',
  '마케팅 정보 수신',
  '만 14세 이상입니다',
  'I agree to the terms',
  null,
  undefined,
];

test('parseMark: absent when no legal mark is printed', () => {
  for (const text of ABSENT) {
    assert.deepEqual(parseMark(text), { mark: 'absent' }, `expected absent for ${JSON.stringify(text)}`);
  }
});

// --- safety: ambiguity must never resolve to "required" ---------------
test('parseMark: both marks present resolves to optional, never required', () => {
  assert.deepEqual(parseMark('필수 및 선택 항목 전체 동의'), { mark: 'optional' });
  assert.deepEqual(parseMark('(선택) 필수가 아닌 정보'), { mark: 'optional' });
});

test('parseMark: negated required is not required', () => {
  assert.deepEqual(parseMark('필수 아님'), { mark: 'optional' });
  assert.deepEqual(parseMark('필수가 아닙니다'), { mark: 'optional' });
  assert.deepEqual(parseMark('비필수 항목'), { mark: 'optional' });
});

test('parseMark: normalises whitespace and full-width brackets', () => {
  assert.deepEqual(parseMark('（필수）'), { mark: 'required' });
  assert.deepEqual(parseMark('  필\t수  '), { mark: 'absent' }, 'split characters are not a mark');
  assert.deepEqual(parseMark('（선택）'), { mark: 'optional' });
});

// --- select-all --------------------------------------------------------
const SELECT_ALL = [
  '전체 동의',
  '전체동의',
  '모두 동의',
  '모두동의',
  '아래 약관에 모두 동의합니다',
  '전체 약관에 동의합니다',
  '일괄 동의',
  '일괄 선택',
  '전체 선택',
  '모두 선택',
  '전체 동의하기',
  '이용약관 전체동의 (필수 및 선택 항목 포함)',
];

test('isSelectAllText: recognises select-all rows', () => {
  for (const text of SELECT_ALL) {
    assert.equal(isSelectAllText(text), true, `expected select-all for ${JSON.stringify(text)}`);
  }
});

const NOT_SELECT_ALL = [
  '이용약관 동의 (필수)',
  '마케팅 수신 동의 (선택)',
  '',
  null,
  '동의',
  '개인정보 수집 동의',
  '선택 항목',
];

test('isSelectAllText: does not fire on individual items', () => {
  for (const text of NOT_SELECT_ALL) {
    assert.equal(isSelectAllText(text), false, `expected NOT select-all for ${JSON.stringify(text)}`);
  }
});

// --- resolveMark: ordered candidate cascade ---------------------------
test('resolveMark: first candidate carrying a mark wins', () => {
  assert.deepEqual(
    resolveMark(['이용약관 동의', '(필수)', '(선택)']),
    { mark: 'required', source: 1 }
  );
});

test('resolveMark: falls through empty candidates', () => {
  assert.deepEqual(
    resolveMark([null, '', '   ', '광고 수신 (선택)']),
    { mark: 'optional', source: 3 }
  );
});

test('resolveMark: absent when no candidate carries a mark', () => {
  assert.deepEqual(resolveMark(['이용약관 동의', '개인정보 처리방침']), { mark: 'absent', source: -1 });
  assert.deepEqual(resolveMark([]), { mark: 'absent', source: -1 });
});
