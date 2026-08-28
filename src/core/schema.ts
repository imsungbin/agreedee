/**
 * schema.js — the only thing Claude is allowed to answer.
 *
 * Claude never decides law (S5). It receives a label and the terms text and
 * reports what the terms text says, with a verbatim quote. Everything else —
 * the required/optional mark, the KRDS rule, the final decision — is deterministic
 * code that has already run before this call is made.
 */

import type { Substance } from './types.js';

export const SUBSTANCES: readonly Substance[] = [
  'service_essential',
  'marketing',
  'third_party_sharing',
  'unclear',
];

export const TOOL = {
  name: 'report_substance',
  description:
    'Report, for each consent item, what its terms text is actually about, with a verbatim quote.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'the id given in the input' },
            substance: { type: 'string', enum: SUBSTANCES },
            quote: {
              type: ['string', 'null'],
              description:
                'a sentence copied character-for-character from that item terms text, or null',
            },
          },
          required: ['id', 'substance', 'quote'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
} as const;

export const SYSTEM_PROMPT = `You compare a consent item's LABEL against the SUBSTANCE of its terms text.
Do not reason from legal knowledge. Judge only from the text provided.

For each item return:
- substance: service_essential | marketing | third_party_sharing | unclear
- quote: the verbatim sentence from the terms text that justifies it.
         If you cannot quote it, substance MUST be "unclear".

Never invent text that is not in the input. If in doubt, answer "unclear" —
downstream, "unclear" causes the box to be unchecked, and a wrongly unchecked
box costs the user one click while a wrongly checked one is unrecoverable.

The number of service_essential answers is not evaluated. Only quote accuracy
is evaluated.

Return one entry per input item, using the same id. Answer only with the
report_substance tool.`;
