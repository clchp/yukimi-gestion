import { createApp } from './app/create-app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './shared/logging/logger.js';

const env = loadEnv();
const logger = createLogger(env);
const app = createApp({ env, logger });

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, `API disponible en http://localhost:${env.PORT}`);
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'Cerrando API');
  server.close((error) => {
    if (error) {
      logger.error({ error }, 'No se pudo cerrar el servidor correctamente');
      process.exitCode = 1;
      return;
    }
    process.exitCode = 0;
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
