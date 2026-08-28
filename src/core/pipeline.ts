/**
 * pipeline.js — composes the deterministic modules into one analysis.
 * No DOM writes, no network. Runs identically in the browser and in Node,
 * which is what makes the golden set a real test of the shipped code.
 */

import { classifyContext, canAutoApply } from './context.js';
import { decide, substanceVerified } from './decide.js';
import type {
  ConsentItem,
  ConsentMoment,
  ContextSignals,
  Decision,
  Finding,
  PageContext,
  Regime,
  SubstanceMap,
} from './types.js';

export interface MomentAnalysis {
  context: PageContext;
  autoApply: boolean;
  items: readonly ConsentItem[];
  decisions: Decision[];
  findings: Finding[];
}

const MAX_SIGNAL_TEXT = 20000;

export function contextSignals(
  doc: Document,
  moment: ConsentMoment | null,
  override?: Regime | undefined
): ContextSignals {
  const body = doc.body ? doc.body.textContent : '';
  return {
    url: (doc.location && doc.location.href) || '',
    title: doc.title || '',
    lang: doc.documentElement?.getAttribute('lang') ?? '',
    regime: override,
    text: [moment && moment.container ? moment.container.textContent : '', body]
      .join(' ')
      .slice(0, MAX_SIGNAL_TEXT),
  };
}

/** `substances` empty means degraded mode (S5). */
export function analyzeMoment(
  doc: Document,
  moment: ConsentMoment,
  substances: SubstanceMap = {},
  regimeOverride?: Regime | undefined
): MomentAnalysis {
  const context = classifyContext(contextSignals(doc, moment, regimeOverride));
  const decisions = decide(moment.items, substances, context.moment, context.regime);
  const byId = new Map(moment.items.map((i) => [i.id, i]));
  const findings: Finding[] = decisions
    .filter((d): d is Decision & { flag: NonNullable<Decision['flag']> } => d.flag !== null)
    .map((d) => ({
      id: d.id,
      labelText: byId.get(d.id)?.labelText ?? '',
      flag: d.flag,
      reason: d.reason,
    }));
  return {
    context,
    autoApply: canAutoApply(context, {
      substanceVerified: substanceVerified(moment.items, substances),
    }),
    items: moment.items,
    decisions,
    findings,
  };
}
