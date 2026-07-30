import pino from 'pino';
import type { AppEnv } from '../../config/env.js';

export function createLogger(env: Pick<AppEnv, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino({
    level: env.LOG_LEVEL,
    base: {
      service: 'yukimi-api',
      environment: env.NODE_ENV,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'authorization',
        '*.password',
        '*.access_token',
        '*.refresh_token',
      ],
      censor: '[REDACTED]',
    },
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
