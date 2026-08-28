import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { classifyContext, canAutoApply, detectRegime } from '../src/core/context.js';
import { decide, substanceVerified } from '../src/core/decide.js';
import { contextSignals } from '../src/core/pipeline.js';
import { createBadge } from '../src/content/badge.js';
import { isConsentCheckbox } from '../src/content/extract.js';
import type { DecidableItem, PageContext, Regime } from '../src/core/types.js';
import type { BadgeState } from '../src/content/run.js';
import { one, shadowOf, q } from './helpers.js';

const KOREAN = '이용약관 동의 개인정보 수집 및 이용에 동의합니다 마케팅 정보 수신';
const ENGLISH = 'I agree to the Terms of Service and the Privacy Policy. Send me product news.';

// --- detection ---------------------------------------------------------
test('a declared Korean lang settles it', () => {
  assert.equal(detectRegime({ lang: 'ko', text: ENGLISH }), 'kr');
  assert.equal(detectRegime({ lang: 'ko-KR', text: ENGLISH }), 'kr');
});

test('a .kr host settles it', () => {
  assert.equal(detectRegime({ url: 'https://shop.example.co.kr/join', text: ENGLISH }), 'kr');
});

test('Korean body text outvotes a lang the site got wrong', () => {
  assert.equal(detectRegime({ lang: 'en', text: KOREAN }), 'kr');
});

test('an English page on a generic domain is intl', () => {
  assert.equal(detectRegime({ lang: 'en', url: 'https://app.example.com/signup', text: ENGLISH }), 'intl');
});

test('a user override outranks every detected signal', () => {
  assert.equal(detectRegime({ lang: 'ko', text: KOREAN, regime: 'intl' }), 'intl');
  assert.equal(detectRegime({ lang: 'en', text: ENGLISH, regime: 'kr' }), 'kr');
});

/**
 * The tempting rule — "no printed mark means this is not a Korean page" —
 * would destroy the product's main finding, because missing_mark IS the
 * accusation that a Korean site omitted its §22 marking.
 */
test('an unmarked Korean page stays kr, so missing_mark can still fire', () => {
  const doc = new JSDOM(
    `<!doctype html><html lang="ko"><body><form>
       <label><input type="checkbox" checked> 개인정보 수집 및 이용 동의</label>
     </form></body></html>`,
    { url: 'https://example.com/join' }
  ).window.document;
  const context = classifyContext({
    url: doc.location.href,
    lang: doc.documentElement.getAttribute('lang') ?? '',
    text: doc.body.textContent ?? '',
  });
  assert.equal(context.regime, 'kr');
});

// --- decisions ---------------------------------------------------------
const item = (over: Partial<DecidableItem> = {}): DecidableItem => ({
  id: 'tos',
  labelText: 'I agree to the Terms of Service',
  mark: 'absent',
  isSelectAll: false,
  checked: false,
  disabled: false,
  termsText: 'You must accept these terms to create an account.',
  termsSource: 'inline',
  ...over,
});

const PROVEN = {
  substance: 'service_essential',
  quote: 'You must accept these terms to create an account.',
} as const;

/**
 * The regression this whole axis exists to prevent: under the Korean rules an
 * unmarked box comes off, which abroad means a mandatory terms box comes off
 * and the user cannot sign up.
 */
test('intl: an unmarked box proven essential is left alone', () => {
  const [d] = decide([item()], { tos: PROVEN }, 'signup', 'intl');
  assert.equal(d?.action, 'leave');
  assert.equal(d?.reason, 'no_mark_proven_essential');
});

test('kr: the same box still comes off, because the missing mark is the violation', () => {
  const [d] = decide([item()], { tos: PROVEN }, 'signup', 'kr');
  assert.equal(d?.action, 'uncheck');
  assert.equal(d?.flag, 'missing_mark');
});

test('intl: S2 holds — only proven essential is spared, never merely unclear', () => {
  for (const substances of [
    {},
    { tos: { substance: 'unclear', quote: null } },
    { tos: { substance: 'marketing', quote: 'We will email you offers.' } },
    { tos: { substance: 'service_essential', quote: 'a sentence that is not in the terms' } },
  ] as const) {
    const [d] = decide([item()], substances, 'signup', 'intl');
    assert.equal(d?.action, 'uncheck', `${JSON.stringify(substances)} must not be spared`);
  }
});

test('intl: no printed mark is not itself a finding', () => {
  const [d] = decide([item()], { tos: PROVEN }, 'signup', 'intl');
  assert.equal(d?.flag, null);
});

test('intl: a box already ticked on arrival is a finding', () => {
  const decisions = decide(
    [item({ id: 'news', labelText: 'Send me product news', checked: true,
            termsText: 'We will email you offers.' })],
    { news: { substance: 'marketing', quote: 'We will email you offers.' } },
    'signup',
    'intl'
  );
  assert.equal(one(decisions, 'news').flag, 'prechecked_optional');
});

test('the default regime is kr, so existing behaviour is untouched', () => {
  assert.deepEqual(decide([item()], { tos: PROVEN }, 'signup'),
                   decide([item()], { tos: PROVEN }, 'signup', 'kr'));
});

// --- the auto-apply gate ----------------------------------------------
const ctx = (regime: Regime): PageContext =>
  ({ moment: 'signup', regime, certain: true }) as PageContext;

test('intl without verified substance reports instead of acting', () => {
  assert.equal(canAutoApply(ctx('intl'), { substanceVerified: false }), false);
  assert.equal(canAutoApply(ctx('intl'), { substanceVerified: true }), true);
});

test('kr is unaffected, because the mark is printed on the page', () => {
  assert.equal(canAutoApply(ctx('kr'), { substanceVerified: false }), true);
});

/**
 * The partial-answer case: a key is configured and Claude replies, but one
 * item's terms sat behind a cross-origin link and never loaded. That looks
 * exactly like "not required", so abroad it must not be acted on.
 */
test('intl: one unverifiable item is enough to withhold auto-apply', () => {
  const items = [
    item({ id: 'tos' }),
    item({ id: 'news', labelText: 'Send me offers', termsSource: 'unavailable', termsText: null }),
  ];
  assert.equal(substanceVerified(items, { tos: PROVEN }), false);
  assert.equal(
    substanceVerified(items, {
      tos: PROVEN,
      news: { substance: 'marketing', quote: 'We will email you offers.' },
    }),
    false,
    'a quote cannot be verified against terms we never read'
  );
});

// --- wording -----------------------------------------------------------
const state = (over: Partial<BadgeState> = {}): BadgeState => ({
  moment: 'signup',
  regime: 'kr',
  degraded: false,
  changed: [{ id: 'a', labelText: 'Send me offers', from: true, to: false,
              reason: 'no_mark', flag: null }],
  findings: [],
  pending: false,
  ...over,
});

test('the badge does not accuse a foreign site of breaking §22', () => {
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const badge = createBadge(doc, 'en');
  badge.render(state({ regime: 'intl' }));
  const text = shadowOf(doc).textContent ?? '';
  assert.match(text, /not proven to be required/);
  assert.doesNotMatch(text, /필수/, 'a foreign page has no printed mark to be missing');
  badge.destroy();
});

test('a Korean page is told the mark is missing, not which law says so', () => {
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const badge = createBadge(doc, 'en');
  badge.render(state({ findings: [{ id: 'a', labelText: 'x', flag: 'missing_mark', reason: 'no_mark' }] }));
  const text = shadowOf(doc).textContent ?? '';
  assert.match(text, /no 필수\/선택 mark/);
  badge.destroy();
});

test('the user can switch regime from the badge when detection is wrong', () => {
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const chosen: Regime[] = [];
  const badge = createBadge(doc, 'en');
  badge.render(state({ onRegimeChange: (r) => chosen.push(r) }));
  const swap = q<HTMLButtonElement>(shadowOf(doc), '[data-regime]');
  assert.equal(swap.getAttribute('data-regime'), 'intl');
  swap.dispatchEvent(new (doc.defaultView as Window & typeof globalThis).Event('click'));
  assert.deepEqual(chosen, ['intl']);
  badge.destroy();
});

test('no switch is offered when the caller cannot act on it', () => {
  const doc = new JSDOM('<!doctype html><body></body>').window.document;
  const badge = createBadge(doc, 'en');
  badge.render(state());
  assert.equal(shadowOf(doc).querySelector('[data-regime]'), null);
  badge.destroy();
});

// --- what counts as a consent checkbox in English ----------------------
test('English consent checkboxes are recognised', () => {
  for (const label of [
    'I agree to the Terms of Service',
    'I accept the Privacy Policy',
    'Send me marketing emails',
    'Subscribe to our newsletter',
    'Share my personal data with third parties',
    'I consent to the processing of my data',
  ]) {
    assert.equal(isConsentCheckbox(label), true, label);
  }
});

/**
 * The gate decides what Agreedee is allowed to write to. Anything that is not
 * consent must stay outside it, or a login form starts losing its state.
 */
test('ordinary form controls are not mistaken for consent', () => {
  for (const label of [
    'Remember me',
    'Keep me signed in',
    'Show password',
    "I'm not a robot",
    'Save this card for next time',
    'Ship to a different address',
  ]) {
    assert.equal(isConsentCheckbox(label), false, label);
  }
});

// --- pages with nothing on them ----------------------------------------
/**
 * The bug this pins: a page with no consent moment never asked what it was,
 * so it reported the default. Every quiet English page — a search result, a
 * repository listing — came back as judged under Korean law, and the menu
 * said so with a tick.
 */
test('a page with no consent items is still read for what it is', () => {
  const english = new JSDOM(
    `<!doctype html><html lang="en"><body><h1>Commits</h1><p>${ENGLISH}</p></body></html>`,
    { url: 'https://github.com/example/repo/commits/main' }
  ).window.document;
  assert.equal(detectRegime(contextSignals(english, null)), 'intl');

  const korean = new JSDOM(
    `<!doctype html><html lang="ko"><body><h1>공지</h1><p>${KOREAN}</p></body></html>`,
    { url: 'https://example.com/notice' }
  ).window.document;
  assert.equal(detectRegime(contextSignals(korean, null)), 'kr');
});

test('a stored override still wins on a page with nothing on it', () => {
  const doc = new JSDOM(`<!doctype html><html lang="en"><body>${ENGLISH}</body></html>`, {
    url: 'https://github.com/example/repo',
  }).window.document;
  assert.equal(detectRegime(contextSignals(doc, null, 'kr')), 'kr');
});
