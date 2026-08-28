#!/usr/bin/env node
/**
 * anonymize.js — turn a saved consent page into a committable fixture.
 *
 *   node tools/anonymize.ts saved.html goldenset/<id> [--replace "AcmeShop=Service"]
 *
 * Strips everything that is not consent markup and redacts anything that
 * looks like a person. Fixtures get committed; PII must not.
 * The resulting expected.json is a skeleton — ground truth is read off the
 * page by a human, which is mechanical: the required/optional mark is printed
 * on it.
 */

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REDACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b01[016-9][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '010-0000-0000'],
  [/\b\d{2,3}[-.\s]\d{3,4}[-.\s]\d{4}\b/g, '00-000-0000'],
  [/\b\d{6}[-]\d{7}\b/g, '000000-0000000'],
  [/\b(?:\d[ -]?){13,19}\b/g, '0000-0000-0000-0000'],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, 'user@example.test'],
  [/\b[A-Z0-9]{10,}\b/g, 'XXXXXXXXXX'],
  [/\b\d{8,}\b/g, '00000000'],
];

const STRIP_TAGS = ['script', 'style', 'noscript', 'iframe', 'svg', 'template'];

export type Replacement = readonly [from: string, to: string];

export interface AnonymizeOptions {
  replace?: ReadonlyArray<Replacement>;
}

export function anonymize(html: string, { replace = [] }: AnonymizeOptions = {}): string {
  let out = html;
  for (const tag of STRIP_TAGS) {
    out = out.replace(new RegExp(`<${tag}[\\s\\S]*?</${tag}>`, 'gi'), '');
  }
  out = out
    .replace(/<(img|link|source|track|base)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:src|srcset|data-[\w-]*|integrity|nonce)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, 'https://example.test/page')
    .replace(/<!--[\s\S]*?-->/g, '');

  for (const [from, to] of replace) out = out.split(from).join(to);
  for (const [pattern, value] of REDACTIONS) out = out.replace(pattern, value);
  return out.replace(/\n{3,}/g, '\n\n');
}

function main() {
  const [input, outDir, ...rest] = process.argv.slice(2);
  if (!input || !outDir) {
    console.error('usage: node tools/anonymize.js <saved.html> <goldenset/id> [--replace "from=to"]...');
    process.exit(2);
  }
  const replace: Array<[string, string]> = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--replace' && rest[i + 1]) {
      const [from, to] = (rest[++i] as string).split('=');
      replace.push([from ?? '', to ?? '']);
    }
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'page.html'), anonymize(readFileSync(input, 'utf8'), { replace }));
  writeFileSync(
    join(outDir, 'meta.json'),
    `${JSON.stringify({ moment: 'signup', source: 'real', anonymized: true, url: 'https://example.test/', shape: 'DESCRIBE THE MARKUP SHAPE' }, null, 2)}\n`
  );
  writeFileSync(
    join(outDir, 'expected.json'),
    `${JSON.stringify({ moment: 'signup', expectedMoments: 1, items: [{ label: '', mark: 'required|optional|absent', isSelectAll: false, substance: 'service_essential|marketing|third_party_sharing|unclear', quote: null, action: 'check|uncheck|leave', flag: null }] }, null, 2)}\n`
  );
  console.log(`wrote ${outDir}/page.html — now read the required/optional marks off it and fill in expected.json`);
  console.log('then re-read page.html yourself before committing: this tool is a helper, not a guarantee.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
