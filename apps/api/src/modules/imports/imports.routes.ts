import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import {
  allocatePreorderSchema,
  createImportCostSchema,
  createImportIncidentSchema,
  createInsuranceClaimSchema,
  createImportPartnerSchema,
  createPreorderSaleSchema,
  createImportSchema,
  importFilterSchema,
  receiveImportBoxSchema,
  updateImportBoxStateSchema,
  updateImportStateSchema,
  updateInsuranceClaimSchema,
} from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import { requireAuth } from '../auth/require-auth.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { ImportsService } from './imports.service.js';
import { SupabaseImportsRepository } from './supabase-imports.repository.js';

function accessTokenOrThrow(token: string | undefined): string {
  if (!token) throw new AppError({ code: 'INVALID_SESSION', message: 'No se encontró la sesión.', statusCode: 401 });
  return token;
}

const listQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  filter: importFilterSchema.default('ALL'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function createImportsRouter(authGateway: SupabaseAuthGateway, clientFactory: UserSupabaseClientFactory): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  function serviceFor(request: Request) {
    return new ImportsService(new SupabaseImportsRepository(clientFactory.create(accessTokenOrThrow(request.currentAccessToken))));
  }

  router.get('/', async (request, response, next) => {
    try {
      const query = listQuerySchema.parse(request.query);
      response.json({ data: await serviceFor(request).list(query) });
    } catch (error) { next(error); }
  });

  router.get('/support-data', async (request, response, next) => {
    try { response.json({ data: await serviceFor(request).getSupportData() }); }
    catch (error) { next(error); }
  });

  router.post('/partners', async (request, response, next) => {
    try { response.status(201).json({ data: await serviceFor(request).createPartner(createImportPartnerSchema.parse(request.body)) }); }
    catch (error) { next(error); }
  });

  router.post('/preorders', async (request, response, next) => {
    try {
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({ data: await serviceFor(request).createPreorder(createPreorderSaleSchema.parse(request.body), key) });
    } catch (error) { next(error); }
  });

  router.post('/preorders/allocate', async (request, response, next) => {
    try { response.status(201).json({ data: await serviceFor(request).allocatePreorder(allocatePreorderSchema.parse(request.body)) }); }
    catch (error) { next(error); }
  });

  router.post('/', async (request, response, next) => {
    try {
      const input = createImportSchema.parse(request.body);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.status(201).json({ data: await serviceFor(request).create(input, key) });
    } catch (error) { next(error); }
  });

  router.get('/:importId', async (request, response, next) => {
    try { response.json({ data: await serviceFor(request).getById(z.string().uuid().parse(request.params.importId)) }); }
    catch (error) { next(error); }
  });

  router.post('/:importId/state', async (request, response, next) => {
    try {
      const importId = z.string().uuid().parse(request.params.importId);
      response.json({ data: await serviceFor(request).advance(importId, updateImportStateSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  router.post('/:importId/costs', async (request, response, next) => {
    try {
      const importId = z.string().uuid().parse(request.params.importId);
      response.status(201).json({ data: await serviceFor(request).addCost(importId, createImportCostSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  router.post('/:importId/incidents', async (request, response, next) => {
    try {
      const importId = z.string().uuid().parse(request.params.importId);
      response.status(201).json({ data: await serviceFor(request).createIncident(importId, createImportIncidentSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  router.post('/:importId/insurance-claims', async (request, response, next) => {
    try {
      const importId = z.string().uuid().parse(request.params.importId);
      response.status(201).json({ data: await serviceFor(request).createInsuranceClaim(importId, createInsuranceClaimSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  router.patch('/insurance-claims/:claimId', async (request, response, next) => {
    try {
      const claimId = z.string().uuid().parse(request.params.claimId);
      response.json({ data: await serviceFor(request).updateInsuranceClaim(claimId, updateInsuranceClaimSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  router.post('/boxes/:boxId/state', async (request, response, next) => {
    try {
      const boxId = z.string().uuid().parse(request.params.boxId);
      response.json({ data: await serviceFor(request).advanceBox(boxId, updateImportBoxStateSchema.parse(request.body)) });
    } catch (error) { next(error); }
  });

  router.post('/boxes/:boxId/receive', async (request, response, next) => {
    try {
      const boxId = z.string().uuid().parse(request.params.boxId);
      const key = request.header('idempotency-key')?.trim() || randomUUID();
      response.json({ data: await serviceFor(request).receiveBox(boxId, receiveImportBoxSchema.parse(request.body), key) });
    } catch (error) { next(error); }
  });

  return router;
}
