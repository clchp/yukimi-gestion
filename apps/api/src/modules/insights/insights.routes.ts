import { Router, type Request } from 'express';
import { registerReportExportSchema } from '@yukimi/shared';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { UserSupabaseClientFactory } from '../../shared/supabase/user-client.js';
import type { SupabaseAuthGateway } from '../auth/supabase-auth.gateway.js';
import { requireAuth } from '../auth/require-auth.js';
import { InsightsService } from './insights.service.js';
import { SupabaseInsightsRepository } from './supabase-insights.repository.js';

function accessTokenOrThrow(token: string | undefined): string {
  if (!token)
    throw new AppError({
      code: 'INVALID_SESSION',
      message: 'No se encontró la sesión.',
      statusCode: 401,
    });
  return token;
}

const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(['NEW', 'READ', 'RESOLVED', 'DISMISSED']).optional(),
});

const notificationStatusSchema = z.object({ status: z.enum(['READ', 'RESOLVED', 'DISMISSED']) });

const reportQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  warehouseId: z.string().uuid().optional(),
});

const auditQuerySchema = z.object({
  search: z.string().trim().max(150).optional(),
  action: z.string().trim().max(30).optional(),
  module: z.string().trim().max(30).optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function createInsightsRouter(
  authGateway: SupabaseAuthGateway,
  clientFactory: UserSupabaseClientFactory,
): Router {
  const router = Router();
  router.use(requireAuth(authGateway));

  function serviceFor(request: Request): InsightsService {
    return new InsightsService(
      new SupabaseInsightsRepository(
        clientFactory.create(accessTokenOrThrow(request.currentAccessToken)),
      ),
    );
  }

  router.get('/dashboard', async (request, response, next) => {
    try {
      response.json({ data: await serviceFor(request).getDashboard() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/notifications', async (request, response, next) => {
    try {
      const query = notificationQuerySchema.parse(request.query);
      response.json({
        data: await serviceFor(request).getNotifications(query.limit, query.status),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/notifications/:notificationId/status', async (request, response, next) => {
    try {
      const notificationId = z.string().uuid().parse(request.params.notificationId);
      const input = notificationStatusSchema.parse(request.body);
      response.json({
        data: await serviceFor(request).setNotificationStatus(notificationId, input.status),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/reports', async (request, response, next) => {
    try {
      const query = reportQuerySchema.parse(request.query);
      response.json({
        data: await serviceFor(request).getReports(
          query.startDate,
          query.endDate,
          query.warehouseId,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/reports/exports', async (request, response, next) => {
    try {
      response.status(201).json({
        data: await serviceFor(request).registerReportExport(
          registerReportExportSchema.parse(request.body),
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/audit', async (request, response, next) => {
    try {
      const query = auditQuerySchema.parse(request.query);
      response.json({ data: await serviceFor(request).getAuditLog(query) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
