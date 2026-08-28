#!/usr/bin/env node
/**
 * score.ts — run the shipped pipeline over the golden set and print metrics.
 *
 * Ground truth marks come from expected.json, never from the parser, so a
 * mis-parsed mark shows up as a failure instead of hiding one.
 *
 * `real` and `reconstructed` fixtures are scored as separate populations and
 * are never blended.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { findConsentMoments } from '../src/content/observe.js';
import { applyDecisions } from '../src/content/apply.js';
import { analyzeMoment } from '../src/core/pipeline.js';
import type { MomentAnalysis } from '../src/core/pipeline.js';
import type { ConsentItem, Flag, SubstanceMap } from '../src/core/types.js';
import type { GoldenExpected, GoldenItem } from '../test/helpers.js';

type Oracle = ((items: readonly ConsentItem[], expected: GoldenExpected) => SubstanceMap) | null;

interface MomentStats {
  findings: number;
  fixtures: number;
}

interface Stats {
  fixtures: number;
  momentsExpected: number;
  momentsFound: number;
  itemsExpected: number;
  itemsExtracted: number;
  itemsMissed: number;
  itemsSpurious: number;
  markCorrect: number;
  markScored: number;
  optional: number;
  wrongCheck: number;
  leftChecked: number;
  required: number;
  missedRequired: number;
  badgeOnly: number;
  findings: Partial<Record<Flag, number>>;
  byMoment: Record<string, MomentStats>;
}

const DIR = new URL('../goldenset/', import.meta.url);
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const read = (id: string, f: string): string => readFileSync(new URL(`${id}/${f}`, DIR), 'utf8');
const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);

interface Pair {
  item: ConsentItem;
  truth: GoldenItem | null;
}

function pairUp(
  items: readonly ConsentItem[],
  expected: readonly GoldenItem[]
): { pairs: Pair[]; missed: GoldenItem[] } {
  const pool = expected.map((e, i) => ({ e, i, used: false }));
  const pairs: Pair[] = [];
  for (const item of items) {
    const hit = pool.find((p) => !p.used && p.e.label === item.labelText);
    if (hit) {
      hit.used = true;
      pairs.push({ item, truth: hit.e });
    } else {
      pairs.push({ item, truth: null }); // extracted something not in ground truth
    }
  }
  const missed = pool.filter((p) => !p.used).map((p) => p.e);
  return { pairs, missed };
}

function blank(): Stats {
  return {
    fixtures: 0,
    momentsExpected: 0,
    momentsFound: 0,
    itemsExpected: 0,
    itemsExtracted: 0,
    itemsMissed: 0,
    itemsSpurious: 0,
    markCorrect: 0,
    markScored: 0,
    optional: 0,
    wrongCheck: 0,
    leftChecked: 0,
    required: 0,
    missedRequired: 0,
    badgeOnly: 0,
    findings: {},
    byMoment: {},
  };
}

function runFixture(id: string, expected: GoldenExpected, substances: Oracle) {
  const meta = JSON.parse(read(id, 'meta.json')) as { url?: string };
  const { window } = new JSDOM(read(id, 'page.html'), { url: meta.url || 'https://example.test/' });
  const doc = window.document;
  const moments = findConsentMoments(doc);
  const items = moments.flatMap((m) => m.items);
  const subs = substances ? substances(items, expected) : {};
  const analyses = moments.map((m) => analyzeMoment(doc, m, subs));
  for (const [i, m] of moments.entries()) {
    applyDecisions(doc, m.items, (analyses[i] as MomentAnalysis).decisions);
  }
  return { doc, moments, items, analyses };
}

const oracle = (items: readonly ConsentItem[], expected: GoldenExpected): SubstanceMap => {
  const out: SubstanceMap = {};
  const { pairs } = pairUp(items, expected.items);
  for (const { item, truth } of pairs) {
    if (truth) out[item.id] = { substance: truth.substance, quote: truth.quote };
  }
  return out;
};

function score(ids: readonly string[], substances: Oracle): Stats {
  const s = blank();
  for (const id of ids) {
    const expected = JSON.parse(read(id, 'expected.json')) as GoldenExpected;
    const { moments, items, analyses } = runFixture(id, expected, substances);

    s.fixtures += 1;
    s.momentsExpected += expected.expectedMoments;
    s.momentsFound += Math.min(moments.length, expected.expectedMoments);
    s.itemsExpected += expected.items.length;
    s.itemsExtracted += items.length;
    s.badgeOnly += analyses.filter((a) => !a.autoApply).length;

    const type = expected.moment;
    const bucket = s.byMoment[type] ?? { findings: 0, fixtures: 0 };
    s.byMoment[type] = bucket;
    bucket.fixtures += 1;
    for (const a of analyses) {
      for (const f of a.findings) {
        s.findings[f.flag] = (s.findings[f.flag] ?? 0) + 1;
        bucket.findings += 1;
      }
    }

    const decisions = new Map(analyses.flatMap((a) => a.decisions).map((d) => [d.id, d]));
    const { pairs, missed } = pairUp(items, expected.items);
    s.itemsMissed += missed.length;
    for (const { item, truth } of pairs) {
      if (!truth) {
        s.itemsSpurious += 1;
        continue;
      }
      s.markScored += 1;
      if (item.mark === truth.mark) s.markCorrect += 1;

      const el = item.element;
      const finalChecked = el && el.isConnected ? el.checked : item.checked;
      const action = decisions.get(item.id)?.action;

      if (truth.mark === 'required') {
        s.required += 1;
        if (!finalChecked) s.missedRequired += 1;
      } else {
        s.optional += 1;
        if (action === 'check') s.wrongCheck += 1;
        if (finalChecked) s.leftChecked += 1;
      }
    }
    // Items ground truth expects but extraction never found are silent misses.
    for (const truth of missed) {
      s.markScored += 1;
      if (truth.mark === 'required') {
        s.required += 1;
        s.missedRequired += 1;
      } else {
        s.optional += 1;
        s.leftChecked += 1; // we never touched it, so assume the site's state stands
      }
    }
  }
  return s;
}

function row(label: string, value: string | number, note = ''): string {
  return `  ${label.padEnd(26)} ${String(value).padStart(10)}  ${DIM}${note}${OFF}`;
}

function report(name: string, ids: readonly string[]): void {
  console.log(`\n${'═'.repeat(72)}\npopulation: ${name}  (${ids.length} fixture${ids.length === 1 ? '' : 's'})`);
  if (ids.length === 0) {
    console.log(`  ${DIM}none committed yet — see README "Growing the golden set"${OFF}`);
    return;
  }
  const modes: Array<[string, Oracle]> = [
    ['with substance oracle', oracle],
    ['deterministic only (no API key)', null],
  ];
  for (const [mode, substances] of modes) {
    const s = score(ids, substances);
    const wrong = pct(s.wrongCheck, s.optional);
    const bad = s.wrongCheck > 0;
    console.log(`\n ${mode}`);
    console.log(
      `  ${'wrong-check rate'.padEnd(26)} ${(bad ? RED : GREEN) + wrong.padStart(10) + OFF}  ` +
        `${DIM}${s.wrongCheck}/${s.optional} optional items checked by us — must be 0%${OFF}`
    );
    console.log(row('left-checked rate', pct(s.leftChecked, s.optional),
      `${s.leftChecked}/${s.optional} optional items still checked afterwards`));
    console.log(row('miss rate', pct(s.missedRequired, s.required),
      `${s.missedRequired}/${s.required} required items left unchecked (tolerable)`));
    console.log(row('detection rate', pct(s.momentsFound, s.momentsExpected),
      `${s.momentsFound}/${s.momentsExpected} consent moments`));
    console.log(row('item extraction', pct(s.itemsExtracted - s.itemsSpurious, s.itemsExpected),
      `${s.itemsMissed} missed, ${s.itemsSpurious} spurious`));
    console.log(row('mark accuracy', pct(s.markCorrect, s.markScored),
      `${s.markCorrect}/${s.markScored} required/optional/no-mark`));
    console.log(row('badge-only moments', s.badgeOnly, 'payment or uncertain flow (S3)'));
    const findings = (Object.entries(s.findings) as Array<[string, number]>).sort(
      (a, b) => b[1] - a[1]
    );
    console.log(
      `  ${'findings'.padEnd(26)} ${String(findings.reduce((n, f) => n + f[1], 0)).padStart(10)}`
    );
    for (const [flag, n] of findings) console.log(`    ${DIM}${flag.padEnd(24)} ${String(n).padStart(8)}${OFF}`);
    console.log(`  ${'findings by moment'.padEnd(26)}`);
    for (const [type, v] of Object.entries(s.byMoment).sort()) {
      console.log(`    ${DIM}${type.padEnd(24)} ${String(v.findings).padStart(8)}  (${v.fixtures} fixtures)${OFF}`);
    }
  }
}

const ids = readdirSync(DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const bySource: { real: string[]; reconstructed: string[] } = { real: [], reconstructed: [] };
for (const id of ids) {
  const meta = JSON.parse(read(id, 'meta.json')) as { source?: string };
  bySource[meta.source === 'real' ? 'real' : 'reconstructed'].push(id);
}

console.log('Agreedee — golden set score');
report('real (captured from live sites)', bySource.real);
report('reconstructed (hand-authored from documented patterns)', bySource.reconstructed);
console.log(`\n${DIM}Populations are never blended. wrong-check rate is the self-destruct switch.${OFF}\n`);

const overall = score(ids, oracle);
const degraded = score(ids, null);
if (overall.wrongCheck > 0 || degraded.wrongCheck > 0) {
  console.error(`${RED}wrong-check rate is not zero — tighten the rules toward unchecking.${OFF}`);
  process.exit(1);
}
