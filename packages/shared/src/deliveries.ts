import { z } from 'zod';

export const deliveryFilterSchema = z.enum([
  'ALL',
  'PENDING_AGENCY',
  'ACCUMULATED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
]);
export type DeliveryFilter = z.infer<typeof deliveryFilterSchema>;

export const deliveryMethodSchema = z.enum([
  'AGENCY',
  'MOTORBIKE',
  'IN_PERSON',
  'WAREHOUSE_ACCUMULATION',
  'OTHER',
]);
export type DeliveryMethod = z.infer<typeof deliveryMethodSchema>;

export const deliveryStateCodeSchema = z.enum([
  'PENDING_INSTRUCTIONS',
  'ACCUMULATED',
  'PENDING_AGENCY_DISPATCH',
  'DELIVERED_TO_AGENCY',
  'OUT_FOR_DELIVERY',
  'PARTIALLY_DELIVERED',
  'DELIVERED_TO_CLIENT',
  'CANCELLED',
]);
export type DeliveryStateCode = z.infer<typeof deliveryStateCodeSchema>;

export const deliveryPartnerTypeSchema = z.enum(['AGENCY', 'COURIER']);
export type DeliveryPartnerType = z.infer<typeof deliveryPartnerTypeSchema>;

export const deliveryPartnerSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  partnerTypeCode: deliveryPartnerTypeSchema,
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
});
export type DeliveryPartner = z.infer<typeof deliveryPartnerSchema>;

export const deliveryPartnerListResponseSchema = z.object({
  items: z.array(deliveryPartnerSchema),
});
export type DeliveryPartnerListResponse = z.infer<typeof deliveryPartnerListResponseSchema>;

export const upsertDeliveryPartnerSchema = z.object({
  id: z.string().uuid().optional(),
  partnerTypeCode: deliveryPartnerTypeSchema,
  legalName: z.string().trim().min(2).max(200),
  tradeName: z.string().trim().max(200).nullable().optional(),
  contactName: z.string().trim().max(150).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  isActive: z.boolean().default(true),
  version: z.number().int().positive().optional(),
  reason: z.string().trim().min(5).max(1000),
});
export type UpsertDeliveryPartnerInput = z.infer<typeof upsertDeliveryPartnerSchema>;

export const deliveryListItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  saleId: z.string().uuid(),
  saleCode: z.string(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  clientPhone: z.string().nullable(),
  deliveryMethod: deliveryMethodSchema,
  stateCode: deliveryStateCodeSchema,
  operatorName: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  plannedDispatchDate: z.string().nullable(),
  dispatchedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  shippingCost: z.number().nonnegative(),
  currencyCode: z.string().length(3),
  itemLines: z.number().int().nonnegative(),
  totalUnits: z.number().int().nonnegative(),
  createdAt: z.string(),
  version: z.number().int().positive(),
});
export type DeliveryListItem = z.infer<typeof deliveryListItemSchema>;

export const deliveryListResponseSchema = z.object({
  items: z.array(deliveryListItemSchema),
  summary: z.object({
    pending: z.number().int().nonnegative(),
    accumulated: z.number().int().nonnegative(),
    inTransit: z.number().int().nonnegative(),
    deliveredThisMonth: z.number().int().nonnegative(),
  }),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type DeliveryListResponse = z.infer<typeof deliveryListResponseSchema>;

export const deliveryOperatorSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  types: z.array(z.string()),
});
export type DeliveryOperator = z.infer<typeof deliveryOperatorSchema>;

export const deliveryAddressSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  addressLine: z.string(),
  district: z.string().nullable(),
  province: z.string().nullable(),
  department: z.string().nullable(),
  reference: z.string().nullable(),
  isPrimary: z.boolean(),
});
export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;

export const deliverySaleItemOptionSchema = z.object({
  saleItemId: z.string().uuid(),
  productName: z.string(),
  variantName: z.string(),
  sku: z.string(),
  quantity: z.number().int().positive(),
  assignedQuantity: z.number().int().nonnegative(),
  remainingQuantity: z.number().int().nonnegative(),
  allocations: z.array(
    z.object({
      warehouseName: z.string(),
      quantity: z.number().int().positive(),
      status: z.string(),
    }),
  ),
});
export type DeliverySaleItemOption = z.infer<typeof deliverySaleItemOptionSchema>;

export const deliveryEligibleSaleSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  clientName: z.string(),
  clientPhone: z.string().nullable(),
  deliveryStateCode: z.string(),
  remainingUnits: z.number().int().positive(),
});
export type DeliveryEligibleSale = z.infer<typeof deliveryEligibleSaleSchema>;

export const deliverySupportDataSchema = z.object({
  operators: z.array(deliveryOperatorSchema),
  eligibleSales: z.array(deliveryEligibleSaleSchema),
  selectedSale: z
    .object({
      id: z.string().uuid(),
      code: z.string(),
      clientId: z.string().uuid(),
      clientName: z.string(),
      clientPhone: z.string().nullable(),
      deliveryStateCode: z.string(),
      addresses: z.array(deliveryAddressSchema),
      items: z.array(deliverySaleItemOptionSchema),
    })
    .nullable(),
});
export type DeliverySupportData = z.infer<typeof deliverySupportDataSchema>;

export const createDeliveryItemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.number().int().positive().max(999),
});

const deliveryLogisticsFields = {
  deliveryMethod: deliveryMethodSchema,
  operatorPartnerId: z.string().uuid().nullable().optional(),
  destinationAddressId: z.string().uuid().nullable().optional(),
  trackingNumber: z.string().trim().max(150).nullable().optional(),
  shippingCost: z.number().nonnegative().max(999999.99),
  costPayer: z.enum(['CLIENT', 'BUSINESS', 'SHARED', 'NOT_APPLICABLE']),
  plannedDispatchDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  items: z.array(createDeliveryItemSchema).min(1).max(100),
};

type DeliveryLogisticsValue = {
  deliveryMethod: DeliveryMethod;
  operatorPartnerId?: string | null | undefined;
  destinationAddressId?: string | null | undefined;
  plannedDispatchDate?: string | null | undefined;
  notes?: string | null | undefined;
  items: Array<{ saleItemId: string; quantity: number }>;
};

function validateDeliveryLogistics(value: DeliveryLogisticsValue, context: z.RefinementCtx): void {
  if (value.deliveryMethod === 'AGENCY' && !value.operatorPartnerId) {
    context.addIssue({ code: 'custom', path: ['operatorPartnerId'], message: 'Selecciona la agencia.' });
  }
  if (value.deliveryMethod === 'MOTORBIKE' && !value.operatorPartnerId) {
    context.addIssue({
      code: 'custom',
      path: ['operatorPartnerId'],
      message: 'Selecciona el motorizado o courier.',
    });
  }
  if (value.deliveryMethod !== 'WAREHOUSE_ACCUMULATION' && !value.destinationAddressId) {
    context.addIssue({
      code: 'custom',
      path: ['destinationAddressId'],
      message: 'Registra una dirección o punto de entrega.',
    });
  }
  if (
    ['AGENCY', 'MOTORBIKE', 'IN_PERSON'].includes(value.deliveryMethod) &&
    !value.plannedDispatchDate
  ) {
    context.addIssue({
      code: 'custom',
      path: ['plannedDispatchDate'],
      message: 'Indica la fecha planificada de despacho o entrega.',
    });
  }
  if (value.deliveryMethod === 'OTHER' && (!value.notes || value.notes.trim().length < 5)) {
    context.addIssue({
      code: 'custom',
      path: ['notes'],
      message: 'Describe el método de entrega y el acuerdo con el cliente.',
    });
  }
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    if (seen.has(item.saleItemId)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index],
        message: 'Un producto no puede repetirse en la misma entrega.',
      });
    }
    seen.add(item.saleItemId);
  });
}

export const createDeliverySchema = z
  .object({
    saleId: z.string().uuid(),
    ...deliveryLogisticsFields,
    shippingCost: deliveryLogisticsFields.shippingCost.default(0),
    costPayer: deliveryLogisticsFields.costPayer.default('CLIENT'),
  })
  .superRefine(validateDeliveryLogistics);
export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>;

export const updateDeliverySchema = z
  .object({
    version: z.number().int().positive(),
    reason: z.string().trim().min(3).max(1000),
    ...deliveryLogisticsFields,
  })
  .superRefine(validateDeliveryLogistics);
export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>;

export const updateDeliveryStateSchema = z.object({
  nextStateCode: deliveryStateCodeSchema,
  reason: z.string().trim().min(3).max(1000),
  occurredAt: z.string().datetime().nullable().optional(),
  trackingNumber: z.string().trim().max(150).nullable().optional(),
});
export type UpdateDeliveryStateInput = z.infer<typeof updateDeliveryStateSchema>;

export const deliveryHistoryItemSchema = z.object({
  id: z.string().uuid(),
  previousStateCode: z.string().nullable(),
  newStateCode: z.string(),
  reason: z.string().nullable(),
  changedByName: z.string().nullable(),
  changedAt: z.string(),
});

export const deliveryDetailSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  saleId: z.string().uuid(),
  saleCode: z.string(),
  clientId: z.string().uuid(),
  clientName: z.string(),
  clientPhone: z.string().nullable(),
  deliveryMethod: deliveryMethodSchema,
  stateCode: deliveryStateCodeSchema,
  canEdit: z.boolean(),
  operatorPartnerId: z.string().uuid().nullable(),
  operatorName: z.string().nullable(),
  destinationAddressId: z.string().uuid().nullable(),
  destinationLabel: z.string().nullable(),
  destinationAddress: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  shippingCost: z.number().nonnegative(),
  currencyCode: z.string().length(3),
  costPayer: z.string(),
  plannedDispatchDate: z.string().nullable(),
  dispatchedAt: z.string().nullable(),
  agencyReceivedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int().positive(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      saleItemId: z.string().uuid(),
      productName: z.string(),
      variantName: z.string(),
      sku: z.string(),
      quantity: z.number().int().positive(),
    }),
  ),
  history: z.array(deliveryHistoryItemSchema),
  allowedTransitions: z.array(
    z.object({
      stateCode: deliveryStateCodeSchema,
      name: z.string(),
      requiresReason: z.boolean(),
    }),
  ),
});
export type DeliveryDetail = z.infer<typeof deliveryDetailSchema>;

export const deliveryMutationResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  stateCode: deliveryStateCodeSchema,
  version: z.number().int().positive(),
});
export type DeliveryMutationResult = z.infer<typeof deliveryMutationResultSchema>;
