/**
 * service_worker.ts — the background end of both message paths.
 *
 * Judging: one batched Claude call per consent moment. Every failure path
 * answers {ok:false}, which the content script treats as "no substance data"
 * and the deterministic core already handles (S5).
 *
 * Status: each content script reports what it found, so the context menu can
 * say something true about the current tab.
 */

import { getSettings, isConfigured } from './settings.js';
import { judge, probe } from './providers/index.js';
import { buildMenu, installMenuHandlers, rememberStatus } from './menu.js';
import type { JudgeResponse, ProbeResponse, ToBackground } from './messages.js';

chrome.runtime.onInstalled.addListener(() => void buildMenu());
chrome.runtime.onStartup.addListener(() => void buildMenu());
installMenuHandlers();

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender,
    sendResponse: (response: JudgeResponse | ProbeResponse) => void
  ) => {
    const incoming = message as ToBackground | null;
    if (!incoming) return false;

    if (incoming.type === 'agreedee:status') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) void rememberStatus(tabId, incoming.status);
      return false;
    }

    if (incoming.type === 'agreedee:probe') {
      void (async () => sendResponse(await probe(await getSettings())))();
      return true;
    }

    if (incoming.type !== 'agreedee:judge') return false;

    void (async () => {
      try {
        const settings = await getSettings();
        if (!settings.enabled) return sendResponse({ ok: false, reason: 'disabled' });
        // Ollama needs no key, so "unconfigured" is provider-specific.
        if (!isConfigured(settings)) return sendResponse({ ok: false, reason: 'not_configured' });
        const rows = await judge(incoming.payload, settings);
        sendResponse({ ok: true, rows });
      } catch (error) {
        // The message is already scrubbed of anything key-shaped.
        const reason = error instanceof Error ? error.message : 'failed';
        sendResponse({ ok: false, reason: reason || 'failed' });
      }
    })();

    return true; // keep the channel open for the async reply
  }
);
