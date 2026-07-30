import { Router, type Request } from 'express';
import { globalSearchResponseSchema } from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(30).default(12),
});

function accessTokenOrThrow(request: Request): string {
  if (!request.currentAccessToken) {
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró la sesión.',
      statusCode: 401,
    });
  }
  return request.currentAccessToken;
}

export function createSearchRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  router.get('/', async (request, response, next) => {
    try {
      const query = querySchema.parse(request.query);
      const client = clientFactory.create(accessTokenOrThrow(request));
      const { data, error } = await client.rpc('global_search_v1', {
        p_query: query.q,
        p_limit: query.limit,
      });
      if (error) throw mapSupabaseError(error, 'No se pudo ejecutar la búsqueda global.');
      response.json({ data: globalSearchResponseSchema.parse(data) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
