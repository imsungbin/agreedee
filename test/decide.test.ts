import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../src/core/decide.js';
import type { DecidableItem, Mark, MomentKind, Substance, SubstanceMap } from '../src/core/types.js';
import { one } from './helpers.js';

/**
 * decide() is pure. Substance labels are stubbed here — Claude is never
 * involved in a decision, only in supplying a substance + verbatim quote.
 *
 * ConsentItem: { id, labelText, mark, isSelectAll, checked, disabled,
 *                required, termsText, termsSource }
 * Substance:   { [id]: { substance, quote } }
 * Decision:    { id, action: 'check'|'uncheck'|'leave', reason, flag }
 */

function item(over: Partial<DecidableItem> = {}): DecidableItem {
  return {
    id: 'i1',
    labelText: '이용약관 동의',
    mark: 'required',
    isSelectAll: false,
    checked: false,
    disabled: false,
    termsText: '본 약관은 서비스 제공을 위하여 필요합니다.',
    termsSource: 'inline',
    ...over,
  };
}

const ESSENTIAL: SubstanceMap[string] = { substance: 'service_essential', quote: '본 약관은 서비스 제공을 위하여 필요합니다.' };

// --- S4: the only path to "check" -------------------------------------
test('S4: required + service_essential + verbatim quote is the only way to check', () => {
  const [d] = decide([item()], { i1: ESSENTIAL }, 'signup');
  assert.equal(d.action, 'check');
  assert.equal(d.flag, null);
});

test('S4: an optional item is never checked, whatever the substance says', () => {
  const all: Substance[] = ['service_essential', 'marketing', 'third_party_sharing', 'unclear'];
  for (const substance of all) {
    const [d] = decide(
      [item({ mark: 'optional' })],
      { i1: { substance, quote: '본 약관은 서비스 제공을 위하여 필요합니다.' } },
      'signup'
    );
    assert.equal(d.action, 'uncheck', `optional + ${substance} must uncheck`);
  }
});

test('S4: an unmarked item is never checked and is reported under §22', () => {
  const [d] = decide([item({ mark: 'absent' })], { i1: ESSENTIAL }, 'signup');
  assert.equal(d.action, 'uncheck');
  assert.equal(d.flag, 'missing_mark');
});

test('S4: a required item without a quote is not checked', () => {
  const [d] = decide([item()], { i1: { substance: 'service_essential', quote: null } }, 'signup');
  assert.notEqual(d.action, 'check');
});

test('S4: a quote that is not verbatim in the terms text is rejected', () => {
  const [d] = decide(
    [item()],
    { i1: { substance: 'service_essential', quote: '이 문장은 약관에 없습니다.' } },
    'signup'
  );
  assert.notEqual(d.action, 'check');
  assert.equal(d.reason, 'quote_not_verbatim');
});

test('quote matching tolerates whitespace differences only', () => {
  const [d] = decide(
    [item({ termsText: '본 약관은\n  서비스 제공을 위하여   필요합니다.' })],
    { i1: ESSENTIAL },
    'signup'
  );
  assert.equal(d.action, 'check');
});

// --- S2: uncertainty resolves toward unchecked ------------------------
test('S2: an optional item that arrived pre-checked is unchecked and flagged', () => {
  const [d] = decide([item({ mark: 'optional', checked: true })], {}, 'signup');
  assert.equal(d.action, 'uncheck');
  assert.equal(d.flag, 'prechecked_optional');
});

test('S2: unreachable terms text can never justify a check', () => {
  const [d] = decide(
    [item({ termsText: null, termsSource: 'unavailable' })],
    { i1: ESSENTIAL },
    'signup'
  );
  assert.notEqual(d.action, 'check');
  assert.equal(d.reason, 'terms_unavailable');
});

test('S2: marketing substance under a required label is unchecked and flagged as a mismatch', () => {
  const [d] = decide(
    [item({ termsText: '광고성 정보를 전송할 수 있습니다.' })],
    { i1: { substance: 'marketing', quote: '광고성 정보를 전송할 수 있습니다.' } },
    'signup'
  );
  assert.equal(d.action, 'uncheck');
  assert.equal(d.flag, 'label_substance_mismatch');
});

test('S2: third-party sharing under a required label is unchecked and flagged', () => {
  const [d] = decide(
    [item({ termsText: '제휴사에 개인정보를 제공합니다.' })],
    { i1: { substance: 'third_party_sharing', quote: '제휴사에 개인정보를 제공합니다.' } },
    'signup'
  );
  assert.equal(d.action, 'uncheck');
  assert.equal(d.flag, 'label_substance_mismatch');
});

// --- S5: degraded mode is safe, not disabled --------------------------
test('S5: with no substance data at all, required is left alone and everything else unchecks', () => {
  const decisions = decide(
    [
      item({ id: 'req', mark: 'required', checked: true }),
      item({ id: 'opt', mark: 'optional', checked: true }),
      item({ id: 'none', mark: 'absent', checked: true }),
    ],
    {},
    'signup'
  );
  assert.deepEqual(decisions.map((d) => [d.id, d.action]), [
    ['req', 'leave'],
    ['opt', 'uncheck'],
    ['none', 'uncheck'],
  ]);
});

test('S5: malformed substance payloads degrade to unclear rather than throwing', () => {
  const decisions = decide(
    [item({ id: 'a' }), item({ id: 'b' })],
    // Deliberately malformed: an invented substance and a null entry. The
    // cast is the point of the test — this is what a bad API reply looks like.
    { a: { substance: 'definitely_fine', quote: 'x' }, b: null } as unknown as SubstanceMap,
    'signup'
  );
  assert.equal(decisions.every((d) => d.action !== 'check'), true);
});

// --- S3: payment context never adds consent ---------------------------
test('S3: in a payment flow no decision ever adds a check', () => {
  const decisions = decide(
    [item({ id: 'req' }), item({ id: 'opt', mark: 'optional', checked: true })],
    { req: ESSENTIAL },
    'payment'
  );
  assert.equal(decisions.find((d) => d.id === 'req')?.action, 'leave');
  assert.equal(decisions.find((d) => d.id === 'opt')?.action, 'uncheck');
});

// --- disabled controls -------------------------------------------------
test('a disabled checkbox is left alone but still reported', () => {
  const [d] = decide([item({ mark: 'optional', checked: true, disabled: true })], {}, 'signup');
  assert.equal(d.action, 'leave');
  assert.equal(d.reason, 'disabled');
  assert.equal(d.flag, 'prechecked_optional');
});

// --- select-all --------------------------------------------------------
test('KRDS: a checked select-all over an already-refused item is a violation', () => {
  const decisions = decide(
    [
      item({ id: 'all', isSelectAll: true, mark: 'absent', checked: true }),
      item({ id: 'req', mark: 'required', checked: true }),
      item({ id: 'opt', mark: 'optional', checked: false }), // user already refused this one
    ],
    { req: ESSENTIAL },
    'signup'
  );
  const all = one(decisions, 'all');
  assert.equal(all.action, 'uncheck');
  assert.equal(all.flag, 'selectall_violation');
});

test('select-all is unchecked once our own changes refuse an item, without a KRDS finding', () => {
  const decisions = decide(
    [
      item({ id: 'all', isSelectAll: true, mark: 'absent', checked: true }),
      item({ id: 'req', mark: 'required', checked: true }),
      item({ id: 'opt', mark: 'optional', checked: true }),
    ],
    { req: ESSENTIAL },
    'signup'
  );
  const all = one(decisions, 'all');
  assert.equal(all.action, 'uncheck');
  assert.equal(all.flag, null, 'the page as loaded was consistent; only our uncheck changed that');
});

test('a pre-checked select-all over already-consistent items is not a KRDS finding', () => {
  const decisions = decide(
    [
      item({ id: 'all', isSelectAll: true, mark: 'absent', checked: true }),
      item({ id: 'r1', mark: 'required', checked: true }),
      item({ id: 'r2', mark: 'required', checked: true }),
    ],
    { r1: ESSENTIAL, r2: ESSENTIAL },
    'signup'
  );
  const all = one(decisions, 'all');
  assert.equal(all.flag, null);
  assert.equal(all.action, 'leave');
});

test('select-all is never checked, even when every item ends up checked', () => {
  const decisions = decide(
    [
      item({ id: 'all', isSelectAll: true, mark: 'absent', checked: false }),
      item({ id: 'r1', mark: 'required', checked: true }),
    ],
    { r1: ESSENTIAL },
    'signup'
  );
  assert.equal(decisions.find((d) => d.id === 'all')?.action, 'leave');
});

test('a select-all is never checked, even alone and even marked required', () => {
  const [d] = decide(
    [item({ id: 'all', isSelectAll: true, mark: 'required', checked: false })],
    { all: ESSENTIAL },
    'signup'
  );
  assert.notEqual(d.action, 'check', 'a bulk control must never grant consent we did not verify item by item');
});

test('a lone select-all with no individual items falls back to normal item rules', () => {
  const [d] = decide([item({ id: 'all', isSelectAll: true, mark: 'absent', checked: true })], {}, 'signup');
  assert.equal(d.action, 'uncheck');
  assert.equal(d.flag, 'missing_mark');
});

// --- shape + robustness ------------------------------------------------
test('every decision carries the documented shape', () => {
  const decisions = decide([item(), item({ id: 'i2', mark: 'optional' })], { i1: ESSENTIAL }, 'signup');
  for (const d of decisions) {
    assert.deepEqual(Object.keys(d).sort(), ['action', 'flag', 'id', 'reason']);
    assert.ok(['check', 'uncheck', 'leave'].includes(d.action));
    assert.equal(typeof d.reason, 'string');
    assert.ok(d.flag === null || typeof d.flag === 'string');
  }
});

test('empty input yields no decisions', () => {
  assert.deepEqual(decide([], {}, 'signup'), []);
  // Deliberately hostile input: the core must not throw on a caller's bug.
  assert.deepEqual(
    decide(null as unknown as DecidableItem[], null as unknown as SubstanceMap, undefined),
    []
  );
});

// --- the invariant that matters most ----------------------------------
test('INVARIANT: no combination of inputs checks a box that is not marked required', () => {
  const marks: Mark[] = ['optional', 'absent'];
  const substances: Substance[] = [
    'service_essential',
    'marketing',
    'third_party_sharing',
    'unclear',
  ];
  const contexts: MomentKind[] = [
    'signup', 'payment', 'entry', 'reconsent', 'link', 'verify', 'other',
  ];
  for (const mark of marks) {
    for (const substance of substances) {
      for (const checked of [true, false]) {
        for (const context of contexts) {
          const [d] = decide(
            [item({ mark, checked })],
            { i1: { substance, quote: '본 약관은 서비스 제공을 위하여 필요합니다.' } },
            context
          );
          assert.notEqual(d.action, 'check', `${mark}/${substance}/${checked}/${context} must not check`);
        }
      }
    }
  }
});
