[← README](../README.md)

# Safety contract

These are not preferences. Each one is an automated test.

| | Rule | Where it is tested |
|---|---|---|
| **S1a** | Never submit a form, and never press a submit, continue or accept control. | `test/safety.test.ts` (static: no `.submit(` anywhere in `src/`), plus a spy over every golden-set fixture in `test/goldenset.test.ts`, `test/apply.test.ts`, `test/run.test.ts` |
| **S1b** | A control may be pressed only when its own label proves it *reduces* consent, and only when the element itself cannot submit. Pressing lives in `activate.ts` and nowhere else. | `test/controls.test.ts`, `test/banner.test.ts`, and a static check that `.click(` appears in exactly one file, guarded |
| **S2** | When uncertain, uncheck. Ambiguous label, unreachable terms, unquotable answer → unchecked. | `test/decide.test.ts` |
| **S3** | Payment flows: detect and report, never act. Uncertain flow is treated as payment. | `test/context.test.ts`, `test/run.test.ts`, `test/decide.test.ts` |
| **S4** | Check a box only when the label is explicitly marked required **and** Claude returned `service_essential` with a quote that is verbatim in the terms text. Under `intl` that same evidence only ever spares a box; it never checks one. | `test/decide.test.ts`, including an exhaustive invariant over every mark × substance × state × context combination |
| **S5** | Claude never decides law. If the call fails, times out, or returns junk, the pipeline still runs and unchecks everything not explicitly marked required. Under `intl`, where nothing carries a printed mark at all, it reports and waits for a click instead. | `test/decide.test.ts`, `test/run.test.ts`, `test/providers.test.ts` |

Why S2 is the right default:

| Failure | Result | User notices? | Recovery |
|---|---|---|---|
| Missed a required box, or failed to refuse | Form won't submit; banner stays up | Immediately | One click |
| Wrongly agreed to something optional | Personal data leaves | Never | Impossible |

The site's own validation is a free safety net for the benign failure. There is
no safety net for the other one.

This is also why S1b exists at all. Failing to press *Reject all* leaves the
banner on screen; pressing *Accept all* by mistake transmits consent and cannot
be taken back. So a control is pressed only when it is proven to minimise
consent — never when it is merely likely to.

---
