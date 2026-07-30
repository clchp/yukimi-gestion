import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import {
  createClientAddressInputSchema,
  createClientIncidentSchema,
  createClientSchema,
  resolveClientIncidentSchema,
  setClientStatusSchema,
  setClientVipSchema,
  updateClientAddressSchema,
  updateClientSchema,
} from '@yukimi/shared';
import { z } from 'zod';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import { ClientService } from './clients.service.js';
import { SupabaseClientRepository } from './supabase-clients.repository.js';

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  filter: z.enum(['ALL', 'ACTIVE', 'VIP', 'WITH_DEBT', 'OVERDUE', 'INACTIVE']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function accessTokenOrThrow(token: string | undefined): string {
  if (!token)
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró la sesión.',
      statusCode: 401,
    });
  return token;
}

function serviceFor(request: Request, clientFactory: UserSupabaseClientFactory) {
  return new ClientService(
    new SupabaseClientRepository(
      clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
    ),
  );
}

export function createClientsRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  router.get('/', async (request, response, next) => {
    try {
      const query = listQuerySchema.parse(request.query);
      response.json({ data: await serviceFor(request, clientFactory).list(query) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/support-data', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request, clientFactory).getSupportData() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:clientId', async (request, response, next) => {
    try {
      const clientId = z.string().uuid().parse(request.params.clientId);
      response.json({ data: await serviceFor(request, clientFactory).getById(clientId) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (request, response, next) => {
    try {
      const input = createClientSchema.parse(request.body);
      const idempotencyKey = request.header('idempotency-key')?.trim() || randomUUID();
      response
        .status(201)
        .json({ data: await serviceFor(request, clientFactory).create(input, idempotencyKey) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:clientId', async (request, response, next) => {
    try {
      const clientId = z.string().uuid().parse(request.params.clientId);
      const input = updateClientSchema.parse(request.body);
      response.json({ data: await serviceFor(request, clientFactory).update(clientId, input) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:clientId/status', async (request, response, next) => {
    try {
      const clientId = z.string().uuid().parse(request.params.clientId);
      const input = setClientStatusSchema.parse(request.body);
      response.json({ data: await serviceFor(request, clientFactory).setStatus(clientId, input) });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:clientId/vip', async (request, response, next) => {
    try {
      const clientId = z.string().uuid().parse(request.params.clientId);
      const input = setClientVipSchema.parse(request.body);
      response.json({ data: await serviceFor(request, clientFactory).setVip(clientId, input) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/addresses', async (request, response, next) => {
    try {
      const clientId = z.string().uuid().parse(request.params.clientId);
      const input = createClientAddressInputSchema.parse(request.body);
      response.status(201).json({
        data: await serviceFor(request, clientFactory).saveAddress(clientId, null, input, null),
      });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:clientId/addresses/:addressId', async (request, response, next) => {
    try {
      const clientId = z.string().uuid().parse(request.params.clientId);
      const addressId = z.string().uuid().parse(request.params.addressId);
      const input = updateClientAddressSchema.parse(request.body);
      response.json({
        data: await serviceFor(request, clientFactory).saveAddress(
          clientId,
          addressId,
          input,
          input.version,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:clientId/incidents', async (request, response, next) => {
    try {
      const clientId = z.string().uuid().parse(request.params.clientId);
      const input = createClientIncidentSchema.parse(request.body);
      response
        .status(201)
        .json({ data: await serviceFor(request, clientFactory).createIncident(clientId, input) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/incidents/:incidentId/resolve', async (request, response, next) => {
    try {
      const incidentId = z.string().uuid().parse(request.params.incidentId);
      const input = resolveClientIncidentSchema.parse(request.body);
      response.json({
        data: await serviceFor(request, clientFactory).resolveIncident(incidentId, input),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
