/**
 * menu.ts — the right-click entry point.
 *
 * The badge only appears when there is something to say, which leaves no way
 * to tell a working extension from one that failed to load. This menu is that
 * answer: it is present on every page, and its own label reports what was
 * found — including "nothing", which is the case the badge cannot express.
 */

import {
  createTranslator,
  resolveLocale,
  type LocalePreference,
  type MessageKey,
  type Translator,
} from '../i18n/index.js';

import type { PageStatus, ToContent } from './messages.js';
import type { Regime } from '../core/types.js';

const ROOT = 'agreedee:root';
const RESCAN = 'agreedee:rescan';
const OPTIONS = 'agreedee:options';
const REGIME_ID: Record<Regime, string> = {
  kr: 'agreedee:regime:kr',
  intl: 'agreedee:regime:intl',
};

/**
 * The menu has room the badge does not, so it says what each regime actually
 * reads: a printed mark, or the terms text. Naming a statute here would be
 * wrong more often than right — only a quarter of the consent items this sees
 * are personal-data consent, and the rest are governed by other law entirely.
 */
const REGIME_LABEL: Record<Regime, MessageKey> = {
  kr: 'menu.regime.kr',
  intl: 'menu.regime.intl',
};

const statusKey = (tabId: number): string => `status:${tabId}`;

async function translator(): Promise<Translator> {
  const stored = await chrome.storage.local.get('locale');
  const preference = (stored as { locale?: LocalePreference }).locale ?? 'auto';
  return createTranslator(resolveLocale(preference, chrome.i18n.getUILanguage()));
}

/** The root label, which is the only part of this menu that carries news. */
function rootTitle(t: Translator, status: PageStatus | undefined): string {
  if (!status) return t('menu.root');
  if (status.items === 0) return t('menu.root.none');
  if (status.pending) {
    return t('menu.root.pending', { items: status.items, count: status.turnedOff });
  }
  return t('menu.root.done', { items: status.items, count: status.turnedOff });
}

export async function buildMenu(): Promise<void> {
  const t = await translator();
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({ id: ROOT, title: t('menu.root'), contexts: ['all'] });
  chrome.contextMenus.create({ id: RESCAN, parentId: ROOT, title: t('menu.rescan'), contexts: ['all'] });
  chrome.contextMenus.create({ id: 'agreedee:sep1', parentId: ROOT, type: 'separator', contexts: ['all'] });
  // A disabled item as a group heading: without it the two radios sit there
  // unexplained, and a law is not something to pick blind.
  chrome.contextMenus.create({
    id: 'agreedee:regime:header',
    parentId: ROOT,
    title: t('menu.regime.header'),
    enabled: false,
    contexts: ['all'],
  });
  for (const regime of ['kr', 'intl'] as const) {
    chrome.contextMenus.create({
      id: REGIME_ID[regime],
      parentId: ROOT,
      type: 'radio',
      checked: regime === 'kr',
      title: t(REGIME_LABEL[regime]),
      contexts: ['all'],
    });
  }
  chrome.contextMenus.create({ id: 'agreedee:sep2', parentId: ROOT, type: 'separator', contexts: ['all'] });
  chrome.contextMenus.create({ id: OPTIONS, parentId: ROOT, title: t('menu.options'), contexts: ['all'] });
}

/** Menus outlive the service worker, so an update can arrive before a build. */
type MenuChanges = Omit<chrome.contextMenus.CreateProperties, 'id'>;

async function update(id: string, changes: MenuChanges): Promise<void> {
  try {
    await chrome.contextMenus.update(id, changes);
  } catch {
    await buildMenu();
  }
}

export async function rememberStatus(tabId: number, status: PageStatus): Promise<void> {
  await chrome.storage.session.set({ [statusKey(tabId)]: status });
  await showStatusFor(tabId);
}

export async function forgetStatus(tabId: number): Promise<void> {
  await chrome.storage.session.remove(statusKey(tabId));
}

export async function showStatusFor(tabId: number): Promise<void> {
  const key = statusKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const status = (stored as Record<string, PageStatus | undefined>)[key];
  await update(ROOT, { title: rootTitle(await translator(), status) });
  if (!status) return;
  // Set both: a radio left checked from another tab is worse than none.
  for (const regime of ['kr', 'intl'] as const) {
    await update(REGIME_ID[regime], { checked: regime === status.regime });
  }
}

/** Fire and forget: a tab with no content script simply has nothing to tell. */
function send(tabId: number, message: ToContent): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

export function installMenuHandlers(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === OPTIONS) return void chrome.runtime.openOptionsPage();
    if (tab?.id === undefined) return;
    if (info.menuItemId === RESCAN) return send(tab.id, { type: 'agreedee:rescan' });
    for (const regime of ['kr', 'intl'] as const) {
      if (info.menuItemId === REGIME_ID[regime]) {
        return send(tab.id, { type: 'agreedee:setRegime', regime });
      }
    }
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => void showStatusFor(tabId));
  chrome.tabs.onRemoved.addListener((tabId) => void forgetStatus(tabId));

  // A language change has to reach a menu that was labelled at install time.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['locale']) void buildMenu();
  });
}
