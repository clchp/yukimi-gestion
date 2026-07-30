import { z } from 'zod';

export const catalogItemSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
  version: z.number().int().positive().optional(),
});

export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const productLineItemSchema = catalogItemSchema.extend({
  brandId: z.string().uuid().nullable(),
});

export type ProductLineItem = z.infer<typeof productLineItemSchema>;

export const warehouseItemSchema = catalogItemSchema.extend({
  warehouseType: z.enum(['OPERATIONAL', 'FOREIGN', 'TRANSIT', 'OTHER']),
  isVirtual: z.boolean(),
  isVisibleInOperations: z.boolean(),
});

export type WarehouseItem = z.infer<typeof warehouseItemSchema>;

export const attributeDefinitionSchema = catalogItemSchema.extend({
  dataType: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'COLOR', 'DATE']),
  allowedValues: z.array(z.string()).nullable(),
  sortOrder: z.number().int(),
});

export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;

export const catalogsResponseSchema = z.object({
  categories: z.array(catalogItemSchema),
  franchises: z.array(catalogItemSchema),
  brands: z.array(catalogItemSchema),
  productLines: z.array(productLineItemSchema),
  attributeDefinitions: z.array(attributeDefinitionSchema),
  warehouses: z.array(warehouseItemSchema),
  currencies: z.array(
    z.object({
      code: z.string().length(3),
      name: z.string(),
      symbol: z.string(),
      decimalPlaces: z.number().int().nonnegative(),
      isActive: z.boolean(),
    }),
  ),
});

export type CatalogsResponse = z.infer<typeof catalogsResponseSchema>;

export const createCatalogItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  releasePenaltyAmount: z.number().nonnegative().nullable().optional(),
  releasePenaltyCurrency: z.string().length(3).nullable().optional(),
});

export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;

export const initialStockInputSchema = z.object({
  warehouseId: z.string().uuid(),
  quantity: z.number().int().nonnegative(),
  originalCurrencyCode: z.string().length(3).default('PEN'),
  originalUnitCost: z.number().nonnegative().default(0),
  exchangeRateToPen: z.number().positive().default(1),
});

export type InitialStockInput = z.infer<typeof initialStockInputSchema>;

export const variantAttributeInputSchema = z
  .object({
    attributeId: z.string().uuid(),
    valueText: z.string().trim().min(1).optional(),
    valueNumber: z.number().optional(),
    valueBoolean: z.boolean().optional(),
    valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((value, context) => {
    const count = [value.valueText, value.valueNumber, value.valueBoolean, value.valueDate].filter(
      (item) => item !== undefined,
    ).length;
    if (count !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'Cada atributo debe tener exactamente un valor.',
      });
    }
  });

export type VariantAttributeInput = z.infer<typeof variantAttributeInputSchema>;

export const createProductVariantSchema = z.object({
  variantName: z.string().trim().min(1).max(160).default('Estándar'),
  barcode: z.string().trim().max(120).nullable().optional(),
  salePrice: z.number().nonnegative(),
  currencyCode: z.string().length(3).default('PEN'),
  minimumStock: z.number().int().nonnegative().default(0),
  weightGrams: z.number().nonnegative().nullable().optional(),
  dimensions: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  attributes: z.array(variantAttributeInputSchema).default([]),
  initialStock: z.array(initialStockInputSchema).default([]),
  isActive: z.boolean().default(true),
});

export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;

export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(200),
  franchiseId: z.string().uuid().nullable().optional(),
  characterName: z.string().trim().max(160).nullable().optional(),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().nullable().optional(),
  productLineId: z.string().uuid().nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  isActive: z.boolean().default(true),
  variants: z.array(createProductVariantSchema).min(1).max(50),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const createProductResultSchema = z.object({
  productId: z.string().uuid(),
  productCode: z.string(),
  variants: z.array(
    z.object({
      id: z.string().uuid(),
      sku: z.string(),
      variantName: z.string(),
    }),
  ),
  inventoryMovementId: z.string().uuid().nullable(),
});

export type CreateProductResult = z.infer<typeof createProductResultSchema>;

export const productListItemSchema = z.object({
  productId: z.string().uuid(),
  productCode: z.string(),
  productName: z.string(),
  characterName: z.string().nullable(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  franchiseId: z.string().uuid().nullable(),
  franchiseName: z.string().nullable(),
  brandName: z.string().nullable(),
  productLineName: z.string().nullable(),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  imagePath: z.string().nullable(),
  variants: z.array(
    z.object({
      variantId: z.string().uuid(),
      sku: z.string(),
      variantName: z.string(),
      salePrice: z.number(),
      currencyCode: z.string().length(3),
      minimumStock: z.number().int().nonnegative(),
      availableQuantity: z.number().int().nonnegative(),
      reservedQuantity: z.number().int().nonnegative(),
      accumulatedQuantity: z.number().int().nonnegative(),
      damagedQuantity: z.number().int().nonnegative(),
      lostQuantity: z.number().int().nonnegative(),
      inTransitQuantity: z.number().int().nonnegative(),
      preorderExpectedQuantity: z.number().int().nonnegative(),
      isActive: z.boolean(),
    }),
  ),
});

export type ProductListItem = z.infer<typeof productListItemSchema>;

export const productSummarySchema = z.object({
  activeProducts: z.number().int().nonnegative(),
  availableUnits: z.number().int().nonnegative(),
  preorderUnits: z.number().int().nonnegative(),
  lowStockVariants: z.number().int().nonnegative(),
});

export type ProductSummary = z.infer<typeof productSummarySchema>;

export const productListResponseSchema = z.object({
  items: z.array(productListItemSchema),
  summary: productSummarySchema,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});

export type ProductListResponse = z.infer<typeof productListResponseSchema>;

export const inventoryRowSchema = z.object({
  variantId: z.string().uuid(),
  productId: z.string().uuid(),
  productCode: z.string(),
  sku: z.string(),
  productName: z.string(),
  variantName: z.string(),
  categoryName: z.string(),
  franchiseName: z.string().nullable(),
  warehouseId: z.string().uuid(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  availableQuantity: z.number().int().nonnegative(),
  reservedQuantity: z.number().int().nonnegative(),
  accumulatedQuantity: z.number().int().nonnegative(),
  damagedQuantity: z.number().int().nonnegative(),
  lostQuantity: z.number().int().nonnegative(),
  inTransitQuantity: z.number().int().nonnegative(),
  preorderExpectedQuantity: z.number().int().nonnegative(),
  minimumStock: z.number().int().nonnegative(),
  salePrice: z.number(),
  currentUnitCostPen: z.number().nonnegative().nullable(),
  currencyCode: z.string().length(3),
  isActive: z.boolean(),
});

export type InventoryRow = z.infer<typeof inventoryRowSchema>;

export const inventoryResponseSchema = z.object({
  items: z.array(inventoryRowSchema),
  totals: z.object({
    available: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    accumulated: z.number().int().nonnegative(),
    damaged: z.number().int().nonnegative(),
    lost: z.number().int().nonnegative(),
    inTransit: z.number().int().nonnegative(),
    preorderExpected: z.number().int().nonnegative(),
  }),
});

export type InventoryResponse = z.infer<typeof inventoryResponseSchema>;

export const attachmentRegistrationSchema = z.object({
  bucketId: z.literal('product-images'),
  objectPath: z.string().trim().min(1).max(500),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().nonnegative().max(5 * 1024 * 1024),
  isCover: z.boolean().default(false),
});

export type AttachmentRegistrationInput = z.infer<typeof attachmentRegistrationSchema>;
