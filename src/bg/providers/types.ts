/**
 * providers/types.ts — the contract every substance judge answers to.
 *
 * A provider's only job is to turn a JudgePayload into JudgeRow[]. It decides
 * nothing: the verbatim-quote check in decide.ts runs afterwards regardless of
 * which one answered, so a weaker local model lowers the hit rate but cannot
 * make an unsafe decision. An answer it cannot support with a quote from the
 * terms text degrades to `unclear`, which unchecks.
 */

import type { MomentKind, SubstanceReport } from '../../core/types.js';

export type ProviderId = 'anthropic' | 'openai' | 'ollama';

/** One item as it leaves the page. Only these four fields ever travel. */
export interface JudgeItem {
  id: string;
  labelText: string;
  mark: string;
  termsText: string | null;
}

export interface JudgePayload {
  moment: MomentKind;
  items: JudgeItem[];
}

export interface JudgeRow extends SubstanceReport {
  id: string;
}

export interface Transport {
  fetchImpl?: typeof fetch | null;
  timeoutMs?: number;
}

export interface AnthropicConfig extends Transport {
  apiKey: string;
  model: string;
}

/**
 * Anything speaking the OpenAI Chat Completions shape: OpenAI itself, but also
 * LM Studio, vLLM, llama.cpp, OpenRouter, Groq, Together, LiteLLM. One provider
 * for all of them, because the wire format is the same.
 */
export interface OpenAiConfig extends Transport {
  /** Base URL including the version segment, no trailing slash. */
  url: string;
  /** Optional: a local server usually wants no key at all. */
  apiKey: string;
  model: string;
}

export interface OllamaConfig extends Transport {
  /** Base URL of the Ollama server, no trailing slash. */
  url: string;
  model: string;
}

/** The outcome of a settings-page connection check. */
export interface ProbeResult {
  ok: boolean;
  /** A key the options page renders, never raw provider prose. */
  reason: 'reachable' | 'unreachable' | 'unauthorized' | 'model_missing' | 'failed';
  /** Models the server reports having, when it will say. */
  models?: string[];
}
