import { Router } from 'express';
import type { SupabaseAuthGateway } from './supabase-auth.gateway.js';
import { requireAuth } from './require-auth.js';

export function createAuthRouter(authGateway: SupabaseAuthGateway): Router {
  const router = Router();

  router.get('/me', requireAuth(authGateway), (request, response) => {
    response.json({ data: request.currentUser });
  });

  return router;
}
