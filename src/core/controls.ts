/**
 * controls.ts — what a consent banner's buttons do, read from their labels.
 *
 * No AI, no DOM, no network. The AI may not decide what a button does, for the
 * same reason it may not decide law: pressing the wrong one transmits consent
 * and cannot be undone.
 *
 * Safety rule (S1b): a label is `reject` only when it says so and says nothing
 * that contradicts it. Ambiguity resolves away from clickable, exactly as an
 * ambiguous mark in labels.ts resolves away from `required`.
 */

export type ControlKind = 'reject' | 'accept' | 'manage' | 'other';

/**
 * The decisive token is scope, not verb. Real banners label their refusal
 * button "Accept only necessary" as often as "Reject all" — granting, but
 * scoped to what the site cannot run without, which is the minimising action.
 */
const MINIMAL_SCOPE =
  /필수(?:\s*항목)?\s*만|only\s*(?:strictly\s*)?(?:necessary|essential|required)|(?:strictly\s*)?(?:necessary|essential)(?:\s*cookies)?\s*only/i;

/** Granting in bulk. The one thing that must never be pressed by mistake. */
const BULK_GRANT =
  /전체\s*동의|모두\s*동의|전부\s*동의|모두\s*허용|일괄\s*동의|accept\s*all|allow\s*all|agree\s*to\s*all|enable\s*all|allow\s*cookies/i;

/** Refusing outright. */
const REFUSAL =
  /거부|동의\s*안\s*함|동의하지\s*않|선택\s*안\s*함|모두\s*해제|전체\s*해제|reject|decline|refuse|deny|opt[-\s]?out|do\s*not\s*(?:accept|agree|sell|share)|without\s*(?:accepting|agreeing)/i;

/**
 * Phrases that negate a grant word appearing later in the same label.
 * "Continue without accepting" contains "accept" and grants nothing.
 * Mirrors NEGATED_REQUIRED in labels.ts.
 */
const NEGATED_GRANT =
  /without\s*(?:accepting|agreeing)|do\s*not\s*(?:accept|agree)|동의\s*안\s*함|동의하지\s*않/i;

/** Granting, unscoped. */
const PLAIN_GRANT =
  /동의합니다|동의하기|수락|허용하기|accept|agree|got\s*it|understood|i\s*consent|opt[-\s]?in|^\s*(?:ok|okay|yes)\b/i;

/** Opening a panel, which is a navigation into something we cannot see. */
const MANAGE =
  /설정|관리|맞춤\s*설정|상세|자세히|개별\s*선택|preferences|settings|manage|customi[sz]e|options|more\s*choices|details/i;

/** Collapse whitespace without deleting it, as labels.ts does for marks. */
function normalize(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * A label long enough to be prose is not a button. Banner buttons are short,
 * and body copy that happens to contain "accept" is not a control.
 */
const MAX_LABEL = 48;

export function classifyControl(text: string | null | undefined): ControlKind {
  const s = normalize(text);
  if (!s || s.length > MAX_LABEL) return 'other';

  const bulk = BULK_GRANT.test(s);
  const refuses = REFUSAL.test(s);
  const grants = PLAIN_GRANT.test(s) && !NEGATED_GRANT.test(s);

  // A label claiming both a bulk grant and a refusal is not understood, and
  // not understanding it is not a licence to press it.
  if (bulk && refuses) return 'other';
  if (bulk) return 'accept';

  // Scoped to the essential: minimising, whichever verb it uses.
  if (MINIMAL_SCOPE.test(s)) return 'reject';

  // Says both, with no scope to settle which one wins.
  if (refuses && grants) return 'other';
  if (refuses) return 'reject';
  if (grants) return 'accept';
  if (MANAGE.test(s)) return 'manage';
  return 'other';
}

/** True only for a label that proves the control reduces consent. */
export function isRejectControl(text: string | null | undefined): boolean {
  return classifyControl(text) === 'reject';
}
