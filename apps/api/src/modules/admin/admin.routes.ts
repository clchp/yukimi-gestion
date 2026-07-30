import { Router, type Request } from 'express';
import {
  notificationPreferenceInputSchema,
  pushSubscriptionInputSchema,
  updateAdminProfileSchema,
  updateBusinessSettingSchema,
  upsertFinancialAccountSchema,
  upsertWarehouseSchema,
} from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { AdminService } from './admin.service.js';
import { SupabaseAdminRepository } from './supabase-admin.repository.js';

function accessTokenOrThrow(token: string | undefined): string {
  if (!token)
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró la sesión.',
      statusCode: 401,
    });
  return token;
}

export function createAdminRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));
  const serviceFor = (request: Request) =>
    new AdminService(
      new SupabaseAdminRepository(
        clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
      ),
    );

  router.get('/settings', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request).getSettings() });
    } catch (error) {
      next(error);
    }
  });
  router.patch('/settings/:key', async (request, response, next) => {
    try {
      response.json({
        data: await serviceFor(request).updateSetting(
          z.string().min(2).max(160).parse(request.params.key),
          updateBusinessSettingSchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post('/warehouses', async (request, response, next) => {
    try {
      response.status(201).json({
        data: await serviceFor(request).upsertWarehouse(upsertWarehouseSchema.parse(request.body)),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post('/financial-accounts', async (request, response, next) => {
    try {
      response.status(201).json({
        data: await serviceFor(request).upsertFinancialAccount(
          upsertFinancialAccountSchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.patch('/profiles/:profileId', async (request, response, next) => {
    try {
      response.json({
        data: await serviceFor(request).updateProfile(
          z.string().uuid().parse(request.params.profileId),
          updateAdminProfileSchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.put('/notification-preferences', async (request, response, next) => {
    try {
      response.json({
        data: await serviceFor(request).upsertNotificationPreference(
          notificationPreferenceInputSchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.post('/push-subscriptions', async (request, response, next) => {
    try {
      response.status(201).json({
        data: await serviceFor(request).upsertPushSubscription(
          pushSubscriptionInputSchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });
  router.get('/capacity', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request).getCapacitySnapshot() });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
