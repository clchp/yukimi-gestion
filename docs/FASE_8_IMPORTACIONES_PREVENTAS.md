# Fase 8 · Importaciones, cajas y preventas

## Alcance

Esta fase reemplaza la pantalla demostrativa de importaciones por un flujo conectado a Supabase. Una importación puede contener varias cajas y cada caja puede contener múltiples variantes con cantidades, costos, moneda, tipo de cambio y almacén de destino.

## Flujo de estados

Importación:

`QUOTATION → PURCHASE_CONFIRMED → FOREIGN_WAREHOUSE → DISPATCH_CONFIRMED → SHIPPED → IN_TRANSIT → RECEIVED_PERU → STOCKED`

Caja:

`REGISTERED → FOREIGN_WAREHOUSE → DISPATCH_CONFIRMED → SHIPPED → IN_TRANSIT → RECEIVED_PERU → STOCKED`

Las cancelaciones quedan registradas y no eliminan información.

## Funciones principales

- Registro de proveedores y operadores reutilizables.
- Creación atómica de importación, cajas y productos mediante idempotencia.
- Seguimiento general y por caja.
- Costos de tarjeta, comisión, flete, aduanas, seguro y entrega local.
- Incidencias por faltantes, daños, retrasos o productos equivocados.
- Reclamos al seguro con número, importe reclamado, importe aprobado y estado.
- Vinculación de líneas `PREORDER` con unidades esperadas.
- Recepción de una caja y creación automática de lotes.
- Ingreso del remanente a `AVAILABLE` y de preventas asignadas a `RESERVED` o `ACCUMULATED`, según la entrega acordada.
- Creación automática de incidencias cuando lo recibido es menor que lo esperado.
- Auditoría, historial y control de transiciones.

## Migración

```text
supabase/migrations/019_imports_preorders_api.sql
```

## Comprobación

```text
supabase/tests/008_phase8_imports_checks.sql
```

La comprobación correcta termina con `Success. No rows returned`.
