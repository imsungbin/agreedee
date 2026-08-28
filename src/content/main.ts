/**
 * main.js — wiring only. Watch for consent moments, ask the background for
 * substance data, run the pipeline, show one badge.
 */

import { findConsentMoments, observeConsent } from './observe.js';
import { handleBanners, type BannerReport } from './banners.js';
import { detectRegime } from '../core/context.js';
import { contextSignals } from '../core/pipeline.js';
import { runMoment } from './run.js';
import { createBadge, type Badge } from './badge.js';
import type { JudgePayload, JudgeRow } from '../bg/providers/types.js';
import type { JudgeResponse, PageStatus, ToContent } from '../bg/messages.js';
import { summarise } from './status.js';
import type { BadgeHandle, BadgeState } from './run.js';
import { DEFAULT_LOCALE, resolveLocale, type LocalePreference } from '../i18n/index.js';
import type { ConsentMoment, Locale, Regime } from '../core/types.js';

const OVERRIDES_KEY = 'regimeOverrides';

const termsCache = new Map<string, string | null>();
const states = new Map<number, BadgeState>();

function requestSubstances(payload: JudgePayload): Promise<JudgeRow[]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'agreedee:judge', payload }, (res: JudgeResponse) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!res || !res.ok) return reject(new Error(res?.reason || 'unavailable'));
      resolve(res.rows);
    });
  });
}

/**
 * The display language, read straight from storage rather than through the
 * background settings module: that module also holds the API key, and nothing
 * a page can reach should import it.
 */
async function displayLocale(): Promise<Locale> {
  try {
    const stored = await chrome.storage.local.get('locale');
    const preference = (stored as { locale?: LocalePreference }).locale ?? 'auto';
    return resolveLocale(preference, chrome.i18n.getUILanguage());
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * A correction the user made on this domain. Detection is good but not
 * perfect — a Korean company's English-language global site reads as `intl`,
 * a Korean translation of a foreign service reads as `kr` — and the fix has to
 * outlive the page it was made on.
 */
async function storedRegime(host: string): Promise<Regime | undefined> {
  try {
    const stored = await chrome.storage.local.get(OVERRIDES_KEY);
    return (stored as { regimeOverrides?: Record<string, Regime> })[OVERRIDES_KEY]?.[host];
  } catch {
    return undefined;
  }
}

async function rememberRegime(host: string, regime: Regime): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(OVERRIDES_KEY);
    const all = (stored as { regimeOverrides?: Record<string, Regime> })[OVERRIDES_KEY] ?? {};
    await chrome.storage.local.set({ [OVERRIDES_KEY]: { ...all, [host]: regime } });
  } catch {
    // A preference we cannot store is not worth breaking the page over.
  }
}

/**
 * Tell the background what this page turned out to be, so the right-click menu
 * can report it — including "no consent items here", which the badge has no
 * way to say because it does not appear at all.
 */
/** What the badge shows when a banner was the page's only consent request. */
function bannerOnlyState(report: BannerReport, regime: Regime | undefined): BadgeState {
  return {
    moment: 'other',
    regime: regime ?? 'intl',
    degraded: false,
    changed: [],
    findings: [],
    pending: false,
    banner: report,
  };
}

function report(status: PageStatus): void {
  chrome.runtime.sendMessage({ type: 'agreedee:status', status }).catch(() => {});
}

/**
 * Banners are a separate surface from checkbox forms and are handled on their
 * own terms, but the page gets one badge, so the outcome rides along with it.
 */
let banner: BannerReport | null = null;

/** One badge for the page, even when several moments are on screen. */
function badgeFor(badge: Badge, key: number): BadgeHandle {
  return {
    render(state: BadgeState): boolean {
      states.set(key, state);
      const all = [...states.values()];
      const first = all[0];
      if (!first) return false;
      // Regime is a property of the page, so every moment on it agrees.
      return badge.render({
        moment: first.moment,
        regime: first.regime,
        degraded: all.some((s) => s.degraded),
        changed: all.flatMap((s) => s.changed || []),
        findings: all.flatMap((s) => s.findings || []),
        pending: all.some((s) => s.pending),
        banner: banner ?? undefined,
        onApply: () => all.forEach((s) => s.onApply && s.onApply()),
        onRegimeChange: first.onRegimeChange,
      });
    },
  };
}

async function start(): Promise<void> {
  const badge = createBadge(document, await displayLocale());
  const host = location.hostname;
  let regime = await storedRegime(host);
  let latest: ConsentMoment[] = [];

  function switchRegime(chosen: Regime): void {
    regime = chosen;
    void rememberRegime(host, chosen);
    void analyse(latest);
  }

  async function analyse(moments: readonly ConsentMoment[]): Promise<void> {
    states.clear();
    // Refuse the banner first: it is the fastest thing on the page to settle,
    // needs no model, and often covers the whole consent request by itself.
    try {
      banner = handleBanners(document);
    } catch {
      banner = null;
    }
    let items = 0;
    for (const [i, moment] of moments.entries()) {
      items += moment.items.length;
      try {
        await runMoment(document, moment, {
          requestSubstances,
          badge: badgeFor(badge, i),
          cache: termsCache,
          regime,
          onRegimeChange: switchRegime,
        });
      } catch {
        // Never break the page we are sitting on.
      }
    }
    report(
      summarise({
        host,
        items,
        states: [...states.values()],
        // A page with no consent moment still gets read: it has a language, a
        // host and a body of text. Falling back to a default here is what told
        // the menu that every quiet English page was judged under Korean law.
        detectedRegime: detectRegime(contextSignals(document, null, regime)),
      })
    );
  }

  chrome.runtime.onMessage.addListener((message: unknown) => {
    const command = message as ToContent | null;
    if (command?.type === 'agreedee:rescan') void analyse(latest);
    if (command?.type === 'agreedee:setRegime') switchRegime(command.regime);
    return false;
  });

  observeConsent(document, (moments) => {
    latest = moments;
    void analyse(moments);
  });

  // A page with no consent moment never triggers the observer callback, and
  // that silence is exactly what the menu needs to be able to report.
  if (findConsentMoments(document).length === 0) await analyse([]);
}

void start();
