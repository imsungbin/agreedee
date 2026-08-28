/**
 * terms.js — fetch the linked terms body, once, briefly, and never fatally.
 *
 * A failure here is not an error condition: it leaves termsSource
 * 'unavailable', which downstream means "unclear", which means unchecked.
 */

import type { TermsCarrier } from '../core/types.js';

export interface PrefetchOptions {
  fetchImpl: typeof fetch;
  cache?: Map<string, string | null>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 2000;
const MAX_TERMS = 8000;

function stripHtml(html: unknown): string {
  const withoutCode = String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return withoutCode
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TERMS);
}

async function fetchText(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, credentials: 'omit' });
    if (!res || res.ok === false) return null;
    const body = await res.text();
    const text = stripHtml(body);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fills in termsText/termsSource in place. One request per unique URL. */
export async function prefetchTerms<T extends TermsCarrier>(
  items: readonly T[],
  { fetchImpl, cache = new Map(), timeoutMs = DEFAULT_TIMEOUT }: PrefetchOptions
): Promise<readonly T[]> {
  const pending = items.filter(
    (i): i is T & { termsUrl: string } => !i.termsText && Boolean(i.termsUrl)
  );
  await Promise.all(
    [...new Set(pending.map((i) => i.termsUrl))].map(async (url) => {
      if (!cache.has(url)) cache.set(url, await fetchText(url, fetchImpl, timeoutMs));
    })
  );
  for (const item of pending) {
    const text = cache.get(item.termsUrl);
    if (text) {
      item.termsText = text;
      item.termsSource = 'prefetched';
    }
  }
  return items;
}
