/**
 * context.js — classify the consent moment. Pure text/URL matching, no AI.
 *
 * The classification exists for one reason: S3. In a checkout flow the benign
 * failure (a form that will not submit) is no longer cheap, so Agreedee must
 * report and wait for a click instead of acting. When classification is
 * uncertain we behave as if it were payment.
 */

import type { ContextSignals, MomentKind, MomentScores, PageContext, Regime } from './types.js';

interface MomentRule {
  moment: Exclude<MomentKind, 'other'>;
  url: RegExp;
  words: readonly string[];
}

const MOMENTS: readonly MomentRule[] = [
  {
    moment: 'payment',
    url: /\/(order|payment|pay|checkout|cart|billing)(\/|\?|$)/i,
    words: [
      '결제하기', '결제 수단', '결제수단', '최종 결제', '결제 금액', '주문서', '주문하기',
      '무통장', '카드결제', '간편결제', '배송지', '결제 정보', '청구', 'checkout',
    ],
  },
  {
    moment: 'verify',
    url: /\/(auth|identity|nice|ipin|certification)(\/|\?|$)/i,
    words: ['본인인증', '본인확인', '휴대폰 인증', '휴대폰본인', '통신사', '아이핀', '실명확인', '인증번호'],
  },
  {
    moment: 'link',
    url: /\/(oauth|connect|link|sns)(\/|\?|$)/i,
    words: ['간편로그인', '소셜 로그인', '계정 연동', '연동하기', '연결하기', '통합계정', '계정 연결'],
  },
  {
    moment: 'reconsent',
    url: /\/(reconsent|terms-update|agreement)(\/|\?|$)/i,
    words: ['재동의', '개정 안내', '약관 개정', '변경된 약관', '동의하고 계속', '동의 갱신', '개정된 개인정보'],
  },
  {
    moment: 'entry',
    url: /\/(event|promotion|coupon|apply)(\/|\?|$)/i,
    words: ['이벤트', '응모', '경품', '추첨', '쿠폰', '참여하기', '당첨'],
  },
  {
    moment: 'signup',
    url: /\/(join|signup|sign-up|register|membership|member)(\/|\?|$)/i,
    words: ['회원가입', '가입하기', '아이디', '비밀번호 확인', '회원 정보', '가입 완료', '신규 가입'],
  },
];

const URL_WEIGHT = 2;
const CERTAIN_AT = 2;

const HANGUL = /[가-힣]/g;

/**
 * Deliberately low. A Korean consent form is overwhelmingly Hangul, so this
 * only has to clear noise — and the two misdetections are not symmetric.
 *
 * An English page read as `kr` shows marking findings that do not apply: wrong,
 * but visible and harmless, since an English page cannot auto-apply anyway.
 * A Korean page read as `intl` silently stops reporting `missing_mark`, which
 * is the finding this extension exists to report. So the bias runs
 * toward `kr`.
 */
const MIN_HANGUL_RATIO = 0.02;

function hangulRatio(text: string): number {
  if (!text) return 0;
  const hits = text.match(HANGUL);
  return hits ? hits.length / text.length : 0;
}

function isKoreanHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith('.kr');
  } catch {
    return false;
  }
}

/**
 * Which body of law this page is judged under.
 *
 * Note what is NOT consulted: whether a required/optional mark was found. That absence
 * is the finding — a Korean form that left an item unmarked. Routing unmarked
 * pages to `intl` would mean the flag could never fire again.
 */
export function detectRegime(signals: ContextSignals = {}): Regime {
  if (signals.regime) return signals.regime; // a user override outranks everything
  if ((signals.lang ?? '').toLowerCase().startsWith('ko')) return 'kr';
  if (isKoreanHost(signals.url ?? '')) return 'kr';
  // A Korean page that declares lang="en" is common enough that the text
  // still gets a vote after the declaration has had its say.
  if (hangulRatio(signals.text ?? '') >= MIN_HANGUL_RATIO) return 'kr';
  return 'intl';
}

function score(moment: MomentRule, haystack: string, url: string): number {
  let n = 0;
  if (url && moment.url.test(url)) n += URL_WEIGHT;
  for (const w of moment.words) if (haystack.includes(w)) n += 1;
  return n;
}

export function classifyContext(signals: ContextSignals = {}): PageContext {
  const url = typeof signals.url === 'string' ? signals.url : '';
  const haystack = [signals.title, signals.text]
    .filter((s) => typeof s === 'string')
    .join(' ')
    .normalize('NFC');

  const regime = detectRegime(signals);
  const scores = {} as MomentScores;
  for (const m of MOMENTS) scores[m.moment] = score(m, haystack, url);

  // S3: any real evidence of checkout wins outright.
  if (scores.payment >= CERTAIN_AT) return { moment: 'payment', regime, certain: true, scores };

  let best: MomentRule['moment'] | null = null;
  for (const m of MOMENTS) {
    if (best === null || scores[m.moment] > scores[best]) best = m.moment;
  }
  if (!best || scores[best] === 0) return { moment: 'other', regime, certain: false, scores };
  if (scores.payment > 0 && scores.payment >= scores[best]) {
    return { moment: 'payment', regime, certain: false, scores };
  }
  return { moment: best, regime, certain: scores[best] >= CERTAIN_AT, scores };
}

export interface AutoApplyOptions {
  /**
   * Whether every item's substance survived verification. Ignored under `kr`,
   * where the printed mark is the authority; required under `intl`, where it
   * is the only signal there is.
   */
  substanceVerified?: boolean | undefined;
}

/**
 * S3 gate: may Agreedee change checkbox state without the user clicking?
 * Payment → no. Unknown or uncertain flow → treated as payment → no.
 *
 * And under `intl`, unverified substance → no. Korea prints the answer on the
 * page, so a missing or partial API answer costs accuracy but not safety.
 * Abroad there is no printed mark, so substance is the only signal there is;
 * without it every box — including a mandatory terms-of-service box — would
 * come off and the user could not complete the form. Reporting and waiting for
 * a click is the only honest thing left to do.
 */
export function canAutoApply(
  context: PageContext | null | undefined,
  { substanceVerified = false }: AutoApplyOptions = {}
): boolean {
  if (!context || typeof context !== 'object') return false;
  if (context.certain !== true) return false;
  if (context.regime === 'intl' && !substanceVerified) return false;
  return context.moment !== 'payment' && context.moment !== 'other';
}
