# Bitácora final de revalidación — Importaciones e inventario

> Fecha: 1 de agosto de 2026  
> Rama de trabajo: `fix/importaciones-revalidacion-final`  
> Destino: `version-1-1`  
> `main` no debe modificarse.

## Flujo validado con IMP-000003

- Dos cajas y 62 unidades esperadas.
- `CJA-0000004`: 37 esperadas, 36 recibidas, 1 faltante.
- `CJA-0000005`: 25 esperadas y 25 recibidas.
- Total recibido: 61 de 62.
- La recepción de cada caja se ejecutó una sola vez y creó lotes de inventario.
- La unidad faltante creó una incidencia abierta.
- Stock disponible final observado: 86 unidades, compuesto por 25 unidades previas y 61 recibidas.
- Bulma: 22 previas + 36 recibidas = 58 disponibles.
- Gojo Satoru: 2 previas + 25 recibidas = 27 disponibles.

## Valorización comprobada

- Compra esperada: S/ 12,444.00.
- Valor realmente ingresado: S/ 12,257.00.
- Diferencia por la unidad faltante: S/ 187.00.
- El reporte general mostraba correctamente S/ 12,257.00, pero faltaba el detalle por importación y lote.
- La compra estimada o el costo del inventario no deben descontar automáticamente una cuenta financiera. Finanzas cambia únicamente cuando se registra un pago real al proveedor.

## Correcciones aplicadas

### Creación de importaciones

- Notas de proveedor y operador permanecen opcionales.
- Los campos obligatorios se identifican junto a su etiqueta; se elimina la leyenda general que confundía al usuario.
- La validación desplaza la vista al primer campo incorrecto.
- Se añadieron acciones para crear operadores internacionales y locales desde cada caja y seleccionarlos inmediatamente.
- Tracking maestro se identifica expresamente como opcional.
- El resumen lateral deja de cubrir las cajas y se adapta a pantallas medianas.

### Estados y seguimiento por caja

- Desde el embarque, la pantalla usa los estados reales de las cajas para mostrar embarque, tránsito, recepción o ingreso parcial.
- Cuando todas las cajas coinciden, se muestra el estado consolidado correspondiente.
- La acción general obsoleta se reemplaza por una explicación para continuar desde cada caja.
- Se unifica el término visible `Embarcada`.
- Antes del conteo físico se muestra `Pendientes de recibir` o `Pendientes de confirmar`; `Faltantes` queda reservado para cajas ya ingresadas.

### Recepción física

- El banner general de error desaparece cuando ya no quedan errores reales.
- Cada línea muestra su diferencia.
- Si se recibe menos de lo esperado, la nota de la línea pasa a ser obligatoria.
- Se registra y muestra la fecha real de recepción.
- Solo las cantidades recibidas ingresan al inventario.
- El flujo conserva la confirmación final y la idempotencia existente.

### Costos, incidencias y preventas

- Los formularios extensos se convierten en acciones compactas desplegables.
- La preventa explica por qué ya no puede vincularse después de ingresar la importación a stock.
- El detalle muestra compra esperada, valor ingresado, diferencia no recibida y costos adicionales por separado.
- Se aclara que esos valores no equivalen a un movimiento bancario.

### Lista de importaciones

- Se agregan columnas para compra esperada, valor recibido y diferencia.
- Costos extra permanece separado para no confundir flete, seguro o aduana con el valor de la mercadería.
- La vista móvil muestra el mismo desglose.

### Inventario y lotes

- Se agrega la cantidad acumulada como estado separado de reservado.
- Se muestra el costo unitario actual por variante y almacén.
- La acción `Ver lotes` muestra importación, caja, almacén, cantidad recibida, moneda original, tipo de cambio, costo final, valor recibido y fecha.
- Desde el lote puede abrirse la importación de origen.
- Se explica que cantidad recibida no equivale necesariamente al saldo actual del lote.

### Reportes

- El valor estimado mantiene su cálculo por costo final de lotes.
- Se añade acceso directo al detalle de lotes y costos en Inventario.
- Se aclara que la valorización no representa un pago bancario automático.

## Validación esperada

- Formato, tipos, pruebas de API y compilación deben finalizar sin errores.
- La rama `version-1-1` solo debe recibir estos cambios mediante pull request aprobado.
- No se requiere reiniciar ni borrar la base de datos para estas correcciones de presentación y flujo.
