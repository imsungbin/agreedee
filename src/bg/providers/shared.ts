/**
 * providers/shared.ts — the parts every provider does identically.
 *
 * The prompt lives here rather than in each provider, so that changing model
 * cannot quietly change the question. Both providers send the same items in
 * the same shape, under the same system prompt from schema.ts.
 */

import type { JudgePayload, JudgeRow, Transport } from './types.js';

export const MAX_TOKENS = 2048;

/** Redact anything key-shaped before it can reach a log or an error message. */
export function scrub(text: unknown, secret?: string | undefined): string {
  return String(text || '')
    .split(secret || ' ')
    .join('***')
    // Covers sk-ant-, sk-proj- and plain sk- keys alike.
    .replace(/sk-[A-Za-z0-9_-]{10,}/g, '***')
    .slice(0, 300);
}

/** The user turn. Identical for every provider, on purpose. */
export function buildPrompt(payload: JudgePayload): string {
  const lines = payload.items.map((item, i) =>
    [
      `<item index="${i}" id="${item.id}">`,
      `LABEL: ${item.labelText}`,
      `PRINTED MARK: ${item.mark}`,
      'TERMS TEXT:',
      item.termsText || '(none available)',
      '</item>',
    ].join('\n')
  );
  return `Consent moment: ${payload.moment}\n\n${lines.join('\n\n')}`;
}

export function hasNothingToJudge(payload: JudgePayload | null | undefined): boolean {
  return !payload || !Array.isArray(payload.items) || payload.items.length === 0;
}

export function resolveFetch({ fetchImpl }: Transport): typeof fetch {
  const impl = fetchImpl === undefined ? (typeof fetch === 'function' ? fetch : null) : fetchImpl;
  if (!impl) throw new Error('no fetch implementation available');
  return impl;
}

/** Run one request against a hard deadline, scrubbing the secret from failures. */
export async function withDeadline<T>(
  timeoutMs: number,
  secret: string | undefined,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(scrub(message, secret) || 'request failed');
  } finally {
    clearTimeout(timer);
  }
}

/** Every provider must return rows carrying the ids it was given. */
export function isJudgeRows(value: unknown): value is JudgeRow[] {
  return (
    Array.isArray(value) &&
    value.every((row) => Boolean(row) && typeof (row as JudgeRow).id === 'string')
  );
}
