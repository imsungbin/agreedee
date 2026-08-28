/**
 * settings.ts — the user's own configuration, in chrome.storage.local.
 *
 * The Anthropic key is never logged, never put in a URL, and never shipped
 * with the extension. Each provider keeps its own model field so that trying
 * the other one and switching back does not lose what was set.
 */

import type { LocalePreference } from '../i18n/index.js';
import type { ProviderId } from './providers/types.js';

export interface Settings {
  /** Which judge answers. 'ollama' keeps everything on this machine. */
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** Base URL of any OpenAI-compatible server, version segment included. */
  openaiUrl: string;
  /** Optional: a local OpenAI-compatible server usually wants no key. */
  openaiKey: string;
  openaiModel: string;
  /** Base URL of the Ollama server. */
  ollamaUrl: string;
  ollamaModel: string;
  enabled: boolean;
  /** 'auto' follows the browser's UI language. */
  locale: LocalePreference;
}

export const DEFAULTS: Settings = {
  provider: 'anthropic',
  apiKey: '',
  model: 'claude-sonnet-4-5',
  openaiUrl: 'https://api.openai.com/v1',
  openaiKey: '',
  openaiModel: 'gpt-4o-mini',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  enabled: true,
  locale: 'auto',
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...(stored as Partial<Settings>) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  await chrome.storage.local.set(patch);
  return getSettings();
}

/**
 * Whether the configured provider has what it needs.
 *
 * Only Anthropic always requires a key. Ollama never does, and an
 * OpenAI-compatible server run locally does not either — so a key is not part
 * of the test there, and demanding one would lock out the local case that is
 * half the reason the provider exists.
 */
export function isConfigured(settings: Settings): boolean {
  if (settings.provider === 'ollama') {
    return Boolean(settings.ollamaUrl && settings.ollamaModel);
  }
  if (settings.provider === 'openai') {
    return Boolean(settings.openaiUrl && settings.openaiModel);
  }
  return Boolean(settings.apiKey);
}
