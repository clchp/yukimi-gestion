# Estabilización de línea base

Fecha: 2026-07-30

## Alcance

Esta entrega estabiliza la versión 1.0 antes de introducir cambios de reglas de
negocio o de diseño. No modifica cálculos comerciales, datos iniciales, RLS ni
flujos visibles.

## Cambios realizados

- Se regeneró `package-lock.json` desde los manifiestos para eliminar la
  referencia inexistente a `@eslint/config-helpers@0.7.1`.
- Se configuró el paquete raíz como módulo ESM para evitar la carga ambigua de
  `eslint.config.js`.
- Se ajustó ESLint para permitir únicamente los `namespace` usados por la
  ampliación oficial de tipos de Express.
- Se retiraron dos importaciones sin uso.
- Se cambió el comando de pruebas de API al ejecutor nativo de Node con el
  cargador de `tsx`, evitando depender del socket IPC del CLI.
- Se añadieron pruebas de request ID, cabeceras de seguridad, CORS y rechazo de
  una ruta protegida sin sesión.
- Se conservó el alias duplicado de la migración 016 en
  `supabase/migration-archive` y se dejó una sola versión 016 ejecutable.
- Se añadió una validación estática automática para detectar versiones de
  migración repetidas, SQL idéntico y transacciones superiores desbalanceadas.
- CI ahora ejecuta lint y la validación estática de migraciones.
- Se añadió `npm run verify` como comprobación integral de la línea base.

## Verificación ejecutada

El comando siguiente termina correctamente:

```bash
npm run verify
```

Incluye:

- ESLint;
- build del paquete compartido;
- typecheck de shared, API y web;
- 8 pruebas automáticas;
- validación estática de 24 migraciones;
- build de producción.

## Pendiente para la siguiente etapa

- Ejecutar el nuevo job `database` de CI en GitHub, donde Docker está
  disponible, y corregir cualquier incompatibilidad de migración revelada por
  PostgreSQL.
- Crear pruebas funcionales con datos, RLS, idempotencia y dos sesiones
  concurrentes para los módulos restantes.
- Implementar las nuevas reglas de penalidades, devoluciones, VIP, pagos mixtos,
  boletas/RUC y costo de importación.
- Corregir el responsive y validar visualmente cada pantalla.

No se incluyen secretos, archivos `.env`, `node_modules` ni artefactos `dist`.

## Entorno de pruebas de base de datos

Se añadió una segunda capa reproducible:

- Supabase CLI 2.110.0 fijada en el lock;
- configuración local sin seed comercial;
- 19 aserciones pgTAP sobre estructura, RLS, Storage, idempotencia y bloqueo
  optimista;
- prueba con dos conexiones PostgreSQL concurrentes;
- lint de funciones PostgreSQL;
- job independiente `database` en GitHub Actions;
- guía `docs/PRUEBAS_BASE_DATOS.md`.

El entorno actual de generación no dispone de Docker ni PostgreSQL, por lo que
esta capa quedó preparada y validada estáticamente, pero su ejecución dinámica
debe ocurrir en GitHub Actions o en una computadora con Docker Desktop.
