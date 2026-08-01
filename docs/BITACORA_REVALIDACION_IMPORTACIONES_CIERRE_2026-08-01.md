# Bitácora de revalidación — Cierre de Importaciones

> Fecha: 1 de agosto de 2026  
> Rama: `version-1-1`

## Resultado final de `IMP-000003`

- Unidades esperadas: 62.
- Caja `CJA-0000004`:
  - Esperadas: 37.
  - Recibidas: 36.
  - Faltantes reales: 1.
  - Ingresadas a stock: 36.
- Caja `CJA-0000005`:
  - Esperadas: 25.
  - Recibidas: 25.
  - Faltantes reales: 0.
  - Ingresadas a stock: 25.
- Total físicamente recibido e ingresado a inventario: 61 unidades.
- Se creó correctamente una incidencia abierta por el faltante de una unidad en `CJA-0000004`.
- La importación general pasó a `Ingresada a stock` cuando ambas cajas terminaron su recepción.

## Verificación del inventario

- Antes de la importación existían 25 unidades disponibles en el inventario consolidado.
- La importación añadió 61 unidades recibidas.
- Resultado esperado: 25 + 61 = 86 unidades disponibles.
- La vista consolidada muestra 86 disponibles, por lo que el total general es correcto.
- Para `Figura de acción Bulma`:
  - Disponible antes: 22.
  - Recibido en esta importación: 36.
  - Disponible después: 58.
  - La fila mostrada con 58 disponibles es correcta.
- Para `Figura Gojo Satoru`:
  - Disponible antes: 2.
  - Recibido en esta importación: 25.
  - Disponible esperado después: 27.
  - Debe verificarse en su fila individual.

## Preventa después del ingreso a stock

- Es correcto que ya no se permita vincular una preventa cuando todas las unidades de la importación ya fueron ingresadas a stock.
- La vinculación debe realizarse antes de la recepción final para separar unidades esperadas.
- La interfaz debe explicar por qué el control está deshabilitado mediante un icono `(i)` o mensaje breve: `Esta importación ya ingresó a stock. Las ventas nuevas deben reservarse desde Inventario/Ventas.`

## Hallazgo — total recibido en cabecera

- Después de finalizar ambas cajas, la cabecera de la importación debe mostrar `Unidades recibidas: 61`.
- Si permanece en 36 después de recargar, existe un defecto de actualización o consolidación del total recibido.
- El estado final debe mostrar `Ingresada a stock`, no únicamente `Recibida en Perú`.

## Hallazgo — detalle de auditoría demasiado técnico

- La ventana de auditoría muestra directamente nombres de tabla, UUID y JSON crudo.
- Esa información sirve para soporte técnico, pero no es adecuada como vista principal para una administradora.
- Debe mostrarse primero un resumen amigable, por ejemplo:
  - `Se creó un lote de inventario`.
  - Producto, caja, almacén, cantidad recibida, costo unitario y fecha.
- Los datos técnicos deben quedar dentro de una opción secundaria `Ver datos técnicos`.

## Hallazgos ya confirmados que permanecen pendientes

- El estado general no refleja correctamente estados parciales por caja.
- Las acciones generales y por caja son ambiguas.
- La etiqueta `Faltantes` aparece antes del conteo físico.
- Formularios de costo, incidencia y preventa ocupan demasiado espacio y deben abrirse en ventanas emergentes.
- Debe existir creación de operador internacional desde el formulario.
- El resumen flotante no debe cubrir campos.
- Las ayudas de conceptos deben mostrarse mediante `(i)`.

## Estado

**El cálculo final de inventario es correcto: se recibieron 61 unidades y el inventario consolidado pasó de 25 a 86 disponibles. Pendiente verificar que la cabecera de la importación muestre 61 después de recargar y aplicar las mejoras registradas en `version-1-1`. `main` no fue modificada.**
