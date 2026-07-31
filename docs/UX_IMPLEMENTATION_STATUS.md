# Estado de implementación de la bitácora UX — Yukimi Gestión v1.1

Fecha de inicio: 30 de julio de 2026.
Rama de trabajo: `version-1-1`.
Rama protegida: `main` no se modifica.

## Bloque 1 — Base transversal

Estado: en implementación.

- Proveedor de mensajes, errores, confirmaciones y formularios modales propios.
- Eliminación progresiva de diálogos nativos del navegador.
- Validación por campo, resumen general y campos obligatorios con asterisco.
- Selector buscable y ordenado alfabéticamente.
- Panel de filtros reutilizable.
- Ayudas contextuales y sistema visual de interacción.
- Conservación de identificadores de solicitud para soporte.

## Bloque 2 — Panel

Estado: implementado; pendiente de validación automatizada y visual.

- Periodos Hoy, 7 días, Mes y Personalizado.
- Leyenda visible.
- Valores al pasar el cursor o enfocar una barra.
- Estados y actividad traducidos a lenguaje comprensible.
- Filas de ventas recientes accesibles y navegables.

## Bloque 3 — Configuración

Estado: implementado; pendiente de validación automatizada y visual.

- Edición de catálogos en un solo modal.
- Motivos y confirmaciones propias.
- Validación específica y mensajes visibles.
- Selector buscable de marcas.
- Formularios propios para almacenes, cuentas, perfiles y reglas.
- Relación de roles administrativos desambiguada en la API.

## Bloque 4 — Productos

Estado: implementado; pendiente de migración 037, validación automatizada y visual.

- Detalle y edición de productos.
- Edición transaccional de producto y variantes con concurrencia y auditoría.
- Galería y visor de imágenes.
- Etiqueta QR completa, descarga PNG de alta resolución e impresión equivalente.
- Exportación CSV con confirmación y respeto de filtros.
- Filtros funcionales y acciones Ver, Editar y Etiqueta.
- Selectores buscables y dependencia marca a línea.

## Bloque 5 — Inventario

Estado: implementado en interfaz; pendiente de validación automatizada y visual.

- Un solo botón `Registrar movimiento`.
- Nombres y explicaciones en español.
- Validaciones específicas de cantidad, almacén y stock disponible.
- Confirmación y cancelación visibles.
- Alerta `Stock bajo` accionable con sugerencia de transferencia o ajuste.
- Filtros de almacén y estado del stock.

## Bloques pendientes

- Borradores de venta realmente parciales.
- Importaciones: moneda PEN, recepción única, cancelaciones e integridad Esperado/Recibido.
- Filtros y traducciones en módulos restantes.
- Revisión final responsive y de espaciado.
- Auditoría completa de diálogos nativos.
- Pruebas automáticas, compilación y verificación integral.
