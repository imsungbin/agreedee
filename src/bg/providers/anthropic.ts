/**
 * anthropic.ts — one batched request per consent moment, via the Messages API.
 *
 * Raw HTTP rather than the Anthropic SDK: this runs inside an MV3 service
 * worker with no bundler, so npm packages are not an option.
 *
 * Structured output comes from a forced tool call, which is the strongest
 * guarantee the API offers that prose never arrives where a schema is due.
 */

import { TOOL, SYSTEM_PROMPT } from '../../core/schema.js';
import { buildPrompt, hasNothingToJudge, isJudgeRows, MAX_TOKENS, resolveFetch, scrub, withDeadline } from './shared.js';
import type { AnthropicConfig, JudgePayload, JudgeRow, ProbeResult } from './types.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/** Remote calls cross a network; the content script gives up at this point too. */
export const DEFAULT_TIMEOUT_MS = 4000;

export function buildRequest(
  payload: JudgePayload,
  { apiKey, model }: Pick<AnthropicConfig, 'apiKey' | 'model'>
) {
  return {
    url: ENDPOINT,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: {
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: buildPrompt(payload) }],
    },
  };
}

/** Structured output only. Prose is not an answer. */
export function parseResponse(json: unknown): JudgeRow[] | null {
  const envelope = json as { content?: unknown } | null;
  const content = envelope && Array.isArray(envelope.content) ? envelope.content : null;
  if (!content) return null;
  const block = content.find(
    (b): b is { type: 'tool_use'; name: string; input?: { items?: unknown } } =>
      Boolean(b) && b.type === 'tool_use' && b.name === TOOL.name
  );
  if (!block || !block.input || !isJudgeRows(block.input.items)) return null;
  return block.input.items;
}

export async function judge(payload: JudgePayload, config: AnthropicConfig): Promise<JudgeRow[]> {
  if (hasNothingToJudge(payload)) return [];
  const { apiKey, model, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
  if (!apiKey) throw new Error('no API key configured');
  const impl = resolveFetch(config);

  const req = buildRequest(payload, { apiKey, model });
  return withDeadline(timeoutMs, apiKey, async (signal) => {
    const res = await impl(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Anthropic API ${res.status}: ${scrub(await res.text(), apiKey)}`);
    }
    const rows = parseResponse(await res.json());
    if (rows === null) throw new Error('Anthropic API returned no structured answer');
    return rows;
  });
}

/**
 * A one-token request, which is the cheapest way to learn whether a key works
 * without asking the user to go and find out on a real page.
 */
export async function probe(config: AnthropicConfig): Promise<ProbeResult> {
  const { apiKey, model, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
  if (!apiKey) return { ok: false, reason: 'unauthorized' };
  try {
    const impl = resolveFetch(config);
    const res = await withDeadline(timeoutMs, apiKey, (signal) =>
      impl(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        signal,
      })
    );
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
    if (res.status === 404) return { ok: false, reason: 'model_missing' };
    return res.ok ? { ok: true, reason: 'reachable' } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
