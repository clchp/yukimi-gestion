# Fase 6 — Pagos, boletas y penalidades

Esta fase incorpora pagos parciales y combinados, constancias privadas, confirmación y reversión con movimientos financieros compensatorios, actualización automática del saldo de la venta, boletas registradas manualmente desde SUNAT, archivos privados, anulación, notas de crédito y penalidad configurable por atraso.

## Flujo de pago

1. La administradora registra uno o más medios de pago dentro del mismo pago.
2. El pago queda `PENDING` y todavía no modifica el saldo.
3. Yape y transferencia requieren una constancia antes de confirmar.
4. Al confirmar se crea un ingreso financiero, se actualizan las cuentas y el saldo de la venta.
5. Una reversión no elimina el ingreso: genera una transacción compensatoria y conserva la auditoría.

## Boletas

La boleta se emite manualmente en SUNAT. Yukimi guarda serie, número, fecha, importe, pagos asociados y archivo. Una boleta emitida puede anularse con motivo y luego recibir una nota de crédito.

## Penalidad

La regla inicial permanece configurable en `business_settings`: S/1 por día posterior al vencimiento. La acción de cálculo crea o actualiza una sola penalidad activa por venta. Una exoneración conserva el registro con estado `WAIVED`.
