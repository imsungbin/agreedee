/**
 * options.ts — the settings page.
 *
 * The markup carries no copy: every visible string is filled in from the
 * catalogue by key, so switching language re-renders the whole page and cannot
 * leave one line behind.
 *
 * The connection check is here rather than left to the user's first real
 * consent form, because the failure it catches — wrong key, Ollama not
 * running, model not pulled — is silent everywhere else: the extension simply
 * degrades and unchecks more than it needed to.
 */

import { getSettings, setSettings, DEFAULTS, type Settings } from '../bg/settings.js';
import { isProviderId } from '../bg/providers/index.js';
import { normaliseUrl } from '../bg/providers/openai.js';
import type { ProbeResponse } from '../bg/messages.js';
import type { ProviderId } from '../bg/providers/types.js';
import {
  createTranslator,
  isLocale,
  resolveLocale,
  type LocalePreference,
  type MessageKey,
  type Translator,
} from '../i18n/index.js';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const key = el<HTMLInputElement>('key');
const model = el<HTMLSelectElement>('model');
const openaiUrl = el<HTMLInputElement>('openai-url');
const openaiKey = el<HTMLInputElement>('openai-key');
const openaiModel = el<HTMLInputElement>('openai-model');
const openaiModels = el<HTMLDataListElement>('openai-models');
const ollamaUrl = el<HTMLInputElement>('ollama-url');
const ollamaModel = el<HTMLInputElement>('ollama-model');
const ollamaModels = el<HTMLDataListElement>('ollama-models');
const locale = el<HTMLSelectElement>('locale');
const enabled = el<HTMLInputElement>('enabled');
const status = el<HTMLElement>('status');
const probeResult = el<HTMLElement>('probe-result');
const save = el<HTMLButtonElement>('save');
const probe = el<HTMLButtonElement>('probe');

const PANES: Record<ProviderId, HTMLElement[]> = {
  anthropic: [el('pane-anthropic'), el('note-anthropic')],
  openai: [el('pane-openai'), el('note-openai')],
  ollama: [el('pane-ollama'), el('note-ollama')],
};

const MODEL_LISTS: Partial<Record<ProviderId, HTMLDataListElement>> = {
  openai: openaiModels,
  ollama: ollamaModels,
};

const STATUS_MS = 2000;
let clearStatus: ReturnType<typeof setTimeout> | undefined;

function chosenProvider(): ProviderId {
  const picked = document.querySelector<HTMLInputElement>('input[name=provider]:checked');
  return isProviderId(picked?.value) ? picked.value : DEFAULTS.provider;
}

function chosenLocale(): LocalePreference {
  return isLocale(locale.value) ? locale.value : 'auto';
}

function translatorFor(preference: LocalePreference): Translator {
  return createTranslator(resolveLocale(preference, chrome.i18n.getUILanguage()));
}

/** Only the selected provider's fields and privacy note are on screen. */
function showProviderPane(provider: ProviderId): void {
  for (const [id, nodes] of Object.entries(PANES) as [ProviderId, HTMLElement[]][]) {
    for (const node of nodes) node.hidden = id !== provider;
  }
  probeResult.textContent = '';
  probeResult.className = '';
}

function paint(t: Translator): void {
  document.documentElement.lang = t.locale;
  document.title = t('options.title');
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const messageKey = node.dataset['i18n'] as MessageKey | undefined;
    if (messageKey) node.textContent = t(messageKey);
  }
  const preferred = document.querySelector<HTMLOptionElement>('[data-model-default]');
  if (preferred) preferred.textContent = `${preferred.value} ${t('options.modelDefaultSuffix')}`;
}

function form(): Settings {
  return {
    provider: chosenProvider(),
    apiKey: key.value.trim(),
    model: model.value,
    openaiUrl: openaiUrl.value.trim() || DEFAULTS.openaiUrl,
    openaiKey: openaiKey.value.trim(),
    openaiModel: openaiModel.value.trim(),
    ollamaUrl: ollamaUrl.value.trim() || DEFAULTS.ollamaUrl,
    ollamaModel: ollamaModel.value.trim(),
    locale: chosenLocale(),
    enabled: enabled.checked,
  };
}

async function load(): Promise<void> {
  const settings = await getSettings();
  key.value = settings.apiKey;
  model.value = settings.model || DEFAULTS.model;
  openaiUrl.value = settings.openaiUrl || DEFAULTS.openaiUrl;
  openaiKey.value = settings.openaiKey;
  openaiModel.value = settings.openaiModel || DEFAULTS.openaiModel;
  ollamaUrl.value = settings.ollamaUrl || DEFAULTS.ollamaUrl;
  ollamaModel.value = settings.ollamaModel || DEFAULTS.ollamaModel;
  locale.value = settings.locale ?? DEFAULTS.locale;
  enabled.checked = settings.enabled !== false;
  const picked = document.querySelector<HTMLInputElement>(
    `input[name=provider][value="${settings.provider}"]`
  );
  if (picked) picked.checked = true;
  showProviderPane(settings.provider);
  paint(translatorFor(settings.locale));
}

const PROBE_KEY: Record<ProbeResponse['reason'], MessageKey> = {
  reachable: 'options.probe.ok',
  unreachable: 'options.probe.unreachable',
  unauthorized: 'options.probe.unauthorized',
  model_missing: 'options.probe.modelMissing',
  failed: 'options.probe.failed',
};

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name=provider]')) {
  radio.addEventListener('change', () => showProviderPane(chosenProvider()));
}

/** Repaint as soon as the language changes, before anything is saved. */
locale.addEventListener('change', () => paint(translatorFor(chosenLocale())));

/**
 * The manifest asks for Anthropic, OpenAI and localhost up front, because
 * those are the endpoints the defaults use. Any other OpenAI-compatible
 * host — OpenRouter, Groq, a server on the LAN — is asked for here, at the
 * moment the user names it, which is also the only time Chrome will grant it:
 * the request has to come from a click.
 */
async function ensureHostAccess(settings: Settings): Promise<boolean> {
  if (settings.provider !== 'openai') return true;
  let origin: string;
  try {
    origin = `${new URL(normaliseUrl(settings.openaiUrl)).origin}/*`;
  } catch {
    return true; // A URL we cannot parse fails later, with a better message.
  }
  if (await chrome.permissions.contains({ origins: [origin] })) return true;
  return chrome.permissions.request({ origins: [origin] });
}

save.addEventListener('click', async () => {
  const settings = form();
  if (!(await ensureHostAccess(settings))) {
    const t = translatorFor(chosenLocale());
    status.textContent = t('options.hostDenied');
    return;
  }
  await setSettings(settings);
  status.textContent = translatorFor(chosenLocale())('options.saved');
  clearTimeout(clearStatus);
  clearStatus = setTimeout(() => { status.textContent = ''; }, STATUS_MS);
});

/**
 * The probe runs in the background, against the *saved* settings, because that
 * is what a real page will use. Saving first means the button never reports on
 * a configuration the extension is not actually running.
 */
probe.addEventListener('click', async () => {
  const t = translatorFor(chosenLocale());
  probeResult.className = '';
  const settings = form();
  if (!(await ensureHostAccess(settings))) {
    probeResult.textContent = t('options.hostDenied');
    probeResult.className = 'bad';
    return;
  }
  probeResult.textContent = t('options.probe.running');
  await setSettings(settings);
  try {
    const result = (await chrome.runtime.sendMessage({ type: 'agreedee:probe' })) as ProbeResponse;
    probeResult.textContent = t(PROBE_KEY[result.reason] ?? 'options.probe.failed');
    probeResult.className = result.ok ? 'good' : 'bad';
    MODEL_LISTS[chosenProvider()]?.replaceChildren(
      ...(result.models ?? []).map((name) => {
        const option = document.createElement('option');
        option.value = name;
        return option;
      })
    );
  } catch {
    probeResult.textContent = t('options.probe.failed');
    probeResult.className = 'bad';
  }
});

void load();
