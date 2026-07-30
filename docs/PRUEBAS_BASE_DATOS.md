# Pruebas locales de Supabase

Esta guía reconstruye una base local desechable y ejecuta las pruebas sin usar
ni modificar la base de producción.

## Requisitos

- Node.js 24.
- Docker Desktop iniciado.
- Puertos locales 54320–54324 disponibles.

La CLI de Supabase está fijada como dependencia del proyecto. No es necesario
instalarla globalmente.

## Primera ejecución

Desde la raíz del monorepo:

```bash
npm ci
npm run db:start
npm run test:db
npm run db:stop
```

`npm run test:db` realiza lo siguiente:

1. recrea la base local y aplica las 24 migraciones;
2. ejecuta las pruebas pgTAP;
3. abre conexiones simultáneas para comprobar idempotencia y control de
   concurrencia;
4. ejecuta el analizador de funciones PostgreSQL con nivel de error.

## Pruebas incluidas

- todas las tablas públicas tienen RLS habilitado y forzado;
- las funciones `SECURITY DEFINER` fijan `search_path`;
- el rol anónimo no puede consultar clientes ni pagos;
- los buckets de Storage permanecen privados;
- una administradora activa puede leer datos;
- una cuenta inactiva o sin rol ADMIN no puede leerlos;
- repetir una creación con la misma clave idempotente no duplica registros;
- una actualización con versión obsoleta devuelve SQLSTATE `40001`;
- dos creaciones concurrentes producen un único cliente;
- de dos actualizaciones concurrentes, solo una puede confirmar la versión.

## Comandos individuales

```bash
npm run test:db:static
npm run test:db:unit
npm run test:db:concurrency
npm run test:db:lint
```

## Precauciones

- No usar `--linked` para estas pruebas.
- No sustituir `TEST_DATABASE_URL` por una conexión de producción.
- `db:reset` elimina y reconstruye únicamente la base local administrada por la
  CLI.
- Antes de enlazar un proyecto remoto, confirmar su versión con
  `SHOW server_version;` y ajustar `supabase/config.toml` si no usa PostgreSQL 15.
