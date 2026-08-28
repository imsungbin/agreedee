/**
 * providers/index.ts — pick a judge and hand it the settings it needs.
 *
 * The choice is the user's and it is the only thing that varies: the payload,
 * the prompt, the schema and everything downstream of the answer are the same
 * whichever one answers.
 */

import * as anthropic from './anthropic.js';
import * as openai from './openai.js';
import * as ollama from './ollama.js';
import type { Settings } from '../settings.js';
import type { JudgePayload, JudgeRow, ProbeResult, ProviderId, Transport } from './types.js';

export const PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai', 'ollama'];

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

/**
 * How long to wait for an answer. A model on this machine has to be paged in
 * before it says anything, which takes far longer than a network round trip —
 * and for an OpenAI-compatible endpoint, which of the two it is depends on the
 * URL rather than on the provider name.
 */
export function timeoutFor(settings: Settings): number {
  if (settings.provider === 'ollama') return ollama.DEFAULT_TIMEOUT_MS;
  if (settings.provider === 'openai') return openai.timeoutFor(settings.openaiUrl);
  return anthropic.DEFAULT_TIMEOUT_MS;
}

/**
 * True when nothing leaves the user's machine. Ollama always qualifies; an
 * OpenAI-compatible endpoint qualifies when it is pointed at localhost, which
 * is how LM Studio and vLLM are normally run.
 */
export function isLocal(settings: Settings): boolean {
  if (settings.provider === 'ollama') return true;
  if (settings.provider === 'openai') return openai.isLocalUrl(settings.openaiUrl);
  return false;
}

export async function judge(
  payload: JudgePayload,
  settings: Settings,
  transport: Transport = {}
): Promise<JudgeRow[]> {
  if (settings.provider === 'ollama') {
    return ollama.judge(payload, {
      url: settings.ollamaUrl,
      model: settings.ollamaModel,
      ...transport,
    });
  }
  if (settings.provider === 'openai') {
    return openai.judge(payload, {
      url: settings.openaiUrl,
      apiKey: settings.openaiKey,
      model: settings.openaiModel,
      ...transport,
    });
  }
  return anthropic.judge(payload, {
    apiKey: settings.apiKey,
    model: settings.model,
    ...transport,
  });
}

/** Answer "is this configured correctly?" from the settings page itself. */
export async function probe(settings: Settings, transport: Transport = {}): Promise<ProbeResult> {
  if (settings.provider === 'ollama') {
    return ollama.probe({ url: settings.ollamaUrl, model: settings.ollamaModel, ...transport });
  }
  if (settings.provider === 'openai') {
    return openai.probe({
      url: settings.openaiUrl,
      apiKey: settings.openaiKey,
      model: settings.openaiModel,
      ...transport,
    });
  }
  return anthropic.probe({ apiKey: settings.apiKey, model: settings.model, ...transport });
}
