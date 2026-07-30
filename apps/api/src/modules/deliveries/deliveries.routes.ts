import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import {
  createDeliverySchema,
  deliveryFilterSchema,
  updateDeliverySchema,
  updateDeliveryStateSchema,
} from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { DeliveriesService } from './deliveries.service.js';
import { SupabaseDeliveriesRepository } from './supabase-deliveries.repository.js';

function actorIdOrThrow(id: string | undefined): string {
  if (!id) throw new AppError({ code: 'INVALID_SESSION', message: 'No se encontró el usuario de la sesión.', statusCode: 401 });
  return id;
}
function accessTokenOrThrow(token: string | undefined): string {
  if (!token) throw new AppError({ code: 'INVALID_SESSION', message: 'No se encontró la sesión.', statusCode: 401 });
  return token;
}

const listQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  filter: deliveryFilterSchema.default('ALL'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function createDeliveriesRouter(authGateway: SupabaseAuthGateway, clientFactory: UserSupabaseClientFactory): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  function serviceFor(request: Request) {
    return new DeliveriesService(new SupabaseDeliveriesRepository(
      clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
      actorIdOrThrow(request.currentUser?.id),
    ));
  }

  router.get('/', async (request, response, next) => {
    try {
      const query = listQuerySchema.parse(request.query);
      response.json({ data: await serviceFor(request).list(query) });
    } catch (error) { next(error); }
  });

  router.get('/support-data', async (request, response, next) => {
    try {
      const saleId = request.query.saleId ? z.string().uuid().parse(request.query.saleId) : undefined;
      const deliveryId = request.query.deliveryId ? z.string().uuid().parse(request.query.deliveryId) : undefined;
      response.json({ data: await serviceFor(request).getSupportData(saleId, deliveryId) });
    } catch (error) { next(error); }
  });

  router.get('/:deliveryId', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request).getById(z.string().uuid().parse(request.params.deliveryId)) });
    } catch (error) { next(error); }
  });

  router.post('/', async (request, response, next) => {
    try {
      const input = createDeliverySchema.parse(request.body);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({ data: await serviceFor(request).create(input, key) });
    } catch (error) { next(error); }
  });


  router.patch('/:deliveryId', async (request, response, next) => {
    try {
      const deliveryId = z.string().uuid().parse(request.params.deliveryId);
      const input = updateDeliverySchema.parse(request.body);
      response.json({ data: await serviceFor(request).update(deliveryId, input) });
    } catch (error) { next(error); }
  });

  router.post('/:deliveryId/state', async (request, response, next) => {
    try {
      const deliveryId = z.string().uuid().parse(request.params.deliveryId);
      const input = updateDeliveryStateSchema.parse(request.body);
      response.json({ data: await serviceFor(request).advance(deliveryId, input) });
    } catch (error) { next(error); }
  });

  return router;
}
