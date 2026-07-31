import { z } from 'zod';

export const productMaintenanceVariantSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  variantName: z.string(),
  barcode: z.string().nullable(),
  salePrice: z.number().nonnegative(),
  currencyCode: z.string().length(3),
  minimumStock: z.number().int().nonnegative(),
  weightGrams: z.number().nonnegative().nullable(),
  dimensions: z.record(z.string(), z.union([z.string(), z.number()])),
  isActive: z.boolean(),
  version: z.number().int().positive(),
});
export type ProductMaintenanceVariant = z.infer<typeof productMaintenanceVariantSchema>;

export const productDetailSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  characterName: z.string().nullable(),
  categoryId: z.string().uuid(),
  categoryName: z.string(),
  franchiseId: z.string().uuid().nullable(),
  franchiseName: z.string().nullable(),
  brandId: z.string().uuid().nullable(),
  brandName: z.string().nullable(),
  productLineId: z.string().uuid().nullable(),
  productLineName: z.string().nullable(),
  description: z.string().nullable(),
  imagePaths: z.array(z.string()),
  isActive: z.boolean(),
  version: z.number().int().positive(),
  variants: z.array(productMaintenanceVariantSchema).min(1),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const updateProductVariantSchema = z.object({
  id: z.string().uuid(),
  variantName: z.string().trim().min(1).max(160),
  barcode: z.string().trim().max(120).nullable().optional(),
  salePrice: z.number().nonnegative(),
  currencyCode: z.string().length(3),
  minimumStock: z.number().int().nonnegative(),
  weightGrams: z.number().nonnegative().nullable().optional(),
  dimensions: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  isActive: z.boolean(),
  version: z.number().int().positive(),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    franchiseId: z.string().uuid().nullable().optional(),
    characterName: z.string().trim().max(160).nullable().optional(),
    categoryId: z.string().uuid(),
    brandId: z.string().uuid().nullable().optional(),
    productLineId: z.string().uuid().nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    isActive: z.boolean(),
    version: z.number().int().positive(),
    reason: z.string().trim().min(5).max(1000),
    variants: z.array(updateProductVariantSchema).min(1).max(50),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.variants.forEach((variant, index) => {
      if (ids.has(variant.id)) {
        context.addIssue({
          code: 'custom',
          path: ['variants', index, 'id'],
          message: 'Una variante no puede aparecer más de una vez.',
        });
      }
      ids.add(variant.id);
    });
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const updateProductResultSchema = z.object({
  productId: z.string().uuid(),
  version: z.number().int().positive(),
  updatedVariants: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export type UpdateProductResult = z.infer<typeof updateProductResultSchema>;
