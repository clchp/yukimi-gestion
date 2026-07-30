import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import {
  createReturnCaseSchema,
  createSaleSchema,
  requestSaleReleaseSchema,
  reviewSaleReleaseSchema,
  saleFilterSchema,
  saveSaleDraftSchema,
} from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { SalesService } from './sales.service.js';
import { SupabaseSalesRepository } from './supabase-sales.repository.js';

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  filter: saleFilterSchema.default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
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

export function createSalesRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  function serviceFor(request: Request) {
    return new SalesService(
      new SupabaseSalesRepository(
        clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
        actorIdOrThrow(request.currentUser?.id),
      ),
    );
  }

  router.get('/support-data', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request).getSupportData() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/drafts', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request).listDrafts() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/drafts', async (request, response, next) => {
    try {
      const input = saveSaleDraftSchema.parse(request.body);
      response
        .status(input.draftId ? 200 : 201)
        .json({ data: await serviceFor(request).saveDraft(input) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/drafts/:draftId', async (request, response, next) => {
    try {
      const draftId = z.string().uuid().parse(request.params.draftId);
      response.json({ data: await serviceFor(request).getDraft(draftId) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/drafts/:draftId/confirm', async (request, response, next) => {
    try {
      const draftId = z.string().uuid().parse(request.params.draftId);
      const version = z
        .object({ version: z.number().int().positive() })
        .parse(request.body).version;
      const idempotencyKey = request.header('idempotency-key')?.trim() || randomUUID();
      response.json({
        data: await serviceFor(request).confirmDraft(draftId, version, idempotencyKey),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/items/:saleItemId/release-quote', async (request, response, next) => {
    try {
      const saleItemId = z.string().uuid().parse(request.params.saleItemId);
      response.json({ data: await serviceFor(request).getReleaseQuote(saleItemId) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/items/:saleItemId/release-requests', async (request, response, next) => {
    try {
      const saleItemId = z.string().uuid().parse(request.params.saleItemId);
      const input = requestSaleReleaseSchema.parse(request.body);
      response
        .status(201)
        .json({ data: await serviceFor(request).requestRelease(saleItemId, input) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (request, response, next) => {
    try {
      const query = listQuerySchema.parse(request.query);
      response.json({ data: await serviceFor(request).list(query) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (request, response, next) => {
    try {
      const input = createSaleSchema.parse(request.body);
      const idempotencyKey = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({ data: await serviceFor(request).create(input, idempotencyKey) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:saleId/returns', async (request, response, next) => {
    try {
      const saleId = z.string().uuid().parse(request.params.saleId);
      const input = createReturnCaseSchema.parse(request.body);
      const idempotencyKey = request.header('idempotency-key')?.trim() || randomUUID();
      response
        .status(201)
        .json({ data: await serviceFor(request).createReturnCase(saleId, input, idempotencyKey) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:saleId', async (request, response, next) => {
    try {
      const saleId = z.string().uuid().parse(request.params.saleId);
      response.json({ data: await serviceFor(request).getById(saleId) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/release-requests/:requestId/review', async (request, response, next) => {
    try {
      const requestId = z.string().uuid().parse(request.params.requestId);
      const input = reviewSaleReleaseSchema.parse(request.body);
      response.json({ data: await serviceFor(request).reviewRelease(requestId, input) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
