import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  attachmentRegistrationSchema,
  createInventoryMovementSchema,
  createProductSchema,
  updateProductResultSchema,
  updateProductSchema,
} from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { ProductService } from './products.service.js';
import { SupabaseProductRepository } from './supabase-products.repository.js';

const productListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const inventoryQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  warehouseId: z.string().uuid().optional(),
  includeVirtual: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
});

function actorIdOrThrow(id: string | undefined): string {
  if (!id)
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró el usuario de la sesión.',
      statusCode: 401,
    });
  return id;
}

function accessTokenOrThrow(token: string | undefined): string {
  if (!token)
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró la sesión.',
      statusCode: 401,
    });
  return token;
}

function serviceFor(
  token: string | undefined,
  actorId: string | undefined,
  clientFactory: UserSupabaseClientFactory,
) {
  return new ProductService(
    new SupabaseProductRepository(
      clientFactory.create(accessTokenOrThrow(token)),
      actorIdOrThrow(actorId),
    ),
  );
}

function updatePayload(input: z.infer<typeof updateProductSchema>): Record<string, unknown> {
  return {
    name: input.name,
    franchise_id: input.franchiseId ?? null,
    character_name: input.characterName ?? null,
    category_id: input.categoryId,
    brand_id: input.brandId ?? null,
    product_line_id: input.productLineId ?? null,
    description: input.description ?? null,
    is_active: input.isActive,
    version: input.version,
    reason: input.reason,
    variants: input.variants.map((variant) => ({
      id: variant.id,
      variant_name: variant.variantName,
      barcode: variant.barcode ?? null,
      sale_price: variant.salePrice,
      currency_code: variant.currencyCode,
      minimum_stock: variant.minimumStock,
      weight_grams: variant.weightGrams ?? null,
      dimensions: variant.dimensions,
      attributes: variant.attributes,
      is_active: variant.isActive,
      version: variant.version,
    })),
  };
}

export function createProductsRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  router.get('/', async (request, response, next) => {
    try {
      const query = productListQuerySchema.parse(request.query);
      response.json({
        data: await serviceFor(
          request.currentAccessToken,
          request.currentUser?.id,
          clientFactory,
        ).list(query),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (request, response, next) => {
    try {
      const input = createProductSchema.parse(request.body);
      const idempotencyKey = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({
        data: await serviceFor(
          request.currentAccessToken,
          request.currentUser?.id,
          clientFactory,
        ).create(input, idempotencyKey),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/inventory/movements', async (request, response, next) => {
    try {
      const input = createInventoryMovementSchema.parse(request.body);
      const idempotencyKey = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({
        data: await serviceFor(
          request.currentAccessToken,
          request.currentUser?.id,
          clientFactory,
        ).createInventoryMovement(input, idempotencyKey),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/inventory/summary', async (request, response, next) => {
    try {
      const query = inventoryQuerySchema.parse(request.query);
      response.json({
        data: await serviceFor(
          request.currentAccessToken,
          request.currentUser?.id,
          clientFactory,
        ).listInventory(query),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:productId/attributes', async (request, response, next) => {
    try {
      const productId = z.string().uuid().parse(request.params.productId);
      const client = clientFactory.create(accessTokenOrThrow(request.currentAccessToken));
      const variants = await client
        .from('product_variants')
        .select('id')
        .eq('product_id', productId)
        .returns<Array<{ id: string }>>();
      if (variants.error)
        throw mapSupabaseError(variants.error, 'No se pudieron cargar las variantes.');
      const variantIds = (variants.data ?? []).map((item) => item.id);
      if (variantIds.length === 0) {
        response.json({ data: { items: [] } });
        return;
      }
      const [values, definitions] = await Promise.all([
        client
          .from('product_variant_attribute_values')
          .select('variant_id,attribute_id,value_text,value_number,value_boolean,value_date')
          .in('variant_id', variantIds),
        client
          .from('product_attribute_definitions')
          .select('id,code,name,data_type,is_active')
          .eq('is_active', true),
      ]);
      if (values.error)
        throw mapSupabaseError(values.error, 'No se pudieron cargar los atributos guardados.');
      if (definitions.error)
        throw mapSupabaseError(
          definitions.error,
          'No se pudieron cargar los atributos disponibles.',
        );
      response.json({
        data: {
          definitions: (definitions.data ?? []).map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            dataType: item.data_type,
          })),
          items: values.data ?? [],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:productId/bundle-v2', async (request, response, next) => {
    try {
      const productId = z.string().uuid().parse(request.params.productId);
      const input = updateProductSchema.parse(request.body);
      const client = clientFactory.create(accessTokenOrThrow(request.currentAccessToken));
      const { data, error } = await client.rpc('update_product_bundle_v2', {
        p_product_id: productId,
        p_payload: updatePayload(input),
      });
      if (error)
        throw mapSupabaseError(error, 'No se pudo actualizar el producto y sus atributos.');
      response.json({ data: updateProductResultSchema.parse(data) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:productId', async (request, response, next) => {
    try {
      const productId = z.string().uuid().parse(request.params.productId);
      response.json({
        data: await serviceFor(
          request.currentAccessToken,
          request.currentUser?.id,
          clientFactory,
        ).get(productId),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:productId', async (request, response, next) => {
    try {
      const productId = z.string().uuid().parse(request.params.productId);
      const input = updateProductSchema.parse(request.body);
      response.json({
        data: await serviceFor(
          request.currentAccessToken,
          request.currentUser?.id,
          clientFactory,
        ).update(productId, input),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:productId/attachments', async (request, response, next) => {
    try {
      const productId = z.string().uuid().parse(request.params.productId);
      const input = attachmentRegistrationSchema.parse(request.body);
      response.status(201).json({
        data: await serviceFor(
          request.currentAccessToken,
          request.currentUser?.id,
          clientFactory,
        ).registerAttachment(productId, input),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
