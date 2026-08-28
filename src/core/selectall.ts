/**
 * selectall.ts — verification of the KRDS select-all rule.
 *
 * "If even one individual item is left at 'do not agree', the select-all
 *  checkbox must stay unchecked." (translated from the KRDS guideline)
 *
 * Purely mechanical. No AI, no DOM.
 */

/**
 * The state the select-all checkbox is allowed to be in, given the individual
 * items. Anything not explicitly checked counts as refused.
 */
export function expectedSelectAllState(
  itemStates: ReadonlyArray<boolean | undefined>
): boolean {
  const list = Array.isArray(itemStates) ? itemStates : [];
  if (list.length === 0) return false;
  return list.every((checked) => checked === true);
}

/**
 * @param selectAllChecked current state of the select-all checkbox
 * @param itemStates current state of each individual item
 */
export function verifySelectAll(
  selectAllChecked: boolean,
  itemStates: ReadonlyArray<boolean | undefined>
): { violated: boolean; expected: boolean } {
  const list = Array.isArray(itemStates) ? itemStates : [];
  const expected = expectedSelectAllState(list);
  const violated = selectAllChecked === true && list.length > 0 && expected === false;
  return { violated, expected };
}
