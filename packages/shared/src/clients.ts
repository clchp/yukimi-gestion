import { z } from 'zod';

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

export const clientAddressSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  label: z.string(),
  addressLine: z.string(),
  district: z.string().nullable(),
  province: z.string().nullable(),
  department: z.string().nullable(),
  reference: z.string().nullable(),
  preferredPartnerId: z.string().uuid().nullable(),
  preferredPartnerName: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
});

export type ClientAddress = z.infer<typeof clientAddressSchema>;

export const clientVipProfileSchema = z.object({
  canReserveWithoutDeposit: z.boolean(),
  separationLimitAmount: z.number().nonnegative().nullable(),
  separationLimitCurrency: z.string().length(3).nullable(),
  paymentTermDays: z.number().int().positive().nullable(),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
  grantedReason: z.string().nullable(),
  grantedByName: z.string().nullable(),
  version: z.number().int().positive(),
});

export type ClientVipProfile = z.infer<typeof clientVipProfileSchema>;

export const clientVipHistoryItemSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['GRANTED', 'UPDATED', 'REVOKED']),
  previousValues: z.record(z.string(), z.unknown()).nullable(),
  newValues: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string(),
  performedByName: z.string().nullable(),
  occurredAt: z.string(),
});

export type ClientVipHistoryItem = z.infer<typeof clientVipHistoryItemSchema>;

export const clientIncidentSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  incidentType: z.enum(['LATE_PAYMENT', 'PENALTY', 'RELEASE', 'NON_CONTACT', 'RETURN', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  saleId: z.string().uuid().nullable(),
  saleCode: z.string().nullable(),
  description: z.string(),
  amount: z.number().nonnegative().nullable(),
  currencyCode: z.string().length(3).nullable(),
  occurredAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolutionNotes: z.string().nullable(),
  createdByName: z.string().nullable(),
  version: z.number().int().positive(),
});

export type ClientIncident = z.infer<typeof clientIncidentSchema>;

export const clientRecentSaleSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  createdAt: z.string(),
  totalAmount: z.number(),
  balanceAmount: z.number(),
  currencyCode: z.string().length(3),
  paymentStateCode: z.string(),
  deliveryStateCode: z.string(),
  dueAt: z.string().nullable(),
});

export type ClientRecentSale = z.infer<typeof clientRecentSaleSchema>;

export const clientListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  fullName: z.string(),
  documentType: z.string().nullable(),
  documentNumber: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  isVip: z.boolean(),
  isActive: z.boolean(),
  totalPurchased: z.number(),
  balanceAmount: z.number(),
  overdueSales: z.number().int().nonnegative(),
  lastPurchaseAt: z.string().nullable(),
  incidentCount: z.number().int().nonnegative(),
  defaultAddress: z.string().nullable(),
  version: z.number().int().positive(),
});

export type ClientListItem = z.infer<typeof clientListItemSchema>;

export const clientListResponseSchema = z.object({
  items: z.array(clientListItemSchema),
  summary: z.object({
    activeClients: z.number().int().nonnegative(),
    vipClients: z.number().int().nonnegative(),
    pendingBalance: z.number().nonnegative(),
    overdueClients: z.number().int().nonnegative(),
  }),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ClientListResponse = z.infer<typeof clientListResponseSchema>;

export const clientDetailSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  fullName: z.string(),
  documentType: z.string().nullable(),
  documentNumber: z.string().nullable(),
  phone: z.string().nullable(),
  secondaryPhone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  isVip: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  version: z.number().int().positive(),
  stats: z.object({
    totalPurchased: z.number(),
    purchaseCount: z.number().int().nonnegative(),
    balanceAmount: z.number(),
    overdueSales: z.number().int().nonnegative(),
    unresolvedIncidents: z.number().int().nonnegative(),
    accumulatedUnits: z.number().int().nonnegative(),
  }),
  addresses: z.array(clientAddressSchema),
  vipProfile: clientVipProfileSchema.nullable(),
  vipHistory: z.array(clientVipHistoryItemSchema),
  incidents: z.array(clientIncidentSchema),
  recentSales: z.array(clientRecentSaleSchema),
});

export type ClientDetail = z.infer<typeof clientDetailSchema>;

export const createClientAddressInputSchema = z.object({
  label: z.string().trim().min(2).max(80).default('Principal'),
  addressLine: z.string().trim().min(5).max(300),
  district: nullableText(120),
  province: nullableText(120),
  department: nullableText(120),
  reference: nullableText(500),
  preferredPartnerId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().default(false),
});

export type CreateClientAddressInput = z.infer<typeof createClientAddressInputSchema>;

const clientCoreInputSchema = z.object({
  fullName: z.string().trim().min(3).max(200),
  documentType: z.enum(['DNI', 'CE', 'PASSPORT', 'RUC', 'OTHER']).nullable().optional(),
  documentNumber: nullableText(30),
  phone: nullableText(30),
  secondaryPhone: nullableText(30),
  email: z.string().trim().email().max(254).nullable().optional(),
  notes: nullableText(2000),
});

export const createClientSchema = clientCoreInputSchema.extend({
  address: createClientAddressInputSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (value.documentNumber && !value.documentType) {
    context.addIssue({ code: 'custom', path: ['documentType'], message: 'Selecciona el tipo de documento.' });
  }
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = clientCoreInputSchema.extend({
  version: z.number().int().positive(),
}).superRefine((value, context) => {
  if (value.documentNumber && !value.documentType) {
    context.addIssue({ code: 'custom', path: ['documentType'], message: 'Selecciona el tipo de documento.' });
  }
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const setClientStatusSchema = z.object({
  isActive: z.boolean(),
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export type SetClientStatusInput = z.infer<typeof setClientStatusSchema>;

export const setClientVipSchema = z.object({
  isVip: z.boolean(),
  clientVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  canReserveWithoutDeposit: z.boolean().default(false),
  paymentTermDays: z.number().int().positive().max(365).nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
});

export type SetClientVipInput = z.infer<typeof setClientVipSchema>;

export const updateClientAddressSchema = createClientAddressInputSchema.extend({
  version: z.number().int().positive(),
  isActive: z.boolean().default(true),
});

export type UpdateClientAddressInput = z.infer<typeof updateClientAddressSchema>;

export const createClientIncidentSchema = z.object({
  incidentType: z.enum(['LATE_PAYMENT', 'PENALTY', 'RELEASE', 'NON_CONTACT', 'RETURN', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  saleId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(5).max(1000),
  amount: z.number().nonnegative().nullable().optional(),
  currencyCode: z.string().length(3).nullable().optional(),
  occurredAt: z.string().datetime().optional(),
});

export type CreateClientIncidentInput = z.infer<typeof createClientIncidentSchema>;

export const resolveClientIncidentSchema = z.object({
  version: z.number().int().positive(),
  resolutionNotes: z.string().trim().min(3).max(1000),
});

export type ResolveClientIncidentInput = z.infer<typeof resolveClientIncidentSchema>;

export const clientSupportDataSchema = z.object({
  preferredPartners: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
  })),
});

export type ClientSupportData = z.infer<typeof clientSupportDataSchema>;
