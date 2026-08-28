import test from 'node:test';
import assert from 'node:assert/strict';
import * as ollama from '../src/bg/providers/ollama.js';
import * as anthropic from '../src/bg/providers/anthropic.js';
import * as openai from '../src/bg/providers/openai.js';
import { isProviderId, isLocal, timeoutFor } from '../src/bg/providers/index.js';
import { buildPrompt, scrub } from '../src/bg/providers/shared.js';
import { TOOL, SYSTEM_PROMPT } from '../src/core/schema.js';
import { DEFAULTS, isConfigured, type Settings } from '../src/bg/settings.js';
import type { JudgePayload } from '../src/bg/providers/types.js';
import { fakeFetch } from './helpers.js';

const payload: JudgePayload = {
  moment: 'signup',
  items: [
    { id: 'a', labelText: '이용약관 동의 (필수)', mark: 'required', termsText: '서비스 제공을 위해 필요합니다.' },
    { id: 'b', labelText: '광고 수신 (선택)', mark: 'optional', termsText: '광고성 정보를 보냅니다.' },
  ],
};

const answer = (items: unknown) =>
  fakeFetch(async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify({ items }) } }) }));

// --- the question must not change with the answerer ---------------------
/**
 * Switching model must not quietly switch the question. Both providers send
 * the same items, in the same shape, under the same system prompt.
 */
test('both providers ask exactly the same thing', () => {
  const claude = anthropic.buildRequest(payload, { apiKey: 'k', model: 'm' });
  const local = ollama.buildRequest(payload, { url: ollama.DEFAULT_URL, model: 'm' });

  const claudeTurn = claude.body.messages[0]?.content;
  const localTurn = local.body.messages.find((m) => m.role === 'user')?.content;
  assert.equal(localTurn, claudeTurn);
  assert.equal(localTurn, buildPrompt(payload));

  assert.equal(claude.body.system, SYSTEM_PROMPT);
  assert.equal(local.body.messages.find((m) => m.role === 'system')?.content, SYSTEM_PROMPT);
});

test('both providers constrain the answer with the same schema', () => {
  const local = ollama.buildRequest(payload, { url: ollama.DEFAULT_URL, model: 'm' });
  assert.equal(local.body.format, TOOL.input_schema);
  assert.equal(anthropic.buildRequest(payload, { apiKey: 'k', model: 'm' }).body.tools[0], TOOL);
});

// --- ollama plumbing ---------------------------------------------------
test('a pasted URL with a trailing slash still works', () => {
  assert.equal(ollama.normaliseUrl('http://localhost:11434/'), 'http://localhost:11434');
  assert.equal(ollama.normaliseUrl('http://localhost:11434///'), 'http://localhost:11434');
  assert.equal(ollama.normaliseUrl('  http://box.local:1234  '), 'http://box.local:1234');
  assert.equal(ollama.normaliseUrl(''), ollama.DEFAULT_URL);
});

test('the request goes to the chat endpoint and does not stream', () => {
  const req = ollama.buildRequest(payload, { url: 'http://localhost:11434/', model: 'llama3.2' });
  assert.equal(req.url, 'http://localhost:11434/api/chat');
  assert.equal(req.body.stream, false);
  assert.equal(req.body.options.temperature, 0);
});

test('no API key ever appears in an Ollama request', () => {
  const req = ollama.buildRequest(payload, { url: ollama.DEFAULT_URL, model: 'm' });
  assert.deepEqual(Object.keys(req.headers), ['content-type']);
  assert.doesNotMatch(JSON.stringify(req), /api[-_]?key/i);
});

// --- parsing -----------------------------------------------------------
test('the structured answer is read out of the JSON string Ollama returns', () => {
  const rows = ollama.parseResponse({
    message: { content: JSON.stringify({ items: [{ id: 'a', substance: 'marketing', quote: 'x' }] }) },
  });
  assert.deepEqual(rows, [{ id: 'a', substance: 'marketing', quote: 'x' }]);
});

/**
 * A local model is far likelier than Claude to answer with prose, truncated
 * JSON, or the right JSON in the wrong shape. Every one of those has to become
 * "no substance data" — which unchecks — and never a guess.
 */
test('a malformed answer is no answer, never a guess', () => {
  for (const content of [
    'Sure! Here are the items:',
    '{"items": [',
    '{"items": {}}',
    '{"result": []}',
    '{"items": [{"substance": "marketing"}]}',
    '',
    '   ',
  ]) {
    assert.equal(ollama.parseResponse({ message: { content } }), null, JSON.stringify(content));
  }
  assert.equal(ollama.parseResponse(null), null);
  assert.equal(ollama.parseResponse({}), null);
  assert.equal(ollama.parseResponse({ message: { content: 42 } }), null);
});

test('judge returns the rows a healthy server sent', async () => {
  const rows = await ollama.judge(payload, {
    url: ollama.DEFAULT_URL,
    model: 'llama3.2',
    fetchImpl: answer([{ id: 'a', substance: 'unclear', quote: null }]),
  });
  assert.deepEqual(rows, [{ id: 'a', substance: 'unclear', quote: null }]);
});

test('a moment with nothing to judge makes no request at all', async () => {
  let called = false;
  const rows = await ollama.judge(
    { moment: 'signup', items: [] },
    { url: ollama.DEFAULT_URL, model: 'm', fetchImpl: fakeFetch(async () => { called = true; }) }
  );
  assert.deepEqual(rows, []);
  assert.equal(called, false);
});

test('a server error surfaces as a thrown error, never as a fake answer', async () => {
  await assert.rejects(() =>
    ollama.judge(payload, {
      url: ollama.DEFAULT_URL,
      model: 'm',
      fetchImpl: fakeFetch(async () => ({ ok: false, status: 500, text: async () => 'boom' })),
    })
  );
});

// --- the connection check ----------------------------------------------
test('installed models are read off the tags endpoint', () => {
  assert.deepEqual(
    ollama.parseTags({ models: [{ name: 'qwen3:8b' }, { name: 'llama3.2:latest' }] }),
    ['llama3.2:latest', 'qwen3:8b']
  );
  assert.deepEqual(ollama.parseTags({}), []);
  assert.deepEqual(ollama.parseTags(null), []);
});

test('a model that is not pulled is reported as missing, with the real list', async () => {
  const result = await ollama.probe({
    url: ollama.DEFAULT_URL,
    model: 'not-pulled',
    fetchImpl: fakeFetch(async () => ({ ok: true, json: async () => ({ models: [{ name: 'llama3.2' }] }) })),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'model_missing');
  assert.deepEqual(result.models, ['llama3.2']);
});

test('a server that is not running is reported as unreachable, not as a crash', async () => {
  const result = await ollama.probe({
    url: ollama.DEFAULT_URL,
    model: 'llama3.2',
    fetchImpl: fakeFetch(async () => { throw new Error('ECONNREFUSED'); }),
  });
  assert.deepEqual(result, { ok: false, reason: 'unreachable' });
});

test('a rejected Anthropic key is reported as unauthorized', async () => {
  const result = await anthropic.probe({
    apiKey: 'sk-ant-bad',
    model: 'm',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 401, text: async () => 'nope' })),
  });
  assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
});

test('an empty Anthropic key needs no request to be wrong', async () => {
  let called = false;
  const result = await anthropic.probe({
    apiKey: '',
    model: 'm',
    fetchImpl: fakeFetch(async () => { called = true; }),
  });
  assert.equal(result.reason, 'unauthorized');
  assert.equal(called, false);
});

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...over });

// --- selection ---------------------------------------------------------
test('only the providers we ship are accepted', () => {
  assert.equal(isProviderId('ollama'), true);
  assert.equal(isProviderId('anthropic'), true);
  assert.equal(isProviderId('openai'), true);
  assert.equal(isProviderId('gemini'), false);
  assert.equal(isProviderId(undefined), false);
});

test('what counts as local is the address, not the provider name', () => {
  assert.equal(isLocal(settings({ provider: 'ollama' })), true);
  assert.equal(isLocal(settings({ provider: 'anthropic' })), false);
  assert.equal(isLocal(settings({ provider: 'openai' })), false);
  assert.equal(
    isLocal(settings({ provider: 'openai', openaiUrl: 'http://localhost:1234/v1' })),
    true,
    'LM Studio on this machine sends nothing anywhere'
  );
  assert.equal(
    isLocal(settings({ provider: 'openai', openaiUrl: 'http://127.0.0.1:8000/v1' })),
    true
  );
});

/**
 * A local model being paged into memory takes far longer than a network round
 * trip, and giving up early throws away an answer that was on its way.
 */
test('a local model is given far longer than a network call', () => {
  assert.ok(
    timeoutFor(settings({ provider: 'ollama' })) >
      timeoutFor(settings({ provider: 'anthropic' })) * 4
  );
  assert.ok(
    timeoutFor(settings({ provider: 'openai', openaiUrl: 'http://localhost:1234/v1' })) >
      timeoutFor(settings({ provider: 'openai' })),
    'the same provider gets more time when it is pointed at this machine'
  );
});

// --- configuration -----------------------------------------------------
test('Ollama needs no key, so a missing key is not a misconfiguration', () => {
  assert.equal(isConfigured(settings({ provider: 'ollama', apiKey: '' })), true);
  assert.equal(isConfigured(settings({ provider: 'anthropic', apiKey: '' })), false);
  assert.equal(isConfigured(settings({ provider: 'anthropic', apiKey: 'sk-ant-x' })), true);
});

test('Ollama without a model is a misconfiguration', () => {
  assert.equal(isConfigured(settings({ provider: 'ollama', ollamaModel: '' })), false);
  assert.equal(isConfigured(settings({ provider: 'ollama', ollamaUrl: '' })), false);
});

test('each provider keeps its own model, so switching back loses nothing', async () => {
  assert.notEqual(DEFAULTS.model, DEFAULTS.ollamaModel);
  assert.ok(DEFAULTS.model.startsWith('claude-'));
});

// --- secrets -----------------------------------------------------------
test('a key never survives into an error message', () => {
  assert.doesNotMatch(scrub('invalid x-api-key: sk-ant-secret', 'sk-ant-secret'), /secret/);
  assert.doesNotMatch(scrub('leaked sk-ant-abc123DEF'), /abc123DEF/);
});

// --- the OpenAI-compatible shape ---------------------------------------
const chat = (items: unknown) =>
  fakeFetch(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ items }) } }] }),
  }));

test('all three providers ask exactly the same thing', () => {
  const req = openai.buildRequest(payload, { url: openai.DEFAULT_URL, apiKey: 'k', model: 'm' });
  assert.equal(req.body.messages.find((m) => m.role === 'user')?.content, buildPrompt(payload));
  assert.equal(req.body.messages.find((m) => m.role === 'system')?.content, SYSTEM_PROMPT);
});

test('the strict schema is the same object the tool call is bound by', () => {
  const req = openai.buildRequest(payload, { url: openai.DEFAULT_URL, apiKey: 'k', model: 'm' });
  const format = req.body.response_format as {
    type: string;
    json_schema: { name: string; strict: boolean; schema: unknown };
  };
  assert.equal(format.type, 'json_schema');
  assert.equal(format.json_schema.strict, true);
  assert.equal(format.json_schema.schema, TOOL.input_schema);
  assert.equal(format.json_schema.name, TOOL.name);
});

test('the base URL is normalised and the path is the spec path', () => {
  assert.equal(
    openai.buildRequest(payload, { url: 'http://localhost:1234/v1/', apiKey: '', model: 'm' }).url,
    'http://localhost:1234/v1/chat/completions'
  );
  assert.equal(openai.normaliseUrl(''), openai.DEFAULT_URL);
});

/** A server on this machine normally has no key, and must not be sent one. */
test('no Authorization header is sent when there is no key', () => {
  const local = openai.buildRequest(payload, { url: 'http://localhost:1234/v1', apiKey: '', model: 'm' });
  assert.deepEqual(Object.keys(local.headers), ['content-type']);
  const hosted = openai.buildRequest(payload, { url: openai.DEFAULT_URL, apiKey: 'sk-x', model: 'm' });
  assert.equal(hosted.headers.authorization, 'Bearer sk-x');
});

test('the answer is read out of the first choice', () => {
  assert.deepEqual(
    openai.parseResponse({
      choices: [{ message: { content: JSON.stringify({ items: [{ id: 'a', substance: 'marketing', quote: 'x' }] }) } }],
    }),
    [{ id: 'a', substance: 'marketing', quote: 'x' }]
  );
});

test('a malformed OpenAI answer is no answer, never a guess', () => {
  for (const content of ['not json', '{"items": [', '{"items": {}}', '{"choices": []}', '']) {
    assert.equal(openai.parseResponse({ choices: [{ message: { content } }] }), null, content);
  }
  assert.equal(openai.parseResponse(null), null);
  assert.equal(openai.parseResponse({ choices: [] }), null);
});

/**
 * Plenty of OpenAI-compatible servers predate structured outputs and reject
 * the field outright. Falling back to plain JSON mode is what makes "any
 * OpenAI-spec server" true rather than aspirational, and it is safe: a reply
 * in the wrong shape parses to nothing, and decide.ts still has to find the
 * quote in the terms text.
 */
test('a server that rejects json_schema is retried in plain JSON mode', async () => {
  const seen: string[] = [];
  const rows = await openai.judge(payload, {
    url: 'http://localhost:1234/v1',
    apiKey: '',
    model: 'm',
    fetchImpl: fakeFetch(async (_url: unknown, init: unknown) => {
      const body = JSON.parse((init as { body: string }).body) as {
        response_format: { type: string };
      };
      seen.push(body.response_format.type);
      if (body.response_format.type === 'json_schema') {
        return { ok: false, status: 400, text: async () => 'unknown field response_format.json_schema' };
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"items":[{"id":"a","substance":"unclear","quote":null}]}' } }] }),
      };
    }),
  });
  assert.deepEqual(seen, ['json_schema', 'json_object']);
  assert.deepEqual(rows, [{ id: 'a', substance: 'unclear', quote: null }]);
});

test('a genuine error is not mistaken for an unsupported format', async () => {
  let calls = 0;
  await assert.rejects(() =>
    openai.judge(payload, {
      url: openai.DEFAULT_URL,
      apiKey: 'sk-x',
      model: 'm',
      fetchImpl: fakeFetch(async () => {
        calls++;
        return { ok: false, status: 401, text: async () => 'invalid api key' };
      }),
    })
  );
  assert.equal(calls, 1, 'a rejected key must not be retried');
});

test('judge returns the rows a healthy OpenAI-compatible server sent', async () => {
  const rows = await openai.judge(payload, {
    url: openai.DEFAULT_URL,
    apiKey: 'sk-x',
    model: 'm',
    fetchImpl: chat([{ id: 'a', substance: 'marketing', quote: 'x' }]),
  });
  assert.deepEqual(rows, [{ id: 'a', substance: 'marketing', quote: 'x' }]);
});

test('models are read off the spec /models endpoint', () => {
  assert.deepEqual(
    openai.parseModels({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1' }] }),
    ['gpt-4.1', 'gpt-4o-mini']
  );
  assert.deepEqual(openai.parseModels({}), []);
});

/** Some gateways answer /models with a filtered or empty list. */
test('an empty model list is not evidence the model is missing', async () => {
  const result = await openai.probe({
    url: 'https://gateway.example/v1',
    apiKey: 'sk-x',
    model: 'anything',
    fetchImpl: fakeFetch(async () => ({ ok: true, json: async () => ({ data: [] }) })),
  });
  assert.equal(result.ok, true);
});

test('a rejected OpenAI key is reported as unauthorized', async () => {
  const result = await openai.probe({
    url: openai.DEFAULT_URL,
    apiKey: 'sk-bad',
    model: 'm',
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 401, json: async () => ({}) })),
  });
  assert.deepEqual(result, { ok: false, reason: 'unauthorized' });
});

test('an OpenAI-compatible server needs no key to count as configured', () => {
  assert.equal(isConfigured(settings({ provider: 'openai', openaiKey: '' })), true);
  assert.equal(isConfigured(settings({ provider: 'openai', openaiModel: '' })), false);
});
