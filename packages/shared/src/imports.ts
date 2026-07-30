import { z } from 'zod';

export const importFilterSchema = z.enum(['ALL', 'ACTIVE', 'ARRIVING', 'DELAYED', 'STOCKED', 'CANCELLED']);
export type ImportFilter = z.infer<typeof importFilterSchema>;

export const importTransportModeSchema = z.enum(['AIR', 'SEA', 'OTHER']);
export type ImportTransportMode = z.infer<typeof importTransportModeSchema>;

export const importStateCodeSchema = z.enum([
  'QUOTATION',
  'PURCHASE_CONFIRMED',
  'FOREIGN_WAREHOUSE',
  'DISPATCH_CONFIRMED',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVED_PERU',
  'STOCKED',
  'CANCELLED',
]);
export type ImportStateCode = z.infer<typeof importStateCodeSchema>;

export const importBoxStateCodeSchema = z.enum([
  'REGISTERED',
  'FOREIGN_WAREHOUSE',
  'DISPATCH_CONFIRMED',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVED_PERU',
  'STOCKED',
  'CANCELLED',
]);
export type ImportBoxStateCode = z.infer<typeof importBoxStateCodeSchema>;

export const importPartnerOptionSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  types: z.array(z.string()),
  countryCode: z.string().nullable(),
});
export type ImportPartnerOption = z.infer<typeof importPartnerOptionSchema>;

export const importVariantOptionSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productCode: z.string(),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  salePrice: z.number().nonnegative(),
  currencyCode: z.string().length(3),
});
export type ImportVariantOption = z.infer<typeof importVariantOptionSchema>;

export const importWarehouseOptionSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});
export type ImportWarehouseOption = z.infer<typeof importWarehouseOptionSchema>;

export const importSupportDataSchema = z.object({
  suppliers: z.array(importPartnerOptionSchema),
  internationalOperators: z.array(importPartnerOptionSchema),
  localOperators: z.array(importPartnerOptionSchema),
  currencies: z.array(z.object({ code: z.string().length(3), name: z.string(), symbol: z.string() })),
  warehouses: z.array(importWarehouseOptionSchema),
  variants: z.array(importVariantOptionSchema),
  activeClients: z.array(z.object({
    id: z.string().uuid(),
    code: z.string(),
    fullName: z.string(),
    phone: z.string().nullable(),
    isVip: z.boolean(),
  })),
  salesChannels: z.array(z.object({ code: z.string(), name: z.string() })),
  discountTypes: z.array(z.object({ code: z.string(), name: z.string() })),
  defaultPaymentTermDays: z.number().int().positive(),
  preorderCandidates: z.array(z.object({
    saleItemId: z.string().uuid(),
    saleId: z.string().uuid(),
    saleCode: z.string(),
    clientName: z.string(),
    variantId: z.string().uuid(),
    productName: z.string(),
    variantName: z.string(),
    sku: z.string(),
    quantity: z.number().int().positive(),
    allocatedQuantity: z.number().int().nonnegative(),
    remainingQuantity: z.number().int().nonnegative(),
  })),
});
export type ImportSupportData = z.infer<typeof importSupportDataSchema>;

export const importListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  supplierName: z.string().nullable(),
  transportMode: importTransportModeSchema,
  stateCode: importStateCodeSchema,
  purchaseCurrencyCode: z.string().length(3),
  purchaseDate: z.string().nullable(),
  estimatedArrivalDate: z.string().nullable(),
  actualArrivalAt: z.string().nullable(),
  masterTrackingNumber: z.string().nullable(),
  boxCount: z.number().int().nonnegative(),
  totalExpectedUnits: z.number().int().nonnegative(),
  totalReceivedUnits: z.number().int().nonnegative(),
  totalCostPen: z.number().nonnegative(),
  openIncidents: z.number().int().nonnegative(),
  isDelayed: z.boolean(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  version: z.number().int().positive(),
});
export type ImportListItem = z.infer<typeof importListItemSchema>;

export const importListResponseSchema = z.object({
  items: z.array(importListItemSchema),
  summary: z.object({
    activeImports: z.number().int().nonnegative(),
    boxesInTransit: z.number().int().nonnegative(),
    expectedUnits: z.number().int().nonnegative(),
    delayedImports: z.number().int().nonnegative(),
  }),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type ImportListResponse = z.infer<typeof importListResponseSchema>;

export const createImportBoxItemSchema = z.object({
  variantId: z.string().uuid(),
  destinationWarehouseId: z.string().uuid(),
  expectedQuantity: z.number().int().positive().max(99999),
  originalUnitCost: z.number().nonnegative().max(99999999),
  originalCurrencyCode: z.string().length(3),
  exchangeRateToPen: z.number().positive().max(999999),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const createImportBoxSchema = z.object({
  internationalOperatorId: z.string().uuid().nullable().optional(),
  localOperatorId: z.string().uuid().nullable().optional(),
  trackingNumber: z.string().trim().max(150).nullable().optional(),
  estimatedArrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  weightGrams: z.number().nonnegative().max(999999999).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  items: z.array(createImportBoxItemSchema).min(1).max(200),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    const key = `${item.variantId}:${item.destinationWarehouseId}`;
    if (seen.has(key)) {
      context.addIssue({ code: 'custom', path: ['items', index], message: 'La misma variante y almacén no pueden repetirse dentro de una caja.' });
    }
    seen.add(key);
  });
});

export const createImportSchema = z.object({
  supplierPartnerId: z.string().uuid().nullable().optional(),
  transportMode: importTransportModeSchema,
  purchaseCurrencyCode: z.string().length(3),
  sunatExchangeRate: z.number().positive().max(999999),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  estimatedArrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  masterTrackingNumber: z.string().trim().max(150).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
  boxes: z.array(createImportBoxSchema).min(1).max(100),
});
export type CreateImportInput = z.infer<typeof createImportSchema>;

export const updateImportStateSchema = z.object({
  nextStateCode: importStateCodeSchema,
  reason: z.string().trim().min(3).max(1000),
  occurredAt: z.string().datetime().nullable().optional(),
  masterTrackingNumber: z.string().trim().max(150).nullable().optional(),
});
export type UpdateImportStateInput = z.infer<typeof updateImportStateSchema>;

export const updateImportBoxStateSchema = z.object({
  nextStateCode: importBoxStateCodeSchema,
  reason: z.string().trim().min(3).max(1000),
  occurredAt: z.string().datetime().nullable().optional(),
  trackingNumber: z.string().trim().max(150).nullable().optional(),
});
export type UpdateImportBoxStateInput = z.infer<typeof updateImportBoxStateSchema>;

export const createImportCostSchema = z.object({
  importBoxId: z.string().uuid().nullable().optional(),
  costType: z.enum(['CARD', 'COMMISSION', 'FREIGHT', 'CUSTOMS', 'INSURANCE', 'LOCAL_DELIVERY', 'OTHER']),
  description: z.string().trim().max(1000).nullable().optional(),
  amount: z.number().nonnegative().max(99999999),
  currencyCode: z.string().length(3),
  exchangeRateToPen: z.number().positive().max(999999),
  allocationMethod: z.enum(['MANUAL', 'BY_QUANTITY', 'BY_PURCHASE_VALUE', 'BY_WEIGHT', 'NOT_ALLOCATED']),
  isIncludedInUnitCost: z.boolean(),
  occurredAt: z.string().datetime().nullable().optional(),
});
export type CreateImportCostInput = z.infer<typeof createImportCostSchema>;

export const receiveImportBoxSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  occurredAt: z.string().datetime().nullable().optional(),
  items: z.array(z.object({
    importBoxItemId: z.string().uuid(),
    receivedQuantity: z.number().int().nonnegative().max(99999),
    finalUnitCostPen: z.number().nonnegative().max(99999999),
    notes: z.string().trim().max(1000).nullable().optional(),
  })).min(1).max(200),
});
export type ReceiveImportBoxInput = z.infer<typeof receiveImportBoxSchema>;

export const createImportIncidentSchema = z.object({
  importBoxId: z.string().uuid().nullable().optional(),
  importBoxItemId: z.string().uuid().nullable().optional(),
  incidentType: z.enum(['MISSING', 'DAMAGED', 'DELAY', 'WRONG_ITEM', 'OTHER']),
  affectedQuantity: z.number().int().positive().max(99999).nullable().optional(),
  description: z.string().trim().min(3).max(2000),
  occurredAt: z.string().datetime().nullable().optional(),
});
export type CreateImportIncidentInput = z.infer<typeof createImportIncidentSchema>;


export const createInsuranceClaimSchema = z.object({
  importIncidentId: z.string().uuid(),
  claimNumber: z.string().trim().max(100).nullable().optional(),
  claimedAmount: z.number().nonnegative().max(99999999),
  currencyCode: z.string().length(3),
  status: z.enum(['PENDING', 'SUBMITTED']).default('SUBMITTED'),
  submittedAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type CreateInsuranceClaimInput = z.infer<typeof createInsuranceClaimSchema>;

export const updateInsuranceClaimSchema = z.object({
  status: z.enum(['PENDING', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED']),
  approvedAmount: z.number().nonnegative().max(99999999).nullable().optional(),
  resolutionNotes: z.string().trim().min(3).max(2000),
});
export type UpdateInsuranceClaimInput = z.infer<typeof updateInsuranceClaimSchema>;

export const allocatePreorderSchema = z.object({
  saleItemId: z.string().uuid(),
  importBoxItemId: z.string().uuid(),
  quantity: z.number().int().positive().max(99999),
});
export type AllocatePreorderInput = z.infer<typeof allocatePreorderSchema>;


export const createPreorderSaleSchema = z.object({
  clientId: z.string().uuid(),
  salesChannelCode: z.string().trim().min(1).max(50),
  importBoxItemId: z.string().uuid(),
  quantity: z.number().int().positive().max(99999),
  originalUnitPrice: z.number().nonnegative().max(99999999),
  finalUnitPrice: z.number().nonnegative().max(99999999),
  discountTypeCode: z.string().trim().max(50).nullable().optional(),
  discountReason: z.string().trim().max(500).nullable().optional(),
  deliveryMode: z.enum(['PENDING', 'ACCUMULATED']).default('ACCUMULATED'),
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.finalUnitPrice > value.originalUnitPrice) {
    context.addIssue({ code: 'custom', path: ['finalUnitPrice'], message: 'El precio final no puede superar el precio original.' });
  }
  if (value.finalUnitPrice < value.originalUnitPrice) {
    if (!value.discountTypeCode) context.addIssue({ code: 'custom', path: ['discountTypeCode'], message: 'Selecciona el tipo de descuento.' });
    if (!value.discountReason || value.discountReason.trim().length < 3) context.addIssue({ code: 'custom', path: ['discountReason'], message: 'Indica el motivo del descuento.' });
  }
});
export type CreatePreorderSaleInput = z.infer<typeof createPreorderSaleSchema>;

export const preorderSaleResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  version: z.number().int().positive(),
});
export type PreorderSaleResult = z.infer<typeof preorderSaleResultSchema>;

export const createImportPartnerSchema = z.object({
  partnerTypeCode: z.enum(['SUPPLIER', 'INTERNATIONAL_OPERATOR', 'LOCAL_OPERATOR']),
  legalName: z.string().trim().min(2).max(200),
  tradeName: z.string().trim().max(200).nullable().optional(),
  countryCode: z.string().trim().length(2).nullable().optional(),
  contactName: z.string().trim().max(150).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateImportPartnerInput = z.infer<typeof createImportPartnerSchema>;

export const importHistoryItemSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum(['SHIPMENT', 'BOX']),
  entityCode: z.string(),
  previousStateCode: z.string().nullable(),
  newStateCode: z.string(),
  reason: z.string().nullable(),
  changedByName: z.string().nullable(),
  changedAt: z.string(),
});

export const importDetailSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  supplierPartnerId: z.string().uuid().nullable(),
  supplierName: z.string().nullable(),
  stateCode: importStateCodeSchema,
  transportMode: importTransportModeSchema,
  purchaseCurrencyCode: z.string().length(3),
  sunatExchangeRate: z.number().positive(),
  purchaseDate: z.string().nullable(),
  estimatedArrivalDate: z.string().nullable(),
  actualArrivalAt: z.string().nullable(),
  stockEntryCompletedAt: z.string().nullable(),
  masterTrackingNumber: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  version: z.number().int().positive(),
  totals: z.object({
    expectedUnits: z.number().int().nonnegative(),
    receivedUnits: z.number().int().nonnegative(),
    purchaseValuePen: z.number().nonnegative(),
    extraCostsPen: z.number().nonnegative(),
    allocatedPreorders: z.number().int().nonnegative(),
  }),
  boxes: z.array(z.object({
    id: z.string().uuid(),
    code: z.string(),
    stateCode: importBoxStateCodeSchema,
    internationalOperatorId: z.string().uuid().nullable(),
    internationalOperatorName: z.string().nullable(),
    localOperatorId: z.string().uuid().nullable(),
    localOperatorName: z.string().nullable(),
    trackingNumber: z.string().nullable(),
    estimatedArrivalDate: z.string().nullable(),
    actualArrivalAt: z.string().nullable(),
    weightGrams: z.number().nullable(),
    notes: z.string().nullable(),
    version: z.number().int().positive(),
    canReceive: z.boolean(),
    items: z.array(z.object({
      id: z.string().uuid(),
      variantId: z.string().uuid(),
      productName: z.string(),
      variantName: z.string(),
      sku: z.string(),
      destinationWarehouseId: z.string().uuid().nullable(),
      destinationWarehouseName: z.string().nullable(),
      expectedQuantity: z.number().int().positive(),
      receivedQuantity: z.number().int().nonnegative(),
      missingQuantity: z.number().int().nonnegative(),
      originalUnitCost: z.number().nonnegative(),
      originalCurrencyCode: z.string().length(3),
      exchangeRateToPen: z.number().positive(),
      finalUnitCostPen: z.number().nullable(),
      preorderAllocatedQuantity: z.number().int().nonnegative(),
      inventoryLotId: z.string().uuid().nullable(),
      notes: z.string().nullable(),
    })),
    allowedTransitions: z.array(z.object({
      stateCode: importBoxStateCodeSchema,
      name: z.string(),
      requiresReason: z.boolean(),
    })),
  })),
  costs: z.array(z.object({
    id: z.string().uuid(),
    importBoxId: z.string().uuid().nullable(),
    boxCode: z.string().nullable(),
    costType: z.string(),
    description: z.string().nullable(),
    amount: z.number().nonnegative(),
    currencyCode: z.string().length(3),
    exchangeRateToPen: z.number().positive(),
    amountPen: z.number().nonnegative(),
    allocationMethod: z.string(),
    isIncludedInUnitCost: z.boolean(),
    occurredAt: z.string(),
  })),
  incidents: z.array(z.object({
    id: z.string().uuid(),
    importBoxId: z.string().uuid().nullable(),
    boxCode: z.string().nullable(),
    importBoxItemId: z.string().uuid().nullable(),
    itemLabel: z.string().nullable(),
    incidentType: z.string(),
    affectedQuantity: z.number().int().nullable(),
    description: z.string(),
    status: z.string(),
    occurredAt: z.string(),
    resolvedAt: z.string().nullable(),
    resolutionNotes: z.string().nullable(),
    insuranceClaims: z.array(z.object({
      id: z.string().uuid(),
      claimNumber: z.string().nullable(),
      claimedAmount: z.number().nullable(),
      approvedAmount: z.number().nullable(),
      currencyCode: z.string().nullable(),
      status: z.string(),
      submittedAt: z.string().nullable(),
      resolvedAt: z.string().nullable(),
      notes: z.string().nullable(),
    })),
  })),
  preorderAllocations: z.array(z.object({
    id: z.string().uuid(),
    saleItemId: z.string().uuid(),
    saleId: z.string().uuid(),
    saleCode: z.string(),
    clientName: z.string(),
    importBoxItemId: z.string().uuid(),
    itemLabel: z.string(),
    quantity: z.number().int().positive(),
    status: z.string(),
    allocatedAt: z.string(),
  })),
  history: z.array(importHistoryItemSchema),
  allowedTransitions: z.array(z.object({
    stateCode: importStateCodeSchema,
    name: z.string(),
    requiresReason: z.boolean(),
  })),
});
export type ImportDetail = z.infer<typeof importDetailSchema>;

export const importMutationResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  stateCode: z.string(),
  version: z.number().int().positive(),
});
export type ImportMutationResult = z.infer<typeof importMutationResultSchema>;

export const importGenericResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string().nullable().optional(),
  reused: z.boolean().optional(),
});
export type ImportGenericResult = z.infer<typeof importGenericResultSchema>;
