[← README](../README.md)

# Architecture

## Why this is tractable

Korean consent forms print the answer. Every item is marked **required**
(`필수`) or **optional** (`선택`), and refusing an optional item may not cost
you the service. The answer key is already on the page.

That convention started with personal-data consent — article 22 of the Personal
Information Protection Act requires it, and forbids denying service over a
refused optional item — but it did not stay there. KRDS carried it into
government services, and industry practice carried it everywhere else. Today a
Korean signup form marks its terms of service, its electronic-funds-transfer
terms and its marketing consent the same way, and those are governed by
entirely different law, or by contract law and no privacy statute at all.

**Agreedee reads the convention, not a statute.** That is why it works across
signup, checkout, event entry, re-consent, account linking and identity
verification alike: in the golden set, only a quarter of the items are
personal-data consent. It is also why a finding says only *"no required/optional
mark printed"* and stops there. Which law governs an item depends on what the
item is, and a printed mark does not say — so the extension reports what it saw
and leaves the citation to someone who knows which statute applies.

So Agreedee does not ask an AI whether a consent is unfair. It parses the
printed mark deterministically, and uses Claude for exactly one narrow job:
checking whether the **substance** of the linked terms text **contradicts** the
printed label. The KRDS select-all rule —

> If even one individual item is left at "do not agree", the select-all
> checkbox must stay unchecked.

— translated here, and verified in code with no AI at all.

---

## Modules

TypeScript, compiled by `tsc` to one `.js` per `.ts`. No bundler, no framework.
Import specifiers already named the emitted file, so nothing changed about how
Chrome loads it; `moduleResolution: NodeNext` now enforces that they keep doing
so. The same modules run in Chrome and under `node --test`, which is what makes
the golden set a test of the shipped code rather than of a copy of it.

```
src/core/     types.ts      the vocabulary, as closed literal unions
              labels.ts     required/optional/no-mark parsing  no AI, no DOM
              selectall.ts  KRDS select-all rule               no AI, no DOM
              decide.ts     the check/uncheck decision         no AI, no DOM
              context.ts    moment + regime classification     no AI, no DOM
              schema.ts     the only shape Claude may answer
              pipeline.ts   composition used by both the extension and the scorer
src/i18n/     index.ts      locale resolution and t()
              messages.ko.ts  the catalogue, and the source of truth for keys
              messages.en.ts  typed against it, so a gap fails the build
              findings.ts   which message describes a finding, given the regime
src/content/  observe.ts    MutationObserver, debounced 200ms, fingerprinted
              extract.ts    DOM → ConsentItem[]
              terms.ts      one short prefetch per item, failure ⇒ unavailable
              apply.ts      the only module that writes to the page
              badge.ts      Shadow DOM, textContent only
              badge-style.ts  its stylesheet
              run.ts        one moment, end to end
              main.ts       wiring
              boot.js       the one file that is NOT compiled: it is registered
                            as a classic content script, and tsc would mark it
                            as a module with `export {}`
src/bg/       providers/    one batched request per moment
                anthropic.ts  Messages API, forced tool call, 4s
                openai.ts     /chat/completions, strict json_schema with one
                              json_object retry; local or not by URL
                ollama.ts     /api/chat with the same JSON schema, 30s
                shared.ts     the prompt and the redaction, shared on purpose
                index.ts      which one answers
              menu.ts       the right-click entry point and what it reports
              messages.ts   the whole message protocol, types only
              service_worker.ts, settings.ts
```

### Decisions worth knowing about

- **`decide()` has a third action, `leave`.** S4 forbids checking a required
  box without a verbatim quote; S5 forbids unchecking one in degraded mode.
  Both are satisfiable only if "do nothing" is expressible, so it is.
- **The S3 gate lives in two places.** `decide()` refuses to emit `check` in a
  payment context, and `canAutoApply()` refuses to apply anything at all. The
  first is the guarantee; the second is the behaviour.
- **The verbatim quote is verified in code**, after Claude answers, by
  substring match on the terms text (whitespace-normalised). A quote Claude
  invented cannot survive it, and a failed match downgrades the item to
  `unclear` → unchecked.
- **Select-all is applied first**, then the individual items, so a site's own
  cascade handler runs before the corrections rather than after. A second pass
  fixes drift; a third is not attempted.
- **A select-all is never checked**, only unchecked.
- **Marks are never inherited across another checkbox.** When looking outward
  from an item for its required/optional mark, any block containing another
  checkbox is skipped, and the walk stops at the form/dialog boundary.
- **Non-consent checkboxes are left alone** — "remember my ID", "keep me signed
  in" and their Korean equivalents are not consent controls and are never
  touched. The English gate is deliberately narrow for the same reason.
- **`chrome.i18n` is not used at runtime.** It resolves against the browser's UI
  language and an extension cannot override it, which would hand an English
  badge to a Korean reader whose Chrome happens to be in English. `_locales`
  still carries the manifest name and description, which have no other
  mechanism.
- **The options page holds no copy.** Every visible string carries a
  `data-i18n` key, so switching language repaints the page rather than leaving
  one line behind. Language names stay as endonyms.

### Known weak spots

- A section heading like "enter the required details" that is *about form
  fields* and sits near consent items could be read as a mark. The damage is
  bounded: an item wrongly read as required still needs `service_essential` plus
  a verbatim quote before anything gets checked, and in degraded mode it is
  merely left alone.
- Several select-all controls in one form all aggregate over the same item set;
  section-scoped select-alls are not modelled. The failure direction is safe
  (a select-all is only ever unchecked).
- Moment classification is keyword-based. A signup page on a shopping site that
  talks about payment will be treated as checkout and go badge-only — annoying,
  and the direction S3 asks for.
- **Moment keywords are still Korean only.** An English page matches on its URL
  or not at all, so most classify as `other` and go badge-only. That is the safe
  direction, but it means `intl` is mostly a reporting mode today.

---

## Two axes: regime and locale

These are separate settings and must not be collapsed into one.

| | Decides | Comes from |
|---|---|---|
| **regime** (`kr` \| `intl`) | which law we judge and accuse under | the **page** |
| **locale** (`ko` \| `en`) | which language we speak to the user | the **user** |

All four combinations are real. An English reader signing up on a Korean site
gets Korean marking findings in English; a Korean reader on a US site gets
GDPR-shaped findings in Korean.

**The printed marks are not translated away.** `필수` and `선택` are quotations
of what is on the page, so the English copy keeps the characters: `no 필수/선택
mark printed`. Translating them would leave the reader unable to find what we
are pointing at on screen.

### How regime is decided

From `html[lang]`, the host, and the Hangul ratio of the page text — **never**
from whether a mark was found. "No mark means this is not a Korean page" is the
tempting rule and it would be fatal: `missing_mark` *is* the finding that a
Korean form left an item unmarked, and routing unmarked pages to `intl` would
mean it could never fire again.

Detection leans toward `kr`, because the two misdetections are not equally
costly. An English page read as `kr` shows findings that do not apply — wrong,
but visible. A Korean page read as `intl` silently stops reporting the violation
this extension exists to catch. When detection is wrong, the badge offers a
switch, remembered per domain.

### What changes under `intl`

| Situation | `kr` | `intl` |
|---|---|---|
| authoritative signal | the printed mark | quote-verified substance |
| no mark + proven `service_essential` | uncheck (the missing mark *is* the violation) | **leave** |
| no mark + anything else | uncheck | uncheck |
| no mark, on its own | `missing_mark` | not a finding — nothing requires one |
| auto-apply without verified substance | yes, the mark carries it | **no**, report only |

S2 is intact: `intl` spares a box only when Claude returned a substance that
survived verbatim-quote verification. Doubt still unchecks.

The last row is the one that matters most. Abroad there is no printed mark, so
substance is all the evidence there is — and terms text behind a cross-origin
link fails to prefetch routinely, which looks exactly like "not required".
Acting on that would strip a mandatory terms box and block the signup.

---

## What it cannot do

- **Canvas- or image-rendered consent UI.** If there is no `<input
  type="checkbox">`, there is nothing to read or set.
- **Cross-origin iframes.** The content script runs in the top frame only
  (`all_frames: false`); consent UI inside a third-party iframe is invisible to
  it.
- **Login-gated or JS-rendered terms.** If the terms body is behind a link that
  needs a session, or is drawn after a click, the prefetch fails → the item is
  marked `unavailable` → it is unchecked (S2).
- **Sites that re-check boxes on submit.** Agreedee re-applies once and then
  reports the item as unresolved rather than fighting the page forever.
- **Deciding whether a consent is lawful.** It reports what the page printed and
  what the terms said. It is not legal advice.

---
