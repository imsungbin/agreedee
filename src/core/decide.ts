/**
 * decide.ts — the deterministic check/uncheck decision. No AI, no DOM.
 *
 * Claude supplies only `substance` + a `quote`; this module verifies the quote
 * is verbatim and then applies the safety contract:
 *
 *   S2  uncertainty resolves toward unchecked
 *   S3  a payment flow never adds consent
 *   S4  check only when the label is explicitly marked required AND the
 *       substance is service_essential with a verbatim quote
 *   S5  missing/failed/malformed substance data degrades to `unclear`,
 *       which leaves required items alone and unchecks everything else
 */

import { expectedSelectAllState, verifySelectAll } from './selectall.js';
import type {
  Action,
  DecidableItem,
  Decision,
  Flag,
  MomentKind,
  Reason,
  Regime,
  Substance,
  SubstanceMap,
  SubstanceReport,
} from './types.js';

const SUBSTANCES: readonly Substance[] = [
  'service_essential',
  'marketing',
  'third_party_sharing',
  'unclear',
];
const NON_ESSENTIAL: readonly Substance[] = ['marketing', 'third_party_sharing'];

/** Contexts where Agreedee must not add consent (S3). */
const NO_CHECK_CONTEXTS: readonly MomentKind[] = ['payment'];

const squash = (s: unknown): string =>
  typeof s === 'string' ? s.normalize('NFC').replace(/\s+/g, ' ').trim() : '';

const isSubstance = (v: unknown): v is Substance =>
  typeof v === 'string' && (SUBSTANCES as readonly string[]).includes(v);

function decision(id: string, action: Action, reason: Reason, flag: Flag | null = null): Decision {
  return { id, action, reason, flag };
}

/**
 * Reduce Claude's answer to a substance we are willing to act on.
 * Anything unverifiable becomes 'unclear'.
 */
function verifiedSubstance(
  item: DecidableItem,
  raw: SubstanceReport | undefined
): { substance: Substance; reason: Reason } {
  if (item.termsSource === 'unavailable' || !squash(item.termsText)) {
    return { substance: 'unclear', reason: 'terms_unavailable' };
  }
  if (!raw || typeof raw !== 'object' || !isSubstance(raw.substance)) {
    return { substance: 'unclear', reason: 'substance_unknown' };
  }
  if (raw.substance === 'unclear') return { substance: 'unclear', reason: 'substance_unclear' };
  const quote = squash(raw.quote);
  if (!quote) return { substance: 'unclear', reason: 'quote_missing' };
  if (!squash(item.termsText).includes(quote)) {
    return { substance: 'unclear', reason: 'quote_not_verbatim' };
  }
  return { substance: raw.substance, reason: 'quoted' };
}

/**
 * Whether every item's substance survived verbatim-quote verification.
 *
 * Under `kr` this is a nice-to-have: the printed mark is the authority. Under
 * `intl` it is the only evidence there is, and acting without it would strip a
 * mandatory terms box on the strength of no information at all. A key that
 * answered for some items and not others is not enough — terms text sitting
 * behind a cross-origin link fails to prefetch often, and that failure looks
 * exactly like "not required".
 */
export function substanceVerified(
  items: readonly DecidableItem[],
  substances: SubstanceMap
): boolean {
  const individuals = items.filter((i) => !i.isSelectAll);
  if (individuals.length === 0) return false;
  return individuals.every(
    (item) => verifiedSubstance(item, substances[item.id]).reason === 'quoted'
  );
}

/** The finding for an individual item, independent of the action taken. */
function itemFlag(item: DecidableItem, substance: Substance, regime: Regime): Flag | null {
  if (regime === 'intl') {
    // No jurisdiction outside Korea requires a required/optional mark to be
    // printed, so its absence is not a finding here. A box that was already
    // ticked when the user arrived still is: pre-ticked consent is not
    // consent (CJEU C-673/17).
    if (item.checked === true && substance !== 'service_essential') {
      return 'prechecked_optional';
    }
    return null;
  }
  if (item.mark === 'absent') return 'missing_mark';
  if (item.mark === 'required' && NON_ESSENTIAL.includes(substance)) {
    return 'label_substance_mismatch';
  }
  if (item.mark === 'optional' && item.checked === true) return 'prechecked_optional';
  return null;
}

function decideItem(
  item: DecidableItem,
  raw: SubstanceReport | undefined,
  context: MomentKind,
  regime: Regime
): Decision {
  const { substance, reason } = verifiedSubstance(item, raw);
  const flag = itemFlag(item, substance, regime);

  if (item.disabled === true) return decision(item.id, 'leave', 'disabled', flag);

  if (item.mark === 'required') {
    if (substance === 'service_essential') {
      // S3: in checkout we report but never add consent.
      if (NO_CHECK_CONTEXTS.includes(context)) {
        return decision(item.id, 'leave', 'payment_no_auto_check', flag);
      }
      return decision(item.id, 'check', 'required_and_service_essential', flag);
    }
    if (NON_ESSENTIAL.includes(substance)) {
      return decision(item.id, 'uncheck', 'substance_contradicts_label', flag);
    }
    // S5: degraded / unclear. Do not add consent, do not strip a lawfully
    // required box.
    return decision(item.id, 'leave', reason, flag);
  }

  if (item.mark === 'optional') return decision(item.id, 'uncheck', 'optional_mark', flag);

  // No printed mark. Under `kr` that is itself the violation and the box comes
  // off. Under `intl` there was never a mark to read, so a substance that
  // survived verbatim-quote verification is the only evidence available — and
  // it is what keeps a mandatory terms-of-service box from being stripped.
  // S2 is intact: only proven-essential is spared, never merely unclear.
  if (regime === 'intl' && substance === 'service_essential') {
    return decision(item.id, 'leave', 'no_mark_proven_essential', flag);
  }
  return decision(item.id, 'uncheck', 'no_mark', flag);
}

/** State an item will be in once its decision is applied. */
function finalState(item: DecidableItem, d: Decision): boolean {
  if (d.action === 'check') return true;
  if (d.action === 'uncheck') return false;
  return item.checked === true;
}

/**
 * @param items items with `mark` and `isSelectAll` already resolved
 * @param substances may be empty or partial
 * @param context signup|payment|entry|reconsent|link|verify|other
 * @param regime which law to judge under; defaults to Korean
 */
export function decide(
  items: readonly DecidableItem[],
  substances: SubstanceMap,
  context: MomentKind = 'other',
  regime: Regime = 'kr'
): Decision[] {
  const list = Array.isArray(items) ? items : [];
  const bag: SubstanceMap = substances && typeof substances === 'object' ? substances : {};

  const individuals = list.filter((i) => !i.isSelectAll);
  const decided = new Map<string, Decision>();
  for (const it of individuals) decided.set(it.id, decideItem(it, bag[it.id], context, regime));

  const finals = individuals.map((it) => finalState(it, decided.get(it.id) as Decision));
  const currents = individuals.map((it) => it.checked === true);

  return list.map((it): Decision => {
    if (!it.isSelectAll) return decided.get(it.id) as Decision;
    // A select-all with nothing to aggregate is judged like an ordinary item,
    // except that a bulk control is never checked on our initiative.
    if (individuals.length === 0) {
      const lone = decideItem(it, bag[it.id], context, regime);
      return lone.action === 'check'
        ? decision(it.id, 'leave', 'selectall_never_checked', lone.flag)
        : lone;
    }

    const { violated } = verifySelectAll(it.checked === true, currents);
    const flag: Flag | null = violated ? 'selectall_violation' : null;
    const allowed = expectedSelectAllState(finals);
    if (it.disabled === true) return decision(it.id, 'leave', 'disabled', flag);
    // Never check a select-all: it is a bulk control over consent we did not grant.
    if (it.checked === true && !allowed) {
      return decision(it.id, 'uncheck', 'selectall_inconsistent', flag);
    }
    return decision(it.id, 'leave', 'selectall_consistent', flag);
  });
}
