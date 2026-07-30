# Fase 9 — Finanzas, bancos y conciliación

Esta fase reemplaza las pantallas demostrativas de Finanzas y Conciliación por datos reales de Supabase.

## Alcance

- Saldos reales de BCP, Scotiabank, Yape y efectivo.
- Ingresos y gastos manuales con categorías configurables.
- Transferencias internas sin contabilizarlas como ingreso ni gasto.
- Reversiones mediante movimientos compensatorios; no se eliminan registros publicados.
- Obligaciones de tarjeta, SUNAT, aduanas, servicios y otros pagos.
- Préstamos recibidos, cronograma de cuotas y pagos parciales.
- Cierre de caja con ajuste documentado cuando existe diferencia.
- Importación de extractos XLSX o CSV de hasta 5000 filas.
- Detección de coincidencias con pagos confirmados y movimientos financieros.
- Confirmación, descarte, ignorado y reversión manual de conciliaciones.
- Protección por saldo, idempotencia, auditoría y RLS.

## Formato de extractos

El importador reconoce encabezados comunes en español o inglés:

- Fecha / Transaction Date
- Descripción / Concepto / Detalle
- Importe / Monto, o columnas separadas Cargo y Abono
- Referencia / Operación, opcional
- Saldo, opcional

La lectura de XLSX se realiza directamente en el navegador y no envía el archivo original al servidor; solo se envían las filas normalizadas y el checksum SHA-256.
