/**
 * messages.en.ts — English catalogue.
 *
 * The marks `필수` and `선택` survive translation on purpose: they are
 * quotations of what is printed on the page, and an English reader looking for
 * the mark still has to find those characters on screen.
 */

import type { Messages } from './index.js';

export const en: Messages = {
  'reason.optional_mark': 'marked 선택 (optional)',
  'reason.no_mark': 'no 필수/선택 mark printed',
  'reason.substance_contradicts_label': 'marked 필수, but the terms are marketing or third-party sharing',
  'reason.selectall_inconsistent': 'disagrees with the individual items',
  'reason.quote_not_verbatim': 'no supporting sentence found in the terms',
  'reason.terms_unavailable': 'could not read the terms text',
  'reason.substance_unclear': 'could not judge the terms',
  'reason.substance_unknown': 'could not judge the terms',
  'reason.quote_missing': 'could not judge the terms',
  'reason.disabled': 'the site blocks changes to this box',

  // No statute is cited: which law governs an item depends on what the item
  // is, and that is not something a printed mark tells us. See messages.ko.ts.
  'flag.missing_mark': 'no 필수/선택 mark printed',
  'flag.prechecked_optional': 'an optional item was pre-ticked',
  'flag.label_substance_mismatch': 'the mark contradicts the terms',
  'flag.selectall_violation': 'KRDS bulk-consent rule violated',

  'reason.intl.no_mark': 'not proven to be required',
  'flag.intl.prechecked_optional': 'already ticked before you arrived',
  'flag.intl.selectall_violation': 'bulk consent hides the individual choices',

  'moment.signup': 'sign-up',
  'moment.payment': 'checkout',
  'moment.entry': 'event entry',
  'moment.reconsent': 're-consent',
  'moment.link': 'account linking',
  'moment.verify': 'identity check',
  'moment.other': 'consent',

  'badge.headline.pending': '{count} optional items can be turned off',
  'badge.headline.done': 'Turned off {count} optional items',
  'badge.headline.findings': '{count} marking problems',
  'badge.headline.refused': 'Consent request refused',
  'badge.headline.banner': 'This page is asking for consent',
  'badge.banner.refused': 'Pressed “{label}” on the banner.',
  'badge.banner.found': 'No control here provably refuses, so nothing was pressed. Have a look.',
  'badge.section.pending': 'Can be turned off',
  'badge.section.done': 'Turned off',
  'badge.section.findings': 'Marking problems',
  'badge.unnamedItem': '(unlabelled item)',
  'badge.degraded': 'No API key, so this used the printed marks alone.',
  'badge.manualOnly': 'Nothing is changed automatically on a {moment} screen.',
  'badge.apply': 'Turn them off',
  'badge.regime.kr': 'Korean law',
  'badge.regime.intl': 'international',
  'badge.regime.switchTo': 'View as {regime}',
  'badge.reportOnly.intl':
    'Outside Korea nothing is marked 필수, so nothing is changed automatically. Review, then press.',

  'menu.root': 'Agreedee',
  'menu.root.none': 'Agreedee — no consent items on this page',
  'menu.root.done': 'Agreedee — turned off {count} of {items} consent items',
  'menu.root.pending': 'Agreedee — {items} consent items, {count} can be turned off',
  'menu.rescan': 'Re-check this page',
  'menu.regime.header': 'How this page is judged',
  'menu.regime.kr': 'Korea · the printed 필수/선택 mark',
  'menu.regime.intl': 'Elsewhere · the terms text (GDPR-style)',
  'menu.options': 'Open settings',

  'options.title': 'Agreedee settings',
  'options.tagline': 'Refuses optional consent in cookie banners and consent forms. It never presses submit.',
  'options.provider': 'Judgement engine',
  'options.provider.anthropic': 'Anthropic (Claude)',
  'options.provider.anthropic.why': 'Most accurate · needs an API key · terms text leaves your machine',
  'options.provider.openai': 'OpenAI-compatible',
  'options.provider.openai.why': 'OpenAI, LM Studio, vLLM, OpenRouter … · just change the address',
  'options.openai.url': 'Server address',
  'options.openai.urlHint':
    'Anything speaking the OpenAI spec. LM Studio is http://localhost:1234/v1, vLLM is ' +
    'http://localhost:8000/v1. Include the version segment (/v1).',
  'options.openai.key': 'API key (leave empty for a server on this machine)',
  'options.openai.model': 'Model',
  'options.openai.modelHint':
    'Press Test connection to list what the server offers. A server without structured output ' +
    'gets one automatic retry in plain JSON mode.',
  'options.openai.note.title': 'What is sent depends on the address',
  'options.openai.note.body':
    "Label text and terms text go to the server you name. Point it at localhost and nothing " +
    'leaves this machine; point it at a hosted service and it goes there. For any address other ' +
    'than the default (api.openai.com), Chrome asks your permission for that domain when you save.',
  'options.hostDenied': 'Not saved: access to that address was not granted',
  'options.provider.ollama': 'Ollama (this computer)',
  'options.provider.ollama.why': 'No key · nothing leaves your machine · accuracy depends on the model',
  'options.ollama.url': 'Ollama address',
  'options.ollama.model': 'Model',
  'options.ollama.modelHint':
    'Press Test connection to list the models you have installed. It must be one that supports ' +
    'structured output (a JSON schema).',
  'options.ollama.privacy.title': 'Nothing leaves your machine',
  'options.ollama.privacy.body':
    'With Ollama, label text and terms text go only to the Ollama server on this computer. No ' +
    'account, no key, no outbound request. Local models do judge less well than Claude — but an ' +
    'answer whose quote cannot be found in the terms text is discarded and the item is unchecked, ' +
    'so a weaker model costs recall, never safety.',
  'options.probe': 'Test connection',
  'options.probe.running': 'Checking…',
  'options.probe.ok': 'Connected',
  'options.probe.unreachable': 'Could not reach the server',
  'options.probe.unauthorized': 'That API key was rejected',
  'options.probe.modelMissing': 'That model was not found',
  'options.probe.failed': 'The check failed',
  'options.apiKey': 'Anthropic API key',
  'options.model': 'Model',
  'options.modelDefaultSuffix': '(default)',
  'options.language': 'Display language',
  'options.language.auto': 'Follow the browser',
  'options.enabled': 'Enabled',
  'options.save': 'Save',
  'options.saved': 'Saved',
  'options.noKey.title': 'It works without a key',
  'options.noKey.body':
    'With no key, judgements come only from the 필수/선택 marks printed on the page and the ' +
    'KRDS bulk-consent rule. Nothing leaves your browser in this mode.',
  'options.whatIsSent.title': 'What is sent when you add a key',
  'options.whatIsSent.body':
    "Each consent item's label text and its terms text are sent to the Anthropic API with your " +
    'own key, to check whether the printed mark matches what the terms actually say. The page ' +
    'itself and anything you typed are never sent. The key is stored only in this browser via ' +
    'chrome.storage.local and is never shipped with the extension.',
};
