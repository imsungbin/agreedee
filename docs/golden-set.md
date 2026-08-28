[← README](../README.md)

# The golden set

There is no separate measurement step. Scoring the golden set *is* running the
tests: every fixture asserts detection, extraction, mark parsing, moment
classification, decisions under a perfect-substance oracle, and that degraded
mode never checks a box that is not marked required.

`pnpm score` prints the table below and exits non-zero if the wrong-check rate
is ever above 0%.

### Current scores

**The `real` population is empty.** All 21 fixtures are `reconstructed` —
18 hand-authored from documented Korean consent patterns (label-embedded marks,
marks in a sibling cell or tag, section headings, `aria-labelledby` with visually
hidden inputs, terms in `<textarea>`, terms behind links, unmarked items,
select-all violations) and 3 English ones for `intl` (a US SaaS signup whose
terms box carries no mark, a GDPR cookie dialog with everything pre-ticked, and
a checkout). They are never blended with real captures, and the two populations
are printed separately.

Read the reconstructed numbers for what they are: the fixtures and the parser
were written by the same author, so **mark accuracy of 100% is not evidence
about live sites.** It is evidence that the rules are internally consistent and
that the safety invariants hold across 21 differently-shaped documents. Real
captures are the missing evidence.

```
population: reconstructed (21 fixtures)

 with substance oracle
  wrong-check rate                 0.0%  0/41 optional items checked by us — must be 0%
  left-checked rate                4.9%  2/41 optional items still checked afterwards
  miss rate                       23.1%  6/26 required items left unchecked (tolerable)
  detection rate                 100.0%  21/21 consent moments
  item extraction                100.0%  0 missed, 0 spurious
  mark accuracy                  100.0%  67/67 required/optional/no-mark
  badge-only moments                  5  payment or uncertain flow (S3)
  findings                           36
    prechecked_optional            26
    missing_mark                    6
    selectall_violation             2
    label_substance_mismatch        2

 deterministic only (no API key)
  wrong-check rate                 0.0%  0/41
  left-checked rate                4.9%  2/41
  miss rate                       80.8%  21/26
  findings                           35
```

Reading the numbers:

- **wrong-check rate is the self-destruct switch.** 0% in both modes. A tool
  that opts users in is worse than no tool.
- **left-checked 4.9%** is two boxes the site had `disabled` — one pre-checked
  optional item, one "necessary cookies" row. Agreedee cannot change either, so
  it reports them instead.
- **miss rate 23.1%** is almost entirely S3 doing its job: in the payment
  fixtures, required boxes are deliberately left alone. The rest is one item
  whose terms were unreachable.
- **miss rate 80.8% without a key** is degraded mode behaving as specified:
  unchecked required boxes stay unchecked, and the user ticks them. Nothing is
  wrongly checked.
- **`intl` fixtures contribute no `missing_mark`**, which is the point: an
  unmarked box on a US signup form is not a marking failure — nothing over there
  requires a mark — and saying so would be noise.
- **detection rate** counts moments expected, not moments found — failures are
  in the denominator.

### Growing the golden set

Real captures are the highest-value contribution. To add one:

1. Save the consent page (`Ctrl+S`, "Webpage, HTML Only") at the moment the
   consent UI is on screen.
2. `node tools/anonymize.ts saved.html goldenset/<id> --replace "AcmeShop=Service"`
   — strips scripts, styles, images, inline handlers and absolute URLs, and
   redacts phone numbers, emails, RRNs, card and order numbers.
3. **Read `page.html` yourself before committing.** The anonymizer is a helper,
   not a guarantee.
4. Fill in `expected.json` by reading the required/optional marks off the page.
   This is mechanical, not a judgement call — the mark is printed.
5. Set `"source": "real"` in `meta.json` and run `pnpm test && pnpm score`.
6. For a non-Korean fixture, add `"regime": "intl"` to `expected.json`. Its
   absence means `kr`.

---
