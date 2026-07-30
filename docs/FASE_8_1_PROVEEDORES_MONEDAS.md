# Fase 8.1 — Proveedores únicos y monedas internacionales

## Correcciones

- Al crear un proveedor con el mismo nombre, sin importar mayúsculas, tildes, espacios o signos, se reutiliza el registro existente y no se crea otro.
- La protección se realiza también en la base de datos y usa un bloqueo transaccional para evitar duplicados si dos administradoras crean el mismo proveedor al mismo tiempo.
- Los proveedores activos repetidos creados antes de esta corrección se consolidan: se conservan sus relaciones y el duplicado queda inactivo, nunca se elimina físicamente.
- Se activan PEN, USD, JPY, CNY, KRW, EUR, GBP, HKD, CAD y AUD.
- El formulario selecciona automáticamente un proveedor ya existente y muestra una confirmación clara.

## Migración

Ejecutar `020_partner_dedup_and_import_currencies.sql` después de la migración 019.

## Verificación

Ejecutar `009_phase8_1_partner_currency_checks.sql`. El resultado correcto es `Success. No rows returned`.
