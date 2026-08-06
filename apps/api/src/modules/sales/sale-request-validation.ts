import { createSaleSchema, saveSaleDraftSchema } from '@yukimi/shared';
import { z } from 'zod';

const negotiatedTermsSchema = z
  .object({
    negotiatedMinimumDepositAmount: z.number().nonnegative().nullable().optional(),
    negotiatedMinimumDepositDueAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .superRefine((value, context) => {
    const minimum = value.negotiatedMinimumDepositAmount ?? 0;
    if (minimum > 0 && !value.negotiatedMinimumDepositDueAt) {
      context.addIssue({
        code: 'custom',
        path: ['negotiatedMinimumDepositDueAt'],
        message: 'Indica la fecha límite para pagar el adelanto mínimo.',
      });
    }
  });

export function parseCreateSaleRequest(body: unknown) {
  const input = createSaleSchema.parse(body);
  const terms = negotiatedTermsSchema.parse(body);
  return {
    ...input,
    negotiatedMinimumDepositDueAt:
      (terms.negotiatedMinimumDepositAmount ?? 0) > 0
        ? (terms.negotiatedMinimumDepositDueAt ?? null)
        : null,
  };
}

export function parseSaveSaleDraftRequest(body: unknown) {
  const draft = saveSaleDraftSchema.parse(body);
  const rawInput =
    typeof body === 'object' && body !== null && 'input' in body
      ? (body as { input?: unknown }).input
      : undefined;
  const terms = negotiatedTermsSchema.parse(rawInput);
  return {
    ...draft,
    input: {
      ...draft.input,
      negotiatedMinimumDepositDueAt:
        (terms.negotiatedMinimumDepositAmount ?? 0) > 0
          ? (terms.negotiatedMinimumDepositDueAt ?? null)
          : null,
    },
  };
}
