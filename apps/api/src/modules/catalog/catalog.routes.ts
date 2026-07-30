import { Router } from 'express';
import { createCatalogItemSchema } from '@yukimi/shared';
import { z } from 'zod';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import { AppError } from '../../shared/errors/app-error.js';
import { CatalogService } from './catalog.service.js';
import { SupabaseCatalogRepository } from './supabase-catalog.repository.js';
import type { CatalogKind } from './catalog.repository.js';

const kindSchema = z.enum(['categories', 'franchises', 'brands', 'product-lines']);
const statusSchema = z.object({
  isActive: z.boolean(),
  version: z.number().int().positive(),
});

function actorIdOrThrow(id: string | undefined): string {
  if (!id) {
    throw new AppError({ code: 'INVALID_SESSION', message: 'No se encontró el usuario de la sesión.', statusCode: 401 });
  }
  return id;
}

function accessTokenOrThrow(token: string | undefined): string {
  if (!token) {
    throw new AppError({ code: 'INVALID_SESSION', message: 'No se encontró la sesión.', statusCode: 401 });
  }
  return token;
}

export function createCatalogRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  router.get('/', async (request, response, next) => {
    try {
      const service = new CatalogService(
        new SupabaseCatalogRepository(
          clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
          actorIdOrThrow(request.currentUser?.id),
        ),
      );
      response.json({ data: await service.listAll() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:kind', async (request, response, next) => {
    try {
      const kind = kindSchema.parse(request.params.kind) as CatalogKind;
      const input = createCatalogItemSchema.parse(request.body);
      const service = new CatalogService(
        new SupabaseCatalogRepository(
          clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
          actorIdOrThrow(request.currentUser?.id),
        ),
      );
      response.status(201).json({ data: await service.create(kind, input) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:kind/:id/status', async (request, response, next) => {
    try {
      const kind = kindSchema.parse(request.params.kind) as CatalogKind;
      const id = z.string().uuid().parse(request.params.id);
      const input = statusSchema.parse(request.body);
      const service = new CatalogService(
        new SupabaseCatalogRepository(
          clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
          actorIdOrThrow(request.currentUser?.id),
        ),
      );
      response.json({ data: await service.setActive(kind, id, input.isActive, input.version) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
