/**
 * run.js — one consent moment, end to end.
 *
 * Order: read the page → fetch terms → ask Claude (optional) → decide → act.
 * Every step that can fail degrades to "no substance data", which the
 * deterministic core already handles safely (S5).
 */

import { classifyContext, canAutoApply } from '../core/context.js';
import { contextSignals } from '../core/pipeline.js';
import { decide, substanceVerified } from '../core/decide.js';
import { applyDecisions } from './apply.js';
import { prefetchTerms } from './terms.js';
import { payloadFor, toSubstanceMap, withTimeout } from './substances.js';
import type { JudgePayload } from '../bg/providers/types.js';
import type { ApplyReport } from './apply.js';
import type { BadgeHandle, BadgeState } from './badge.js';
import type {
  ConsentItem,
  ConsentMoment,
  Decision,
  Finding,
  MomentKind,
  PageContext,
  Regime,
  SubstanceMap,
} from '../core/types.js';

export type { BadgeHandle, BadgeState } from './badge.js';

export interface RunOptions {
  requestSubstances?: ((payload: JudgePayload) => Promise<unknown>) | null;
  badge?: BadgeHandle | undefined;
  fetchImpl?: typeof fetch | null;
  cache?: Map<string, string | null>;
  timeoutMs?: number;
  /** A user's per-domain correction of the detected regime. */
  regime?: Regime | undefined;
  /** Called when the user switches regime from the badge. */
  onRegimeChange?: ((regime: Regime) => void) | undefined;
}

export interface RunResult {
  context: PageContext;
  decisions: Decision[];
  findings: Finding[];
  degraded: boolean;
  applied: boolean;
  report?: ApplyReport;
}

/**
 * A backstop, not the real deadline. The background owns that, and it differs
 * per provider — a local model being paged into memory is far slower than a
 * network round trip. Second-guessing it here would throw away answers that
 * were on their way, so this only guards against a reply that never comes at
 * all. sendMessage already rejects immediately when nothing is listening.
 */
const RESPONSE_BACKSTOP_MS = 35000;

/** Later rounds win, but a box the fast pass already turned off stays listed. */
function merge(
  carried: BadgeState['changed'],
  latest: BadgeState['changed']
): BadgeState['changed'] {
  const byId = new Map(carried.map((c) => [c.id, c]));
  for (const change of latest) byId.set(change.id, change);
  return [...byId.values()];
}

/** What the user would see change, without changing it. */
function preview(items: readonly ConsentItem[], decisions: readonly Decision[]): BadgeState['changed'] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return decisions
    .filter((d) => d.action !== 'leave')
    .map((d) => ({ d, item: byId.get(d.id) }))
    .filter(
      (pair): pair is { d: Decision; item: ConsentItem } =>
        Boolean(pair.item) &&
        !pair.item!.disabled &&
        pair.item!.checked !== (pair.d.action === 'check')
    )
    .map(({ d, item }) => ({
      id: d.id,
      labelText: item.labelText,
      from: item.checked,
      to: d.action === 'check',
      reason: d.reason,
      flag: d.flag,
    }));
}

export async function runMoment(
  doc: Document,
  moment: ConsentMoment,
  options: RunOptions = {}
): Promise<RunResult> {
  const {
    requestSubstances = null,
    badge,
    fetchImpl = typeof fetch === 'function' ? fetch : null,
    cache = new Map(),
    timeoutMs = RESPONSE_BACKSTOP_MS,
    regime,
    onRegimeChange,
  } = options;

  const items = moment.items;
  const context = classifyContext(contextSignals(doc, moment, regime));
  const byId = new Map(items.map((i) => [i.id, i]));

  /** One decision round, applied or previewed, and drawn. */
  const settle = (substances: SubstanceMap | null, carried: BadgeState['changed']): RunResult => {
    const decisions = decide(items, substances ?? {}, context.moment, context.regime);
    const findings: Finding[] = decisions
      .filter((d): d is Decision & { flag: NonNullable<Decision['flag']> } => d.flag !== null)
      .map((d) => ({
        id: d.id,
        labelText: byId.get(d.id)?.labelText ?? '',
        flag: d.flag,
        reason: d.reason,
      }));

    const degraded = substances === null;
    const auto = canAutoApply(context, {
      substanceVerified: substanceVerified(items, substances ?? {}),
    });
    const common = {
      moment: context.moment,
      regime: context.regime,
      degraded,
      findings,
      onRegimeChange,
    };

    if (auto) {
      const report = applyDecisions(doc, items, decisions);
      const changed = merge(carried, report.changed);
      if (badge) badge.render({ ...common, changed, pending: false });
      return { context, decisions, findings, degraded, applied: true, report };
    }

    // S3, or `intl` with nothing verified: report only, the user clicks.
    if (badge) {
      badge.render({
        ...common,
        changed: merge(carried, preview(items, decisions)),
        pending: true,
        onApply: () => {
          const report = applyDecisions(doc, items, decisions);
          badge.render({ ...common, changed: merge(carried, report.changed), pending: false });
        },
      });
    }
    return { context, decisions, findings, degraded, applied: false };
  };

  /**
   * Pass one: no substance data at all, decided and applied before anything is
   * awaited. This is exactly the degraded path S5 already guarantees — every
   * box not deterministically required comes off — so the user is never left
   * in a less safe state while the model is still thinking.
   */
  const fast = settle(null, []);
  if (typeof requestSubstances !== 'function') return fast;

  if (fetchImpl) {
    try {
      await prefetchTerms(items, { fetchImpl, cache });
    } catch {
      /* terms stay unavailable, which means unchecked */
    }
  }

  let substances: SubstanceMap | null = null;
  try {
    substances = toSubstanceMap(
      await withTimeout(requestSubstances(payloadFor(items, context.moment)), timeoutMs)
    );
  } catch {
    substances = null;
  }
  if (substances === null) return fast;

  /**
   * Pass two refines. It can restore a box the fast pass took off — but only
   * one the model proved essential with a verbatim quote — or take off a box
   * marked required whose substance contradicts its label. Both directions are
   * re-verified;
   * neither is trusted because the model said so.
   */
  return settle(substances, fast.report?.changed ?? []);
}
