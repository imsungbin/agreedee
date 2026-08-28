/**
 * findings.ts — which message describes a decision, given the regime.
 *
 * The same finding needs different words in different jurisdictions. Under
 * `kr` a missing mark is itself the finding, because Korean forms print one.
 * Under `intl` there was never a mark to be missing, so the complaint is about
 * consent that was not freely given.
 *
 * This is the only place that mapping lives. The badge asks; it does not know.
 */

import type { Flag, Reason, Regime } from '../core/types.js';
import type { MessageKey } from './index.js';

/**
 * Total on purpose: a reason added to the domain cannot slip through
 * untranslated. `null` marks the reasons that never reach the panel, because
 * they only ever accompany a `leave`.
 */
const REASON_KEY: Record<Reason, MessageKey | null> = {
  optional_mark: 'reason.optional_mark',
  no_mark: 'reason.no_mark',
  no_mark_proven_essential: null,
  substance_contradicts_label: 'reason.substance_contradicts_label',
  selectall_inconsistent: 'reason.selectall_inconsistent',
  quote_not_verbatim: 'reason.quote_not_verbatim',
  terms_unavailable: 'reason.terms_unavailable',
  substance_unclear: 'reason.substance_unclear',
  substance_unknown: 'reason.substance_unknown',
  quote_missing: 'reason.quote_missing',
  disabled: 'reason.disabled',
  required_and_service_essential: null,
  payment_no_auto_check: null,
  selectall_never_checked: null,
  selectall_consistent: null,
  quoted: null,
};

const FLAG_KEY: Record<Flag, MessageKey> = {
  missing_mark: 'flag.missing_mark',
  prechecked_optional: 'flag.prechecked_optional',
  label_substance_mismatch: 'flag.label_substance_mismatch',
  selectall_violation: 'flag.selectall_violation',
};

/** Only the entries that can actually fire under `intl` need an override. */
const INTL_REASON_KEY: Partial<Record<Reason, MessageKey>> = {
  no_mark: 'reason.intl.no_mark',
};

const INTL_FLAG_KEY: Partial<Record<Flag, MessageKey>> = {
  prechecked_optional: 'flag.intl.prechecked_optional',
  selectall_violation: 'flag.intl.selectall_violation',
};

const REGIME_KEY: Record<Regime, MessageKey> = {
  kr: 'badge.regime.kr',
  intl: 'badge.regime.intl',
};

/** `null` when this reason is never shown to the user. */
export function reasonKey(reason: Reason, regime: Regime): MessageKey | null {
  if (regime === 'intl') {
    const scoped = INTL_REASON_KEY[reason];
    if (scoped) return scoped;
  }
  return REASON_KEY[reason];
}

export function flagKey(flag: Flag, regime: Regime): MessageKey {
  return (regime === 'intl' ? INTL_FLAG_KEY[flag] : undefined) ?? FLAG_KEY[flag];
}

export function regimeKey(regime: Regime): MessageKey {
  return REGIME_KEY[regime];
}
