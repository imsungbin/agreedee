/**
 * openai.ts — anything speaking the OpenAI Chat Completions shape.
 *
 * That is deliberately more than OpenAI: LM Studio, vLLM, llama.cpp's server,
 * OpenRouter, Groq, Together and LiteLLM all answer the same wire format, so
 * one provider covers them by pointing the base URL somewhere else. Whether it
 * is local or remote is a property of that URL, not of this file.
 *
 * Structured output uses `response_format: json_schema` in strict mode, with
 * the same schema the Anthropic tool call is constrained by. Servers that
 * predate it reject the field, so a single retry falls back to `json_object`,
 * which constrains the syntax but not the shape. That fallback is safe rather
 * than merely convenient: an answer in the wrong shape parses to nothing, and
 * an answer whose quote is not verbatim in the terms text is discarded by
 * decide.ts. Both end at `unclear`, which unchecks.
 */

import { TOOL, SYSTEM_PROMPT } from '../../core/schema.js';
import { buildPrompt, hasNothingToJudge, isJudgeRows, MAX_TOKENS, resolveFetch, scrub, withDeadline } from './shared.js';
import type { JudgePayload, JudgeRow, OpenAiConfig, ProbeResult } from './types.js';

export const DEFAULT_URL = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-4o-mini';

/** A hosted model answering with a schema is slower than a plain completion. */
export const REMOTE_TIMEOUT_MS = 10000;
/** A model on this machine may have to be paged in first. */
export const LOCAL_TIMEOUT_MS = 30000;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

export function normaliseUrl(url: string): string {
  return (url || DEFAULT_URL).trim().replace(/\/+$/, '');
}

/** True when this base URL points at the user's own machine. */
export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(normaliseUrl(url)).hostname);
  } catch {
    return false;
  }
}

export function timeoutFor(url: string): number {
  return isLocalUrl(url) ? LOCAL_TIMEOUT_MS : REMOTE_TIMEOUT_MS;
}

/** A local server usually wants no key; a hosted one always does. */
function authHeaders(apiKey: string): Record<string, string> {
  return apiKey ? { authorization: `Bearer ${apiKey}` } : {};
}

function headersFor(apiKey: string): Record<string, string> {
  return { 'content-type': 'application/json', ...authHeaders(apiKey) };
}

export type ResponseFormatMode = 'json_schema' | 'json_object';

export function buildRequest(
  payload: JudgePayload,
  { url, apiKey, model }: Pick<OpenAiConfig, 'url' | 'apiKey' | 'model'>,
  mode: ResponseFormatMode = 'json_schema'
) {
  const responseFormat =
    mode === 'json_schema'
      ? {
          type: 'json_schema',
          json_schema: { name: TOOL.name, strict: true, schema: TOOL.input_schema },
        }
      : { type: 'json_object' };

  return {
    url: `${normaliseUrl(url)}/chat/completions`,
    headers: headersFor(apiKey),
    body: {
      model,
      max_completion_tokens: MAX_TOKENS,
      temperature: 0,
      response_format: responseFormat,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(payload) },
      ],
    },
  };
}

/**
 * The answer arrives as a JSON string in the first choice's message content,
 * so this is where a parse can fail on well-formed HTTP. A failure returns
 * null, which the caller turns into "no substance data" — never into a guess.
 */
export function parseResponse(json: unknown): JudgeRow[] | null {
  const envelope = json as { choices?: Array<{ message?: { content?: unknown } }> } | null;
  const content = envelope?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  return isJudgeRows(items) ? items : null;
}

/** A server that has never heard of json_schema says so with a 4xx. */
function rejectsSchema(status: number, body: string): boolean {
  return status >= 400 && status < 500 && /response_format|json_schema|schema/i.test(body);
}

export async function judge(payload: JudgePayload, config: OpenAiConfig): Promise<JudgeRow[]> {
  if (hasNothingToJudge(payload)) return [];
  const { url, apiKey, model } = config;
  if (!model) throw new Error('no model configured');
  const timeoutMs = config.timeoutMs ?? timeoutFor(url);
  const impl = resolveFetch(config);

  const attempt = async (mode: ResponseFormatMode): Promise<JudgeRow[] | 'unsupported'> => {
    const req = buildRequest(payload, { url, apiKey, model }, mode);
    return withDeadline(timeoutMs, apiKey, async (signal) => {
      const res = await impl(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(req.body),
        signal,
      });
      if (!res.ok) {
        const body = scrub(await res.text(), apiKey);
        if (mode === 'json_schema' && rejectsSchema(res.status, body)) return 'unsupported';
        throw new Error(`OpenAI API ${res.status}: ${body}`);
      }
      const rows = parseResponse(await res.json());
      if (rows === null) throw new Error('OpenAI API returned no structured answer');
      return rows;
    });
  };

  const strict = await attempt('json_schema');
  if (strict !== 'unsupported') return strict;

  const loose = await attempt('json_object');
  if (loose === 'unsupported') throw new Error('OpenAI API rejected every response format');
  return loose;
}

/** `/models` is part of the spec, and most compatible servers implement it. */
export function parseModels(json: unknown): string[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((m) => (m as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string')
    .sort();
}

export async function probe(config: OpenAiConfig): Promise<ProbeResult> {
  const { url, apiKey, model } = config;
  const timeoutMs = config.timeoutMs ?? 6000;
  try {
    const impl = resolveFetch(config);
    const res = await withDeadline(timeoutMs, apiKey, (signal) =>
      impl(`${normaliseUrl(url)}/models`, { headers: authHeaders(apiKey), signal })
    );
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
    if (!res.ok) return { ok: false, reason: 'unreachable' };
    const models = parseModels(await res.json());
    // Some gateways answer /models with an empty or filtered list, so an
    // absent model is only reported when the server actually named some.
    if (model && models.length > 0 && !models.includes(model)) {
      return { ok: false, reason: 'model_missing', models };
    }
    return { ok: true, reason: 'reachable', models };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
