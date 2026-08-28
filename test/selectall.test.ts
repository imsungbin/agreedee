import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedSelectAllState, verifySelectAll } from '../src/core/selectall.js';

/**
 * KRDS: "If even one individual item is left at 'do not agree', the select-all
 *        checkbox must stay unchecked." (translated from the KRDS guideline)
 * Pure mechanical rule. No AI.
 */

test('expectedSelectAllState: true only when every item is checked', () => {
  assert.equal(expectedSelectAllState([true, true, true]), true);
  assert.equal(expectedSelectAllState([true, false, true]), false);
  assert.equal(expectedSelectAllState([false, false]), false);
  assert.equal(expectedSelectAllState([true]), true);
});

test('expectedSelectAllState: no individual items means nothing to aggregate', () => {
  assert.equal(expectedSelectAllState([]), false);
});

test('verifySelectAll: checked select-all over a refused item is a violation', () => {
  assert.deepEqual(
    verifySelectAll(true, [true, false, true]),
    { violated: true, expected: false }
  );
});

test('verifySelectAll: checked select-all with all items checked is consistent', () => {
  assert.deepEqual(
    verifySelectAll(true, [true, true]),
    { violated: false, expected: true }
  );
});

test('verifySelectAll: unchecked select-all is never a violation', () => {
  assert.deepEqual(verifySelectAll(false, [true, false]), { violated: false, expected: false });
  assert.deepEqual(verifySelectAll(false, [true, true]), { violated: false, expected: true });
});

test('verifySelectAll: a select-all with no individual items cannot violate the rule', () => {
  assert.deepEqual(verifySelectAll(true, []), { violated: false, expected: false });
});

test('verifySelectAll: coerces missing state to unchecked (uncertain -> refused)', () => {
  assert.deepEqual(
    verifySelectAll(true, [true, undefined]),
    { violated: true, expected: false }
  );
});
