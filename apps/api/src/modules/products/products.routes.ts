import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  attachmentRegistrationSchema,
  createInventoryMovementSchema,
  createProductSchema,
  updateProductSchema,
} from '@yukimi/shared';
import { z } from 'zod';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
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
  if (!id) {
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró el usuario de la sesión.',
      statusCode: 401,
    });
  }
  return id;
}

function accessTokenOrThrow(token: string | undefined): string {
  if (!token) {
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró la sesión.',
      statusCode: 401,
    });
  }
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

export function createProductsRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  router.get('/', async (request, response, next) => {
    try {
      const query = productListQuerySchema.parse(request.query);
      const service = serviceFor(
        request.currentAccessToken,
        request.currentUser?.id,
        clientFactory,
      );
      response.json({ data: await service.list(query) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (request, response, next) => {
    try {
      const input = createProductSchema.parse(request.body);
      const idempotencyKey = request.header('idempotency-key')?.trim() || randomUUID();
      const service = serviceFor(
        request.currentAccessToken,
        request.currentUser?.id,
        clientFactory,
      );
      response.status(201).json({ data: await service.create(input, idempotencyKey) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/inventory/movements', async (request, response, next) => {
    try {
      const input = createInventoryMovementSchema.parse(request.body);
      const idempotencyKey = request.header('idempotency-key')?.trim() || randomUUID();
      const service = serviceFor(
        request.currentAccessToken,
        request.currentUser?.id,
        clientFactory,
      );
      response
        .status(201)
        .json({ data: await service.createInventoryMovement(input, idempotencyKey) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/inventory/summary', async (request, response, next) => {
    try {
      const query = inventoryQuerySchema.parse(request.query);
      const service = serviceFor(
        request.currentAccessToken,
        request.currentUser?.id,
        clientFactory,
      );
      response.json({ data: await service.listInventory(query) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:productId', async (request, response, next) => {
    try {
      const productId = z.string().uuid().parse(request.params.productId);
      const service = serviceFor(
        request.currentAccessToken,
        request.currentUser?.id,
        clientFactory,
      );
      response.json({ data: await service.get(productId) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:productId', async (request, response, next) => {
    try {
      const productId = z.string().uuid().parse(request.params.productId);
      const input = updateProductSchema.parse(request.body);
      const service = serviceFor(
        request.currentAccessToken,
        request.currentUser?.id,
        clientFactory,
      );
      response.json({ data: await service.update(productId, input) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:productId/attachments', async (request, response, next) => {
    try {
      const productId = z.string().uuid().parse(request.params.productId);
      const input = attachmentRegistrationSchema.parse(request.body);
      const service = serviceFor(
        request.currentAccessToken,
        request.currentUser?.id,
        clientFactory,
      );
      response.status(201).json({ data: await service.registerAttachment(productId, input) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
