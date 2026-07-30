import { z } from 'zod';

export const saleFilterSchema = z.enum(['ALL', 'RESERVED', 'UNPAID', 'OVERDUE', 'CANCELLED']);
export type SaleFilter = z.infer<typeof saleFilterSchema>;

export const saleListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  clientPhone: z.string().nullable(),
  saleTypeCode: z.string(),
  salesChannelCode: z.string(),
  commercialStateCode: z.string(),
  paymentStateCode: z.string(),
  deliveryStateCode: z.string(),
  currencyCode: z.string().length(3),
  totalAmount: z.number(),
  paidTotal: z.number(),
  balanceAmount: z.number(),
  itemLines: z.number().int().nonnegative(),
  totalUnits: z.number().int().nonnegative(),
  dueAt: z.string().nullable(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  version: z.number().int().positive(),
});
export type SaleListItem = z.infer<typeof saleListItemSchema>;

export const saleListResponseSchema = z.object({
  items: z.array(saleListItemSchema),
  summary: z.object({
    activeSales: z.number().int().nonnegative(),
    soldAmount: z.number().nonnegative(),
    pendingBalance: z.number().nonnegative(),
    overdueSales: z.number().int().nonnegative(),
  }),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type SaleListResponse = z.infer<typeof saleListResponseSchema>;

export const saleSupportDataSchema = z.object({
  salesChannels: z.array(z.object({ code: z.string(), name: z.string() })),
  discountTypes: z.array(z.object({ code: z.string(), name: z.string() })),
  defaultPaymentTermDays: z.number().int().positive(),
});
export type SaleSupportData = z.infer<typeof saleSupportDataSchema>;

export const saleAllocationSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  warehouseName: z.string(),
  lotId: z.string().uuid(),
  lotCode: z.string(),
  quantity: z.number().int().positive(),
  status: z.string(),
});

export const saleItemDetailSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  categoryName: z.string(),
  quantity: z.number().int().positive(),
  originalUnitPrice: z.number().nonnegative(),
  finalUnitPrice: z.number().nonnegative(),
  lineSubtotal: z.number().nonnegative(),
  lineDiscountTotal: z.number().nonnegative(),
  lineTotal: z.number().nonnegative(),
  fulfillmentType: z.string(),
  itemStatus: z.string(),
  notes: z.string().nullable(),
  allocations: z.array(saleAllocationSchema),
});
export type SaleItemDetail = z.infer<typeof saleItemDetailSchema>;

export const saleReleaseRequestSchema = z.object({
  id: z.string().uuid(),
  saleItemId: z.string().uuid().nullable().default(null),
  stateCode: z.string(),
  reason: z.string(),
  suggestedPenaltyAmount: z.number().nonnegative().nullable().default(null),
  penaltyAmount: z.number().nonnegative(),
  penaltyOverridden: z.boolean().default(false),
  depositBasisAmount: z.number().nonnegative().default(0),
  retainedAmount: z.number().nonnegative().default(0),
  refundableAmount: z.number().nonnegative().default(0),
  penaltyRuleSnapshot: z.record(z.string(), z.unknown()).default({}),
  requestedAt: z.string(),
  requestedById: z.string().uuid().nullable(),
  requestedByName: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewedByName: z.string().nullable(),
  reviewNotes: z.string().nullable(),
});
export type SaleReleaseRequest = z.infer<typeof saleReleaseRequestSchema>;

export const saleHistoryItemSchema = z.object({
  id: z.string().uuid(),
  dimension: z.string(),
  previousStateCode: z.string().nullable(),
  newStateCode: z.string(),
  reason: z.string().nullable(),
  changedByName: z.string().nullable(),
  changedAt: z.string(),
});

export const saleDetailSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  clientId: z.string().uuid(),
  clientCode: z.string(),
  clientName: z.string(),
  clientPhone: z.string().nullable(),
  clientIsVip: z.boolean(),
  saleTypeCode: z.string(),
  salesChannelCode: z.string(),
  commercialStateCode: z.string(),
  paymentStateCode: z.string(),
  deliveryStateCode: z.string(),
  currencyCode: z.string().length(3),
  soldAt: z.string().nullable(),
  reservedAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  subtotal: z.number().nonnegative(),
  discountTotal: z.number().nonnegative(),
  penaltyTotal: z.number().nonnegative(),
  shippingChargeTotal: z.number().nonnegative(),
  totalAmount: z.number().nonnegative(),
  paidTotal: z.number().nonnegative(),
  balanceAmount: z.number(),
  negotiatedMinimumDepositAmount: z.number().nonnegative().nullable(),
  negotiatedMinimumDepositReason: z.string().nullable(),
  negotiatedTermsSnapshot: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int().positive(),
  items: z.array(saleItemDetailSchema),
  releaseRequests: z.array(saleReleaseRequestSchema),
  history: z.array(saleHistoryItemSchema),
});
export type SaleDetail = z.infer<typeof saleDetailSchema>;

export const saleReleaseQuoteSchema = z.object({
  saleId: z.string().uuid(),
  saleItemId: z.string().uuid(),
  productName: z.string(),
  variantName: z.string(),
  categoryCode: z.string(),
  categoryName: z.string(),
  currencyCode: z.string().length(3),
  withinGracePeriod: z.boolean(),
  graceHours: z.number().nonnegative(),
  elapsedHours: z.number().nonnegative(),
  categoryPenaltyAmount: z.number().nonnegative(),
  suggestedReleasePenaltyAmount: z.number().nonnegative(),
  activeLatePenaltyAmount: z.number().nonnegative(),
  effectivePenaltyAmount: z.number().nonnegative(),
  depositBasisAmount: z.number().nonnegative(),
  retainedAmount: z.number().nonnegative(),
  refundableAmount: z.number().nonnegative(),
  uncoveredPenaltyAmount: z.number().nonnegative(),
  rule: z.object({
    scope: z.literal('SALE_LINE'),
    selectionMode: z.literal('MAX_SINGLE'),
    deductFromDeposit: z.literal(true),
    depositAllocationMode: z.string(),
  }),
});
export type SaleReleaseQuote = z.infer<typeof saleReleaseQuoteSchema>;

export const createSaleItemSchema = z.object({
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().int().positive().max(999),
  originalUnitPrice: z.number().nonnegative(),
  finalUnitPrice: z.number().nonnegative(),
  discountTypeCode: z.string().trim().min(1).max(50).nullable().optional(),
  discountReason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.finalUnitPrice > value.originalUnitPrice) {
    context.addIssue({ code: 'custom', path: ['finalUnitPrice'], message: 'El precio final no puede superar el precio original.' });
  }
  if (value.finalUnitPrice < value.originalUnitPrice) {
    if (!value.discountTypeCode) {
      context.addIssue({ code: 'custom', path: ['discountTypeCode'], message: 'Selecciona el tipo de descuento.' });
    }
    if (!value.discountReason || value.discountReason.trim().length < 3) {
      context.addIssue({ code: 'custom', path: ['discountReason'], message: 'Indica el motivo del descuento.' });
    }
  }
});
export type CreateSaleItemInput = z.infer<typeof createSaleItemSchema>;

export const createSaleSchema = z.object({
  clientId: z.string().uuid(),
  salesChannelCode: z.string().trim().min(1).max(50),
  currencyCode: z.literal('PEN').default('PEN'),
  deliveryMode: z.enum(['PENDING', 'ACCUMULATED']).default('PENDING'),
  dueAt: z.string().datetime().nullable().optional(),
  negotiatedMinimumDepositAmount: z.number().nonnegative().nullable().optional(),
  negotiatedMinimumDepositReason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(createSaleItemSchema).min(1).max(100),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    const key = `${item.variantId}:${item.warehouseId}`;
    if (seen.has(key)) {
      context.addIssue({ code: 'custom', path: ['items', index], message: 'La misma variante y almacén no pueden repetirse.' });
    }
    seen.add(key);
  });
  if (
    value.negotiatedMinimumDepositAmount != null
    && (!value.negotiatedMinimumDepositReason || value.negotiatedMinimumDepositReason.length < 3)
  ) {
    context.addIssue({
      code: 'custom',
      path: ['negotiatedMinimumDepositReason'],
      message: 'Explica el acuerdo del adelanto mínimo.',
    });
  }
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

export const createSaleResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  version: z.number().int().positive(),
});
export type CreateSaleResult = z.infer<typeof createSaleResultSchema>;

export const requestSaleReleaseSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
  penaltyAmount: z.number().nonnegative(),
});
export type RequestSaleReleaseInput = z.infer<typeof requestSaleReleaseSchema>;

export const reviewSaleReleaseSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reviewNotes: z.string().trim().min(3).max(1000),
});
export type ReviewSaleReleaseInput = z.infer<typeof reviewSaleReleaseSchema>;
