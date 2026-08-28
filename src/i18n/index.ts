/**
 * i18n/index.ts — the whole translation layer.
 *
 * Two axes exist in this extension and must not be confused:
 *
 *   regime  which law we judge and accuse under — a property of the PAGE
 *   locale  which language we speak to the user — a property of the USER
 *
 * This module owns the second one only.
 *
 * chrome.i18n is not used at runtime. It resolves against the browser's UI
 * language and an extension cannot override it, which would hand an English
 * badge to a Korean reader whose Chrome happens to be in English. `_locales`
 * still exists for the manifest's own name and description, which have no
 * other mechanism.
 */

import { ko } from './messages.ko.js';
import { en } from './messages.en.js';
import type { Locale } from '../core/types.js';

export type MessageKey = keyof typeof ko;

/** Every locale must answer every key; a gap is a build failure, not a blank. */
export type Messages = Record<MessageKey, string>;

/** What the user picked. 'auto' defers to the browser's UI language. */
export type LocalePreference = Locale | 'auto';

export const LOCALES: readonly Locale[] = ['ko', 'en'];
export const DEFAULT_LOCALE: Locale = 'ko';

// Both catalogues are plain objects of a few dozen strings. Loading them
// lazily would buy nothing and would make the badge's synchronous render
// depend on a promise.
const CATALOGUES: Record<Locale, Messages> = { ko, en };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve a stored preference against the browser. Anything unrecognised — an
 * old value, a language we do not ship — falls back to the default rather than
 * rendering keys.
 */
export function resolveLocale(preference: LocalePreference, uiLanguage: string): Locale {
  if (isLocale(preference)) return preference;
  const base = uiLanguage.toLowerCase().split('-')[0];
  return isLocale(base) ? base : DEFAULT_LOCALE;
}

const INTERPOLATION = /\{(\w+)\}/g;

/** Substitute `{name}` placeholders. A missing value leaves the placeholder. */
function interpolate(template: string, params?: Readonly<Record<string, string | number>>): string {
  if (!params) return template;
  return template.replace(INTERPOLATION, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

export interface Translator {
  (key: MessageKey, params?: Readonly<Record<string, string | number>>): string;
  locale: Locale;
}

export function createTranslator(locale: Locale): Translator {
  const catalogue = CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
  const translate = ((key, params) =>
    interpolate(catalogue[key] ?? ko[key] ?? key, params)) as Translator;
  translate.locale = locale;
  return translate;
}
