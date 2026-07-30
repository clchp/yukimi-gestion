import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppEnv } from '../config/env.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { SupabaseAuthGateway } from '../modules/auth/supabase-auth.gateway.js';
import '../modules/auth/auth.types.js';
import { createHealthRouter } from '../modules/health/health.routes.js';
import { createCatalogRouter } from '../modules/catalog/catalog.routes.js';
import { createProductsRouter } from '../modules/products/products.routes.js';
import { createClientsRouter } from '../modules/clients/clients.routes.js';
import { createSalesRouter } from '../modules/sales/sales.routes.js';
import { createPaymentsRouter } from '../modules/payments/payments.routes.js';
import { createDeliveriesRouter } from '../modules/deliveries/deliveries.routes.js';
import { createImportsRouter } from '../modules/imports/imports.routes.js';
import { createFinanceRouter } from '../modules/finance/finance.routes.js';
import { createInsightsRouter } from '../modules/insights/insights.routes.js';
import { createSearchRouter } from '../modules/search/search.routes.js';
import { errorHandler, notFoundHandler } from '../shared/http/error-handler.js';
import { requestContext } from '../shared/http/request-context.js';
import type { AppLogger } from '../shared/logging/logger.js';
import { SupabaseUserClientFactory } from '../shared/supabase/user-client.js';

export interface AppDependencies {
  env: AppEnv;
  logger: AppLogger;
  authGateway?: SupabaseAuthGateway;
}

export function createApp(dependencies: AppDependencies): Express {
  const { env, logger } = dependencies;
  const authGateway =
    dependencies.authGateway ??
    new SupabaseAuthGateway({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
    });

  const userClientFactory = new SupabaseUserClientFactory({
    SUPABASE_URL: env.SUPABASE_URL,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext(logger));
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Origen no permitido por CORS.'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', createHealthRouter());
  app.use('/api/v1/auth', createAuthRouter(authGateway));
  app.use('/api/v1/catalogs', createCatalogRouter(authGateway, userClientFactory));
  app.use('/api/v1/products', createProductsRouter(authGateway, userClientFactory));
  app.use('/api/v1/clients', createClientsRouter(authGateway, userClientFactory));
  app.use('/api/v1/sales', createSalesRouter(authGateway, userClientFactory));
  app.use('/api/v1/payments', createPaymentsRouter(authGateway, userClientFactory));
  app.use('/api/v1/deliveries', createDeliveriesRouter(authGateway, userClientFactory));
  app.use('/api/v1/imports', createImportsRouter(authGateway, userClientFactory));
  app.use('/api/v1/finance', createFinanceRouter(authGateway, userClientFactory));
  app.use('/api/v1/insights', createInsightsRouter(authGateway, userClientFactory));
  app.use('/api/v1/search', createSearchRouter(authGateway, userClientFactory));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
