import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { ko } from '../src/i18n/messages.ko.js';
import { en } from '../src/i18n/messages.en.js';
import {
  createTranslator,
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  resolveLocale,
  type MessageKey,
} from '../src/i18n/index.js';
import { createBadge } from '../src/content/badge.js';
import type { Messages } from '../src/i18n/index.js';
import type { Locale } from '../src/core/types.js';
import type { BadgeState } from '../src/content/run.js';
import { shadowOf } from './helpers.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CATALOGUES: Record<Locale, Messages> = { ko, en };
const KEYS = Object.keys(ko) as MessageKey[];

// --- catalogue integrity ----------------------------------------------
test('every locale answers every key', () => {
  for (const locale of LOCALES) {
    const missing = KEYS.filter((k) => !CATALOGUES[locale][k]);
    assert.deepEqual(missing, [], `${locale} is missing ${missing.join(', ')}`);
  }
});

test('no message is blank or left as its own key', () => {
  for (const locale of LOCALES) {
    for (const k of KEYS) {
      const value = CATALOGUES[locale][k];
      assert.ok(value.trim().length > 0, `${locale}.${k} is blank`);
      assert.notEqual(value, k, `${locale}.${k} is still the key`);
    }
  }
});

/**
 * A translator who drops `{count}` produces a badge that says "optional items
 * can be turned off" with no number in it. The compiler cannot see that.
 */
test('placeholders survive translation', () => {
  const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
  for (const k of KEYS) {
    const expected = placeholders(ko[k]);
    for (const locale of LOCALES) {
      assert.deepEqual(placeholders(CATALOGUES[locale][k]), expected, `${locale}.${k}`);
    }
  }
});

/**
 * The marks `필수` and `선택` are quotations of what is printed on the page. An
 * English reader still has to find those characters on screen, so they must
 * survive translation.
 */
test('the printed legal terms are not translated away', () => {
  for (const k of ['reason.no_mark', 'flag.missing_mark'] as MessageKey[]) {
    assert.match(en[k], /필수/, `${k} must still quote 필수`);
  }
});

/**
 * Which law governs a consent item depends on what the item is: personal-data
 * consent falls under the Personal Information Protection Act, marketing
 * consent under the Network Act, and consent to terms of service under contract
 * law and no privacy statute at all. Three quarters of the golden set is not
 * personal-data consent, so a finding that cited article 22 was wrong far more
 * often than it was right.
 *
 * This extension reads a printed mark. It does not determine which statute
 * applies, so its findings say what was seen and stop there.
 */
test('a finding states what was observed and cites no statute', () => {
  const STATUTE =
    /개인정보보호법|정보통신망법|위치정보법|약관규제법|PIPA|GDPR|§|제\s?\d+\s?조|Art(?:icle)?\.?\s?\d/;
  const flagKeys = KEYS.filter((k) => k.startsWith('flag.'));
  assert.ok(flagKeys.length > 0);
  for (const k of flagKeys) {
    for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
      // KRDS is a published UI rule whose breach selectall.ts actually
      // computes, not a legal conclusion drawn from a label.
      const text = catalogue[k].replace(/KRDS/g, '');
      assert.doesNotMatch(text, STATUTE, `${locale}.${k} cites a statute it cannot know applies`);
    }
  }
});

/** § is how German and American statutes are cited, not Korean ones. */
test('no Korean message cites a statute the German way', () => {
  for (const k of KEYS) {
    assert.doesNotMatch(ko[k], /§/, `ko.${k} uses § where Korean writes 제N조`);
  }
});

// --- resolution --------------------------------------------------------
test('an explicit preference wins over the browser', () => {
  assert.equal(resolveLocale('en', 'ko-KR'), 'en');
  assert.equal(resolveLocale('ko', 'en-US'), 'ko');
});

test('auto follows the browser, region tags included', () => {
  assert.equal(resolveLocale('auto', 'en-GB'), 'en');
  assert.equal(resolveLocale('auto', 'ko-KR'), 'ko');
});

test('a language we do not ship falls back rather than rendering keys', () => {
  assert.equal(resolveLocale('auto', 'ja-JP'), DEFAULT_LOCALE);
  assert.equal(resolveLocale('auto', ''), DEFAULT_LOCALE);
  assert.equal(isLocale('ja'), false);
});

// --- interpolation -----------------------------------------------------
test('counts are substituted', () => {
  const t = createTranslator('en');
  assert.match(t('badge.headline.done', { count: 3 }), /\b3\b/);
});

test('a missing parameter leaves the placeholder rather than printing undefined', () => {
  const t = createTranslator('en');
  assert.doesNotMatch(t('badge.headline.done'), /undefined/);
});

// --- the badge actually speaks the chosen language ---------------------
const state = (over: Partial<BadgeState> = {}): BadgeState => ({
  moment: 'signup',
  regime: 'kr',
  degraded: true,
  changed: [
    { id: 'a', labelText: 'Marketing email', from: true, to: false, reason: 'optional_mark', flag: null },
  ],
  findings: [],
  pending: false,
  ...over,
});

test('the badge renders in the locale it was given', () => {
  for (const [locale, pattern] of [['ko', /껐습니다/], ['en', /Turned off/]] as const) {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    const badge = createBadge(doc, locale);
    badge.render(state());
    assert.match(shadowOf(doc).textContent ?? '', pattern, `${locale} badge`);
    badge.destroy();
  }
});

test('an unknown reason falls back to its own name instead of vanishing', () => {
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const badge = createBadge(doc, 'en');
  badge.render(state({ changed: [
    { id: 'a', labelText: 'x', from: true, to: false, reason: 'quoted', flag: null },
  ] }));
  assert.match(shadowOf(doc).textContent ?? '', /quoted/);
  badge.destroy();
});

// --- the copy really did leave the code -------------------------------
/**
 * The point of the extraction is that UI modules hold no copy. Korean in
 * labels.ts or context.ts is parsing data and must stay; Korean in the badge
 * or the options page means a string escaped the catalogue.
 */
test('no user-facing module contains hardcoded Korean copy', () => {
  const HANGUL = /[가-힣]/;
  for (const file of ['src/content/badge.ts', 'src/options/options.ts', 'src/options/options.html']) {
    const source = readFileSync(join(ROOT, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // The language picker lists endonyms on purpose: a Korean speaker has to
      // read their own language's name in their own language, whatever the
      // current UI language is.
      .replace(/<select id="locale">[\s\S]*?<\/select>/, ' ');
    assert.doesNotMatch(source, HANGUL, `${file} still carries copy that belongs in the catalogue`);
  }
});

test('the options markup declares a key for every visible string', () => {
  const html = readFileSync(join(ROOT, 'src/options/options.html'), 'utf8');
  const doc = new JSDOM(html).window.document;
  for (const node of doc.querySelectorAll('[data-i18n]')) {
    const key = node.getAttribute('data-i18n') as MessageKey;
    assert.ok(ko[key], `options.html references unknown message key ${key}`);
    assert.equal(node.textContent?.trim(), '', `${key} should be filled in at runtime, not in markup`);
  }
});

test('the manifest name and description come from _locales', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as {
    name: string;
    description: string;
    default_locale: string;
  };
  assert.equal(manifest.name, '__MSG_extName__');
  assert.equal(manifest.description, '__MSG_extDescription__');
  assert.ok(isLocale(manifest.default_locale), 'default_locale must be a locale we ship');

  for (const locale of LOCALES) {
    const messages = JSON.parse(
      readFileSync(join(ROOT, '_locales', locale, 'messages.json'), 'utf8')
    ) as Record<string, { message: string }>;
    for (const name of ['extName', 'extDescription']) {
      assert.ok(messages[name]?.message, `_locales/${locale} is missing ${name}`);
    }
  }
});

/**
 * The store listing is the first and often only description a user reads. It
 * described a Korean-only tool long after the extension had stopped being one,
 * because nothing tied it to the product's own copy.
 */
test('the store description matches what the extension actually does', () => {
  for (const locale of LOCALES) {
    const messages = JSON.parse(
      readFileSync(join(ROOT, '_locales', locale, 'messages.json'), 'utf8')
    ) as Record<string, { message: string }>;
    const description = messages['extDescription']?.message ?? '';

    // Chrome truncates past 132 characters in the Web Store listing.
    assert.ok(description.length > 0 && description.length <= 132, `${locale}: ${description.length} chars`);
    assert.doesNotMatch(
      description,
      /Korean|한국/,
      `${locale} still sells this as a Korean-only tool`
    );
    assert.match(
      description,
      /submit|제출/,
      `${locale} omits the promise that makes it trustworthy`
    );
  }
});
