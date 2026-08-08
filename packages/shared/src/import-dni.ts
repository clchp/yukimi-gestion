import { z } from 'zod';
import { createImportSchema } from './imports.js';

export const importDniPersonDraftSchema = z.object({
  fullName: z.string().trim().min(3).max(200),
  documentNumber: z.string().trim().regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos.'),
  address: z.string().trim().min(3).max(500),
  postalCode: z.string().trim().min(3).max(20),
});
export type ImportDniPersonDraft = z.infer<typeof importDniPersonDraftSchema>;

export const registerImportDniUsageSchema = z
  .object({
    personId: z.string().uuid().nullable().optional(),
    person: importDniPersonDraftSchema.nullable().optional(),
    purchaseAmount: z.number().positive().max(999999999),
    exchangeRateToUsd: z.number().positive().max(999999),
    managementFeePen: z.number().nonnegative().max(999999).default(30),
  })
  .superRefine((value, context) => {
    const hasPersonId = Boolean(value.personId);
    const hasPersonDraft = Boolean(value.person);
    if (hasPersonId === hasPersonDraft) {
      context.addIssue({
        code: 'custom',
        path: ['personId'],
        message: 'Selecciona una persona guardada o registra una nueva, pero no ambas.',
      });
    }
  });
export type RegisterImportDniUsageInput = z.infer<typeof registerImportDniUsageSchema>;

export const createImportWithDniSchema = createImportSchema.extend({
  dniUsages: z.array(registerImportDniUsageSchema).max(20).default([]),
});
export type CreateImportWithDniInput = z.infer<typeof createImportWithDniSchema>;

export const importDniPersonSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  documentNumber: z.string(),
  address: z.string(),
  postalCode: z.string(),
  accumulatedUsd: z.number().nonnegative(),
  usageCount: z.number().int().nonnegative(),
});
export type ImportDniPerson = z.infer<typeof importDniPersonSchema>;

export const importDniPeopleResponseSchema = z.object({
  items: z.array(importDniPersonSchema),
});
export type ImportDniPeopleResponse = z.infer<typeof importDniPeopleResponseSchema>;

export const importDniUsageSchema = z.object({
  id: z.string().uuid(),
  importId: z.string().uuid(),
  importCode: z.string(),
  personId: z.string().uuid(),
  fullName: z.string(),
  documentNumber: z.string(),
  address: z.string(),
  postalCode: z.string(),
  sourceCurrencyCode: z.string().length(3),
  purchaseAmount: z.number().positive(),
  exchangeRateToUsd: z.number().positive(),
  equivalentUsd: z.number().nonnegative(),
  managementFeePen: z.number().nonnegative(),
  importCostId: z.string().uuid().nullable(),
  occurredAt: z.string(),
  personAccumulatedUsd: z.number().nonnegative(),
});
export type ImportDniUsage = z.infer<typeof importDniUsageSchema>;

export const importDniUsagesResponseSchema = z.object({
  items: z.array(importDniUsageSchema),
});
export type ImportDniUsagesResponse = z.infer<typeof importDniUsagesResponseSchema>;

export const registerImportDniUsageResultSchema = importDniUsageSchema;
export type RegisterImportDniUsageResult = z.infer<typeof registerImportDniUsageResultSchema>;
