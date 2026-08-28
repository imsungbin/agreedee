import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBSTANCES, TOOL, SYSTEM_PROMPT } from '../src/core/schema.js';
import { buildRequest, parseResponse, judge } from '../src/bg/providers/anthropic.js';
import type { JudgePayload } from '../src/bg/providers/types.js';
import { fakeFetch } from './helpers.js';

const payload: JudgePayload = {
  moment: 'signup',
  items: [
    { id: 'a', labelText: '이용약관 동의 (필수)', mark: 'required', termsText: '서비스 제공을 위해 필요합니다.' },
    { id: 'b', labelText: '광고 수신 (선택)', mark: 'optional', termsText: '광고성 정보를 보냅니다.' },
  ],
};

test('the schema offers exactly the substances decide.js understands', () => {
  assert.deepEqual(SUBSTANCES, ['service_essential', 'marketing', 'third_party_sharing', 'unclear']);
  assert.deepEqual(TOOL.input_schema.properties.items.items.properties.substance.enum, SUBSTANCES);
});

test('the schema demands a quote field that may be null', () => {
  const item = TOOL.input_schema.properties.items.items;
  assert.deepEqual(item.required.slice().sort(), ['id', 'quote', 'substance']);
  assert.deepEqual(item.properties.quote.type, ['string', 'null']);
});

test('the prompt keeps the instructions that make the answer safe', () => {
  assert.match(SYSTEM_PROMPT, /verbatim/i);
  assert.match(SYSTEM_PROMPT, /unclear/);
  assert.match(SYSTEM_PROMPT, /Never invent text/i);
  assert.match(SYSTEM_PROMPT, /Do not reason from legal knowledge/i);
});

test('the request forces the tool and never puts the key in the URL', () => {
  const req = buildRequest(payload, { apiKey: 'sk-ant-secret', model: 'claude-sonnet-4-5' });
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
  assert.doesNotMatch(req.url, /secret/);
  assert.equal(req.headers['x-api-key'], 'sk-ant-secret');
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.body.model, 'claude-sonnet-4-5');
  assert.deepEqual(req.body.tool_choice, { type: 'tool', name: TOOL.name });
  assert.equal(req.body.tools[0].name, TOOL.name);
});

test('one batched request carries every item of the moment', () => {
  const req = buildRequest(payload, { apiKey: 'k', model: 'm' });
  assert.equal(req.body.messages.length, 1);
  const text = req.body.messages[0].content;
  assert.match(text, /이용약관 동의 \(필수\)/);
  assert.match(text, /광고 수신 \(선택\)/);
});

test('parseResponse reads the tool input', () => {
  const rows = parseResponse({
    content: [
      { type: 'text', text: 'here you go' },
      {
        type: 'tool_use',
        name: TOOL.name,
        input: { items: [{ id: 'a', substance: 'marketing', quote: '광고성 정보를 보냅니다.' }] },
      },
    ],
  });
  assert.deepEqual(rows, [{ id: 'a', substance: 'marketing', quote: '광고성 정보를 보냅니다.' }]);
});

test('parseResponse refuses free text — a prose answer is not an answer', () => {
  assert.equal(parseResponse({ content: [{ type: 'text', text: 'the first one is essential' }] }), null);
  assert.equal(parseResponse({}), null);
  assert.equal(parseResponse(null), null);
  assert.equal(parseResponse({ content: [{ type: 'tool_use', name: 'other', input: {} }] }), null);
});

test('judgeSubstance returns rows on success', async () => {
  const fetchImpl = fakeFetch(async () => ({
    ok: true,
    json: async () => ({
      content: [{ type: 'tool_use', name: TOOL.name, input: { items: [{ id: 'a', substance: 'unclear', quote: null }] } }],
    }),
  }));
  const rows = await judge(payload, { apiKey: 'k', model: 'm', fetchImpl });
  assert.deepEqual(rows, [{ id: 'a', substance: 'unclear', quote: null }]);
});

test('S5: an API error surfaces as a thrown error, never as a fake answer', async () => {
  const fetchImpl = fakeFetch(async () => ({ ok: false, status: 401, text: async () => 'unauthorized' }));
  await assert.rejects(() => judge(payload, { apiKey: 'bad', model: 'm', fetchImpl }));
});

test('S5: no API key means no request is made at all', async () => {
  let called = false;
  await assert.rejects(() =>
    judge(payload, {
      apiKey: '',
      model: 'm',
      fetchImpl: fakeFetch(async () => { called = true; }),
    })
  );
  assert.equal(called, false);
});

test('the error message never contains the API key', async () => {
  const fetchImpl = fakeFetch(async () => ({
    ok: false,
    status: 401,
    text: async () => 'invalid x-api-key: sk-ant-secret',
  }));
  const error = await judge(payload, { apiKey: 'sk-ant-secret', model: 'm', fetchImpl }).catch((e: unknown) => e);
  assert.doesNotMatch(String((error as Error).message), /sk-ant-secret/);
});

test('a moment with no judgeable items short-circuits without a request', async () => {
  let called = false;
  const rows = await judge(
    { moment: 'signup', items: [] },
    { apiKey: 'k', model: 'm', fetchImpl: fakeFetch(async () => { called = true; }) }
  );
  assert.deepEqual(rows, []);
  assert.equal(called, false);
});
