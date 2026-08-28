/**
 * badge.ts — the entire user interface: one badge, one line, one panel.
 *
 * Rules: Shadow DOM so a hostile page cannot restyle or hide it, and every
 * page-derived string goes in through textContent. No innerHTML, anywhere.
 */

import type { ApplyChange } from './apply.js';
import type { BannerReport } from './banners.js';
import type { Finding, Locale, MomentKind, Regime } from '../core/types.js';
import { createTranslator, DEFAULT_LOCALE, type Translator } from '../i18n/index.js';
import { flagKey, reasonKey, regimeKey } from '../i18n/findings.js';
import { CSS } from './badge-style.js';

/**
 * What the badge needs in order to draw itself. It lives here rather than with
 * the pipeline that fills it in: this is the shape the badge renders, and the
 * badge is what has to keep it honest.
 */
export interface BadgeState {
  moment: MomentKind;
  /** Which law produced these findings. Decides the wording, not the action. */
  regime: Regime;
  degraded: boolean;
  changed: ApplyChange[];
  findings: Finding[];
  pending: boolean;
  /** A refusal control we pressed, or one we found but did not press. */
  banner?: BannerReport | undefined;
  onApply?: () => void;
  /** Offered when the user can correct a misdetected regime. */
  onRegimeChange?: ((regime: Regime) => void) | undefined;
}

/** The narrow view of a badge that the pipeline is handed. */
export interface BadgeHandle {
  render(state: BadgeState): boolean;
}

const HOST_ATTR = 'data-agreedee';

function el(doc: Document, tag: string, className?: string | null, text?: string): HTMLElement {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function list<T extends { labelText?: string }>(
  doc: Document,
  title: string,
  entries: readonly T[],
  describe: (entry: T) => string,
  unnamed: string
): DocumentFragment {
  const frag = doc.createDocumentFragment();
  frag.append(el(doc, 'h2', null, title));
  const ul = el(doc, 'ul');
  for (const entry of entries) {
    const li = el(doc, 'li');
    li.append(el(doc, 'span', 'label', entry.labelText || unnamed));
    li.append(el(doc, 'span', 'why', describe(entry)));
    ul.append(li);
  }
  frag.append(ul);
  return frag;
}

export interface Badge {
  render(state: BadgeState): boolean;
  destroy(): void;
}

export function createBadge(doc: Document, locale: Locale = DEFAULT_LOCALE): Badge {
  const t: Translator = createTranslator(locale);

  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let open = false;

  function mount(): void {
    if (host && host.isConnected) return;
    host = doc.createElement('div');
    host.setAttribute(HOST_ATTR, '');
    root = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    root.append(style);
    (doc.body || doc.documentElement).append(host);
  }

  function render(state: BadgeState): boolean {
    const changed = state.changed || [];
    const findings = state.findings || [];
    if (changed.length === 0 && findings.length === 0 && !state.banner) return false;
    mount();
    const shadow = root as ShadowRoot;

    for (const node of [...shadow.children]) if (node.tagName !== 'STYLE') node.remove();
    const wrap = el(doc, 'div', 'wrap');
    const panel = el(doc, 'div', `panel${open ? ' open' : ''}`);

    const unnamed = t('badge.unnamedItem');
    if (changed.length > 0) {
      panel.append(
        list(
          doc,
          t(state.pending ? 'badge.section.pending' : 'badge.section.done'),
          changed,
          (c) => {
            const key = reasonKey(c.reason, state.regime);
            return key ? t(key) : c.reason;
          },
          unnamed
        )
      );
    }
    if (findings.length > 0) {
      panel.append(
        list(
          doc,
          t('badge.section.findings'),
          findings,
          (f) => t(flagKey(f.flag, state.regime)),
          unnamed
        )
      );
    }
    // Abroad, waiting for a click is about the regime rather than the key:
    // with no printed mark, unverified substance is no evidence at all.
    if (state.regime === 'intl' && state.pending) {
      panel.append(el(doc, 'p', 'note', t('badge.reportOnly.intl')));
    } else if (state.degraded) {
      panel.append(el(doc, 'p', 'note', t('badge.degraded')));
    }
    if (state.pending) {
      panel.append(
        el(doc, 'p', 'note', t('badge.manualOnly', { moment: t(`moment.${state.moment}`) }))
      );
      const button = el(doc, 'button', 'apply', t('badge.apply'));
      button.setAttribute('data-apply', '');
      button.addEventListener('click', () => state.onApply && state.onApply());
      panel.append(button);
    }

    const badge = el(doc, 'div', 'badge');
    badge.setAttribute('data-toggle', '');
    badge.append(el(doc, 'span', `dot${state.pending ? ' pending' : state.degraded ? ' degraded' : ''}`));
    badge.append(el(doc, 'span', 'line', headline(t, state, changed, findings)));
    badge.addEventListener('click', () => {
      open = !open;
      panel.classList.toggle('open', open);
    });

    if (state.onRegimeChange) {
      const other: Regime = state.regime === 'kr' ? 'intl' : 'kr';
      const swap = el(doc, 'button', 'regime', t('badge.regime.switchTo', { regime: t(regimeKey(other)) }));
      swap.setAttribute('data-regime', other);
      swap.addEventListener('click', () => state.onRegimeChange?.(other));
      panel.append(swap);
    }

    wrap.append(panel, badge);
    shadow.append(wrap);
    return true;
  }

  function destroy(): void {
    if (host) host.remove();
    host = null;
    root = null;
    open = false;
  }

  return { render, destroy };
}

function headline(
  t: Translator,
  state: BadgeState,
  changed: readonly unknown[],
  findings: readonly unknown[]
): string {
  if (state.pending && changed.length > 0) {
    return t('badge.headline.pending', { count: changed.length });
  }
  if (changed.length > 0) return t('badge.headline.done', { count: changed.length });
  if (findings.length > 0) return t('badge.headline.findings', { count: findings.length });
  return t(state.banner?.pressed ? 'badge.headline.refused' : 'badge.headline.banner');
}
