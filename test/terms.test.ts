import test from 'node:test';
import assert from 'node:assert/strict';
import { prefetchTerms } from '../src/content/terms.js';
import type { TermsCarrier } from '../src/core/types.js';
import { fakeFetch } from './helpers.js';

type Fixture = TermsCarrier & { id: string };

const item = (over: Partial<Fixture> = {}): Fixture => ({
  id: 'i1',
  termsText: null,
  termsUrl: 'https://x.test/a',
  termsSource: 'unavailable',
  ...over,
});

/** A fetch stand-in. Only `ok`, `status` and `text()` are ever read. */
const ok = (body: string) =>
  (async () => ({ ok: true, status: 200, text: async () => body })) as unknown as typeof fetch;

const HTML = '<html><body><h1>이용약관</h1><p>서비스 제공을 위하여 필요한 최소한의 정보를 수집합니다.</p><script>var a=1</script></body></html>';

test('fetches the linked terms and stores the text', async () => {
  const items = [item()];
  await prefetchTerms(items, { fetchImpl: ok(HTML), cache: new Map() });
  assert.equal(items[0].termsSource, 'prefetched');
  assert.match(items[0].termsText ?? '', /서비스 제공을 위하여 필요한 최소한의 정보를 수집합니다/);
  assert.doesNotMatch(items[0].termsText ?? '', /var a=1/, 'script content is not terms text');
});

test('makes at most one request per item and caches by URL', async () => {
  let calls = 0;
  const fetchImpl = fakeFetch(async () => { calls++; return { ok: true, status: 200, text: async () => HTML }; });
  const cache = new Map();
  const items = [item({ id: 'a' }), item({ id: 'b' })];
  await prefetchTerms(items, { fetchImpl, cache });
  await prefetchTerms([item({ id: 'c' })], { fetchImpl, cache });
  assert.equal(calls, 1);
});

test('leaves the item unavailable when the request fails', async () => {
  const items = [item()];
  await prefetchTerms(items, { fetchImpl: async () => { throw new Error('network'); }, cache: new Map() });
  assert.equal(items[0].termsSource, 'unavailable');
  assert.equal(items[0].termsText, null);
});

test('leaves the item unavailable on a non-OK response', async () => {
  const items = [item()];
  await prefetchTerms(items, {
    fetchImpl: fakeFetch(async () => ({ ok: false, status: 403, text: async () => 'nope' })),
    cache: new Map(),
  });
  assert.equal(items[0].termsSource, 'unavailable');
});

test('gives up on a slow response instead of blocking the page', async () => {
  const items = [item()];
  const fetchImpl = fakeFetch((_url: unknown, opts: unknown) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve({ ok: true, status: 200, text: async () => HTML }), 1000);
      const { signal } = opts as { signal: AbortSignal };
      signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
    })
  );
  const started = Date.now();
  await prefetchTerms(items, { fetchImpl, cache: new Map(), timeoutMs: 30 });
  assert.equal(items[0].termsSource, 'unavailable');
  assert.ok(Date.now() - started < 500);
});

test('never touches items that already have inline terms', async () => {
  let calls = 0;
  const items = [item({ termsText: '이미 있는 약관 본문', termsSource: 'inline' })];
  await prefetchTerms(items, {
    fetchImpl: fakeFetch(async () => { calls++; return { ok: true, text: async () => HTML }; }),
    cache: new Map(),
  });
  assert.equal(calls, 0);
  assert.equal(items[0].termsSource, 'inline');
});

test('ignores items with no terms link at all', async () => {
  const items = [item({ termsUrl: null })];
  await prefetchTerms(items, { fetchImpl: async () => { throw new Error('should not run'); }, cache: new Map() });
  assert.equal(items[0].termsSource, 'unavailable');
});
