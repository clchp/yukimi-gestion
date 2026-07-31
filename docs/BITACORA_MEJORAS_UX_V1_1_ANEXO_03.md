# Anexo 03 — Revisión transversal de flujos, cancelaciones, filtros y consistencia visual

Fecha de registro: 30 de julio de 2026.
Estado: pendiente de implementación.
Documento relacionado: `docs/BITACORA_MEJORAS_UX_V1_1.md` y anexos anteriores.

Este anexo reúne observaciones detectadas durante la prueba manual del catálogo de productos, inventario, importaciones y navegación general. Antes de implementar cualquier cambio se debe contrastar cada punto con los requisitos funcionales, reglas de negocio, auditoría y permisos existentes. Ninguna mejora visual debe eliminar trazabilidad ni alterar el comportamiento contable o de stock esperado.

## UX-031 — Revisión integral de flujos de inicio, confirmación, cancelación y error

### Problema observado

Algunas acciones pueden cerrarse, cancelarse o fallar sin una respuesta clara. La usuaria puede no saber si la operación se ejecutó, se descartó, quedó pendiente o fue bloqueada por una validación.

### Requerimiento transversal

Toda operación debe tener estados comprensibles y consistentes:

- Inicio de la acción.
- Datos pendientes o incompletos.
- Confirmación previa cuando corresponda.
- Procesamiento.
- Éxito.
- Cancelación voluntaria.
- Bloqueo por regla de negocio.
- Error de validación.
- Error técnico.

### Comportamiento esperado

- Si la usuaria cancela una acción antes de guardar, mostrar una respuesta breve solo cuando exista riesgo de confusión o pérdida de cambios.
- Si no hubo cambios, cerrar silenciosamente puede ser válido.
- Si había datos escritos, preguntar dentro de un modal propio: `Tienes cambios sin guardar. ¿Deseas descartarlos?`.
- Si se descartan, mostrar `Los cambios fueron descartados` únicamente en flujos donde sea importante confirmar el resultado.
- Si la operación no se puede ejecutar, explicar la causa exacta y la acción que debe realizar la usuaria.
- Nunca mostrar únicamente `Los datos enviados no son válidos`.
- Nunca dejar un botón sin respuesta visual.
- Evitar mensajes innecesarios para acciones obvias, como cerrar una vista sin cambios.

### Mensajes recomendados

- `No se pudo registrar el movimiento porque la cantidad supera el stock disponible en Almacén Camila.`
- `La transferencia fue cancelada. No se modificó el inventario.`
- `No puedes cancelar esta caja porque ya tiene unidades ingresadas a stock.`
- `La importación no puede finalizar mientras existan cajas pendientes de recepción.`
- `No se guardaron los cambios.`

## UX-032 — Incidencias y operaciones rechazadas en inventario

### Problema observado

Cuando una operación de inventario presenta una incidencia, la interfaz puede no explicar claramente qué dato, almacén, cantidad o regla provocó el rechazo.

### Requerimiento

Toda incidencia de inventario debe identificar:

- Producto y variante afectados.
- Almacén afectado.
- Tipo de movimiento solicitado.
- Cantidad solicitada.
- Cantidad disponible o registrada.
- Regla que impide continuar.
- Acción recomendada.

### Ejemplos

- `Solicitaste retirar 20 unidades, pero Almacén Camila solo tiene 2 disponibles.`
- `El almacén de origen y el de destino deben ser diferentes.`
- `La cantidad debe ser mayor que cero.`
- `No puedes ajustar simultáneamente dos almacenes usando una transferencia. Selecciona el destino y la cantidad transferida.`
- `Para corregir ambos almacenes utiliza Ajuste manual de stock y registra una cantidad independiente para cada uno.`

### Criterios de aceptación

- El contorno del campo inválido aparece en rojo.
- El mensaje se muestra debajo del campo correspondiente.
- Existe un resumen general de errores en la parte superior del modal.
- Los valores escritos se mantienen.
- No se ejecuta ningún cambio parcial cuando la operación falla.
- El `requestId` se conserva para soporte, pero no reemplaza el mensaje comprensible.

## UX-033 — Filtros funcionales y consistentes en todas las pantallas necesarias

### Problema observado

Existen botones `Filtros` que pueden no abrir ninguna herramienta visible o no comunicar qué filtros están activos.

### Requerimiento transversal

El botón `Filtros` debe funcionar en toda pantalla donde el volumen de datos o las reglas de búsqueda lo justifiquen.

### Comportamiento esperado

- Abrir un panel, popover o modal propio con los filtros disponibles.
- Mostrar únicamente filtros útiles para el módulo.
- Permitir aplicar, limpiar y cerrar.
- Mostrar un indicador numérico con la cantidad de filtros activos.
- Mantener los filtros al navegar al detalle y volver, cuando sea útil.
- Permitir limpiar todos los filtros con una sola acción.
- Combinar correctamente búsqueda, filtros, orden y paginación.
- Mostrar un estado vacío explicativo cuando ningún registro coincida.
- No incluir botones `Filtros` decorativos o deshabilitados sin explicación.

### Alcance mínimo

- Productos: categoría, marca, franquicia, estado, stock, almacén y rango de precio cuando corresponda.
- Inventario: almacén, estado de stock, producto, variante, categoría y alertas.
- Ventas: cliente, estado de pago, estado de entrega, canal, tipo y fechas.
- Clientes: estado, VIP, deuda, fecha de última compra y búsqueda.
- Entregas: estado, agencia, almacén, rango de fechas y responsable.
- Importaciones: proveedor, estado, caja, transporte, moneda y fechas.
- Finanzas: cuenta, tipo, estado, moneda, vencimiento y fechas.
- Auditoría: módulo, entidad, usuaria, acción y fechas.
- Reportes: periodo, almacén, categoría, canal y moneda según el reporte.

### Criterios de aceptación

- Pulsar `Filtros` siempre produce una respuesta visible.
- Los filtros activos cambian realmente los resultados.
- El botón indica cuántos filtros están aplicados.
- `Limpiar filtros` devuelve la vista al estado inicial.
- La exportación utiliza los filtros activos y lo informa.

## UX-034 — Flujo de cancelación en importaciones y cajas

### Objetivo

Definir claramente qué ocurre cuando se cancela una importación completa o una caja individual, respetando requisitos, stock, pagos, costos, preventas, auditoría y estados relacionados.

### Reglas a validar antes de implementar

- Una importación en cotización o preparación puede cancelarse si no tiene recepción ni movimientos irreversibles.
- Una caja puede cancelarse antes de ser recibida, siempre que no tenga unidades ingresadas a stock ni preventas consumidas.
- Una caja con recepción parcial requiere un flujo especial; no debe simplemente desaparecer.
- Una importación con alguna caja ingresada a stock no debe cancelarse como si nunca hubiera existido.
- Los costos, obligaciones, pagos o conciliaciones vinculadas deben revisarse antes de permitir la cancelación.
- La cancelación debe solicitar motivo obligatorio y confirmación.
- Debe registrarse en auditoría quién, cuándo, qué y por qué canceló.

### Flujo recomendado para cancelar una caja

1. Pulsar `Cancelar caja`.
2. Mostrar el nombre o código de la caja y su estado actual.
3. Informar consecuencias: productos esperados, preventas vinculadas, costos asignados y tracking.
4. Solicitar motivo obligatorio.
5. Validar que no existan unidades ingresadas a stock.
6. Confirmar la cancelación.
7. Marcar la caja como `Cancelada`, sin eliminarla físicamente.
8. Recalcular totales esperados y costos de la importación cuando corresponda.
9. Mostrar un mensaje final claro.

### Flujo recomendado para cancelar una importación

1. Pulsar `Cancelar importación`.
2. Mostrar un resumen de cajas y estados.
3. Bloquear la cancelación cuando existan cajas ingresadas a stock o relaciones irreversibles.
4. Cuando sea posible, solicitar motivo y confirmación.
5. Marcar la importación como `Cancelada`.
6. Conservar historial, documentos y auditoría.
7. Explicar qué relaciones quedaron anuladas o pendientes de reversión.

### Mensajes esperados

- `La importación fue cancelada. No se modificó el inventario.`
- `No puedes cancelar esta importación porque la caja CJA-00000003 ya fue ingresada a stock.`
- `La caja fue cancelada y se retiraron 20 unidades esperadas del resumen.`
- `Esta caja tiene una recepción parcial. Registra la devolución o corrección antes de cancelarla.`

## UX-035 — Estados visibles y coherentes en importaciones

### Problema observado

Los estados de la importación, cajas, recepción e ingreso a stock pueden mostrar combinaciones incoherentes, por ejemplo `Ingresada a stock` con `Recibido 0`.

### Requerimiento

- Definir una máquina de estados explícita para importación y caja.
- Mostrar únicamente acciones válidas para el estado actual.
- Evitar acciones duplicadas que salten validaciones.
- No permitir estados finales con cantidades incompatibles.
- Mostrar una línea de progreso o historial de estados comprensible.

### Estado sugerido de caja

- Preparación.
- Despachada.
- En tránsito internacional.
- Recibida en Perú.
- En recepción.
- Ingresada parcialmente a stock.
- Ingresada completamente a stock.
- Cancelada.

La lista definitiva debe respetar los requisitos y la implementación existente. No se deben inventar estados que contradigan la lógica del backend.

### Criterios de aceptación

- Cada estado explica qué falta y cuál es la siguiente acción.
- No aparece `Flujo finalizado` cuando existen unidades pendientes.
- Las cantidades esperadas, recibidas e ingresadas son consistentes.
- Las acciones inválidas están ocultas o deshabilitadas con explicación.
- Cada transición deja auditoría.

## UX-036 — Elementos clickeables reconocibles

### Requerimiento

Toda acción interactiva debe parecer interactiva sin depender únicamente de que la usuaria pruebe a hacer clic.

### Comportamiento esperado

- Botones y enlaces con contraste suficiente.
- Filas clickeables con hover y cursor apropiado.
- Iconos de acción con fondo, contorno o tooltip cuando su significado no sea evidente.
- Enlaces como `Ver todas`, `Ver reporte` o códigos de entidad con un color y peso visual consistentes.
- No oscurecer excesivamente elementos no interactivos.
- Mantener accesibilidad de contraste y foco visible con teclado.

### Casos incluidos

- Código de producto.
- Miniatura del producto.
- Código de venta.
- Código de importación y caja.
- Alertas de inventario.
- Actividad reciente.
- Tarjetas de resumen cuando conduzcan a un detalle.
- Iconos de QR, edición, filtros y columnas.

## UX-037 — Ayudas contextuales útiles y moderadas

### Objetivo

Ayudar a la usuaria sin llenar la pantalla de textos innecesarios.

### Reglas

- Mostrar ayuda solo cuando el término, cálculo o consecuencia no sea evidente.
- Preferir una frase breve debajo del título o campo.
- Usar un icono `i` con tooltip o popover cuando la explicación sea secundaria.
- No ocultar instrucciones críticas únicamente dentro de un tooltip.
- No repetir la misma explicación en varios lugares próximos.
- El lenguaje debe ser simple, directo y en español.

### Casos donde sí se requiere ayuda

- Stock disponible, reservado, preventa y en tránsito.
- Ajuste manual de stock.
- Regalo, pérdida y producto dañado.
- Tipo de cambio.
- Costos importados y distribución por caja.
- Borradores.
- Cancelación y reversión.
- Estados de importación y entrega.
- Penalidades y liberación de líneas.

### Ejemplos

- `Regalo: retira unidades del inventario porque fueron entregadas sin cobro. No transfiere stock a otro almacén.`
- `Ajuste manual: corrige una diferencia comprobada de inventario y requiere un motivo.`
- `En tránsito: unidades compradas que todavía no han ingresado al almacén.`

## UX-038 — Diseño visual, espaciado y prevención de superposiciones

### Problema observado

En algunas pantallas las tarjetas, formularios, resúmenes y menús desplegables pueden quedar demasiado juntos, cortarse o superponerse.

### Requerimiento visual transversal

- Mantener un sistema consistente de espaciado entre secciones, tarjetas, campos y botones.
- Evitar que paneles laterales cubran formularios o resúmenes.
- Asegurar que los menús desplegables aparezcan sobre el contenido sin quedar cortados por contenedores.
- Mantener márgenes internos suficientes en tarjetas y modales.
- Evitar textos comprimidos como `Cajas1`, `Productos1` o valores pegados a sus etiquetas.
- Permitir que el contenido crezca sin salirse del contenedor.
- Evitar scroll doble innecesario en modales.
- Mantener botones principales visibles sin cubrir campos.
- Usar separación visual consistente entre encabezado, contenido y acciones.

### Revisión responsive

- Escritorio ancho.
- Laptop.
- Tablet.
- Móvil de aproximadamente 390 × 844.
- Zoom del navegador al 125 % y 150 %.

### Criterios de aceptación

- No existen elementos superpuestos.
- Los textos no quedan cortados sin tooltip o expansión.
- Los desplegables no quedan ocultos detrás de tarjetas.
- Las tablas permiten desplazamiento horizontal dentro de su propio contenedor.
- Las acciones siguen siendo accesibles en móvil.

## UX-039 — Coherencia de nombres y lenguaje en español

### Requerimiento

Revisar etiquetas, estados y acciones para que una usuaria hispanohablante pueda entenderlas sin conocer términos internos o técnicos.

### Ejemplos a reemplazar o traducir

- `ACCUMULATED` → `Acumula en almacén` o estado definitivo acordado.
- `DELIVERED` → `Entregado`.
- `INSERT`, `UPDATE`, `OTHER` en actividad reciente → verbos y descripciones comprensibles.
- `Ajuste dinámico` → `Ajuste manual de stock`.
- `Revisar` → `Stock bajo` o una alerta concreta.

### Reglas

- No mostrar nombres internos de base de datos.
- No mostrar códigos técnicos como descripción principal.
- Mantener el código de entidad como dato secundario cuando sea útil.
- Usar los mismos términos en frontend, mensajes, reportes y ayuda.

## UX-040 — Validación de sentido y alineación con requisitos antes de cambiar flujos

### Requerimiento

Antes de implementar las mejoras de inventario, importaciones, cancelaciones y recepción:

1. Revisar los requisitos funcionales originales.
2. Identificar la regla de negocio actual.
3. Comparar frontend, API, funciones SQL y pruebas.
4. Determinar qué comportamiento es correcto y qué es únicamente un problema de interfaz.
5. Evitar simplificar una acción si la simplificación elimina trazabilidad o controles requeridos.
6. Documentar cualquier cambio funcional que exceda una mejora visual.

### Casos que requieren validación especial

- Regalo y su impacto en stock y finanzas.
- Transferencia entre almacenes.
- Ajuste manual sobre uno o varios almacenes.
- Cancelación de cajas e importaciones.
- Recepción parcial y completa.
- Reversión de recepción.
- Preventas asociadas a importaciones.
- Distribución de costos.
- Estados finales de la importación.

## UX-041 — Plan de revisión paso a paso por módulo

La implementación posterior debe realizarse en etapas pequeñas y verificables:

1. Componentes comunes: modal, confirmación, alertas, validación, ayuda y selector buscable.
2. Configuración y catálogos.
3. Productos y etiquetas QR.
4. Inventario y alertas.
5. Ventas y borradores.
6. Importaciones y recepción.
7. Entregas.
8. Finanzas y conciliación.
9. Panel, reportes y actividad reciente.
10. Auditoría, permisos y revisión responsive final.

Cada etapa debe incluir:

- Revisión contra requisitos.
- Implementación.
- Pruebas automáticas.
- Prueba manual con datos QA.
- Registro de incidencias.
- Validación de escritorio y móvil.

## UX-042 — Criterios de aceptación de este anexo

La revisión se considerará completada cuando:

1. Toda cancelación tenga consecuencias y mensajes definidos.
2. Todo error explique la causa y cómo corregirlo.
3. Los filtros funcionen en las pantallas que los necesiten.
4. Ningún botón de filtro sea decorativo o inútil.
5. Importaciones y cajas tengan transiciones de estado coherentes.
6. No se pueda finalizar una caja con cantidades recibidas incompatibles.
7. Cancelar no elimine trazabilidad ni historial.
8. Los elementos clickeables sean reconocibles.
9. Las ayudas aparezcan únicamente donde aporten valor.
10. Las tarjetas, desplegables y modales no se superpongan.
11. Los nombres visibles estén en español y sean comprensibles.
12. Cada modificación funcional haya sido contrastada con los requisitos antes de implementarse.
13. Las pruebas manuales estén registradas en el Excel de pruebas.
14. La interfaz sea visualmente agradable, consistente y utilizable en escritorio y móvil.

## Prioridad sugerida

- Crítica: coherencia de estados, recepción, cancelaciones e integridad de inventario.
- Alta: errores claros, filtros funcionales, validación de formularios y acciones sin respuesta.
- Media: ayuda contextual, lenguaje, clickabilidad y pulido visual.

Este documento registra decisiones pendientes. No implica que los cambios ya estén implementados.
