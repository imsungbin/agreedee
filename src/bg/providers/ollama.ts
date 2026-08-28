/**
 * ollama.ts — the same question, asked of a model on the user's own machine.
 *
 * Nothing leaves the device on this path: no key, no account, no network hop.
 * That is the whole reason it exists.
 *
 * Structured output uses Ollama's `format` field, which takes a JSON schema
 * directly, so the schema in schema.ts is reused verbatim rather than
 * restated. Ollama returns the object as a JSON string inside message.content.
 *
 * Local models are much weaker than Claude at this, and that is safe rather
 * than merely acceptable: decide.ts verifies every quote against the terms
 * text afterwards, so a hallucinated answer becomes `unclear`, which unchecks.
 * A weak model costs recall, never correctness.
 */

import { TOOL, SYSTEM_PROMPT } from '../../core/schema.js';
import { buildPrompt, hasNothingToJudge, isJudgeRows, resolveFetch, withDeadline } from './shared.js';
import type { JudgePayload, JudgeRow, OllamaConfig, ProbeResult } from './types.js';

export const DEFAULT_URL = 'http://localhost:11434';
export const DEFAULT_MODEL = 'llama3.2';

/**
 * Far longer than the Anthropic deadline. A local model that has to be paged
 * into memory first can take tens of seconds on its first request, and the
 * benign outcome of giving up early is a degraded run that unchecks more than
 * it needed to.
 */
export const DEFAULT_TIMEOUT_MS = 30000;

/** Trailing slashes are the most common thing people paste. */
export function normaliseUrl(url: string): string {
  return (url || DEFAULT_URL).trim().replace(/\/+$/, '');
}

export function buildRequest(payload: JudgePayload, { url, model }: Pick<OllamaConfig, 'url' | 'model'>) {
  return {
    url: `${normaliseUrl(url)}/api/chat`,
    headers: { 'content-type': 'application/json' },
    body: {
      model,
      stream: false,
      // The same schema the Anthropic tool call is constrained by.
      format: TOOL.input_schema,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(payload) },
      ],
    },
  };
}

/**
 * Ollama hands back the structured answer as a string, so this is the one
 * place a parse can fail on well-formed HTTP. A failure returns null, which
 * the caller turns into "no substance data" — never into a guess.
 */
export function parseResponse(json: unknown): JudgeRow[] | null {
  const envelope = json as { message?: { content?: unknown } } | null;
  const content = envelope?.message?.content;
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

export async function judge(payload: JudgePayload, config: OllamaConfig): Promise<JudgeRow[]> {
  if (hasNothingToJudge(payload)) return [];
  const { url, model, timeoutMs = DEFAULT_TIMEOUT_MS } = config;
  if (!model) throw new Error('no Ollama model configured');
  const impl = resolveFetch(config);

  const req = buildRequest(payload, { url, model });
  return withDeadline(timeoutMs, undefined, async (signal) => {
    const res = await impl(req.url, {
      method: 'POST',
      headers: req.headers,
      body: JSON.stringify(req.body),
      signal,
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const rows = parseResponse(await res.json());
    if (rows === null) throw new Error('Ollama returned no structured answer');
    return rows;
  });
}

/** What the server has installed, so the settings page can offer a real list. */
export function parseTags(json: unknown): string[] {
  const models = (json as { models?: unknown } | null)?.models;
  if (!Array.isArray(models)) return [];
  return models
    .map((m) => (m as { name?: unknown } | null)?.name)
    .filter((name): name is string => typeof name === 'string')
    .sort();
}

export async function probe(config: OllamaConfig): Promise<ProbeResult> {
  const { url, model, timeoutMs = 4000 } = config;
  try {
    const impl = resolveFetch(config);
    const res = await withDeadline(timeoutMs, undefined, (signal) =>
      impl(`${normaliseUrl(url)}/api/tags`, { signal })
    );
    if (!res.ok) return { ok: false, reason: 'unreachable' };
    const models = parseTags(await res.json());
    if (model && !models.includes(model)) return { ok: false, reason: 'model_missing', models };
    return { ok: true, reason: 'reachable', models };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}
