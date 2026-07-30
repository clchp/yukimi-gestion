import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app/create-app.js';
import type { AppEnv } from '../src/config/env.js';

const testEnv: AppEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: 'http://localhost:5173',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'test-anon-key-with-more-than-twenty-characters',
  corsOrigins: ['http://localhost:5173'],
};

describe('GET /api/v1/health', () => {
  it('responde con el estado del servicio', async () => {
    const app = createApp({ env: testEnv, logger: pino({ level: 'silent' }) });
    const response = await request(app).get('/api/v1/health').expect(200);

    assert.equal(response.body.data.status, 'ok');
    assert.equal(response.body.data.service, 'yukimi-api');
  });

  it('conserva el request id y aplica cabeceras de seguridad', async () => {
    const app = createApp({ env: testEnv, logger: pino({ level: 'silent' }) });
    const response = await request(app)
      .get('/api/v1/health')
      .set('x-request-id', 'test-request-id')
      .expect(200);

    assert.equal(response.headers['x-request-id'], 'test-request-id');
    assert.equal(response.headers['x-powered-by'], undefined);
    assert.match(String(response.headers['content-security-policy']), /default-src/);
  });

  it('permite únicamente orígenes CORS configurados', async () => {
    const app = createApp({ env: testEnv, logger: pino({ level: 'silent' }) });
    const response = await request(app)
      .get('/api/v1/health')
      .set('origin', 'http://localhost:5173')
      .expect(200);

    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(response.headers['access-control-allow-credentials'], 'true');
  });
});

describe('rutas desconocidas', () => {
  it('responde con un error uniforme', async () => {
    const app = createApp({ env: testEnv, logger: pino({ level: 'silent' }) });
    const response = await request(app).get('/api/v1/no-existe').expect(404);

    assert.equal(response.body.error.code, 'ROUTE_NOT_FOUND');
    assert.ok(response.body.error.requestId);
  });
});

describe('rutas protegidas', () => {
  it('rechaza una solicitud sin token con un error uniforme', async () => {
    const app = createApp({ env: testEnv, logger: pino({ level: 'silent' }) });
    const response = await request(app).get('/api/v1/auth/me').expect(401);

    assert.equal(response.body.error.code, 'AUTHORIZATION_REQUIRED');
    assert.ok(response.body.error.requestId);
  });
});
