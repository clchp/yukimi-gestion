import { Router } from 'express';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', (_request, response) => {
    response.json({
      data: {
        status: 'ok',
        service: 'yukimi-api',
        timestamp: new Date().toISOString(),
      },
    });
  });

  return router;
}
