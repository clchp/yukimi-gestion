# Respaldo y restauración

## Respaldo automático

`.github/workflows/backup.yml` ejecuta semanalmente `npm run backup:export` y guarda el JSON como artefacto privado durante 14 días. También puede ejecutarse manualmente.

Secretos requeridos:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

El respaldo es lógico y contiene las tablas de configuración, catálogo, inventario, ventas, pagos, entregas, importaciones, finanzas, notificaciones y auditoría. Los archivos de Storage deben respaldarse con la función de backup del proveedor o copiando los buckets por separado.

## Exportación local

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run backup:export
```

Se puede elegir la ruta con `BACKUP_OUTPUT` y limitar tablas con `BACKUP_TABLES`.

## Restauración controlada

La restauración está bloqueada salvo confirmación explícita:

```bash
CONFIRM_RESTORE=YUKIMI_RESTORE \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run backup:restore -- backups/yukimi-backup.json
```

Por defecto se omiten `audit_log` y `outbox_events`, porque son históricos/operativos. Puede cambiarse con `RESTORE_SKIP_TABLES`. Se recomienda restaurar primero en un proyecto de prueba y ejecutar todas las pruebas de base de datos antes de usarlo en producción.
