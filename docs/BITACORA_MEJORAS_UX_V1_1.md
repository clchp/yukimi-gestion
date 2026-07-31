# Bitácora de mejoras UX pendientes — Yukimi Gestión v1.1

Fecha de registro: 30 de julio de 2026.
Estado general: pendiente de implementación.
Alcance: revisión transversal de toda la aplicación web antes del cierre visual y funcional.

## UX-001 — Eliminar diálogos nativos del navegador

### Problema observado

Actualmente algunas acciones usan `window.prompt`, `window.confirm` o `window.alert`. Estos diálogos muestran textos como `localhost:5173 dice`, tienen una apariencia ajena al sistema y pueden interrumpir o hacer perder el flujo cuando la usuaria cambia de pestaña.

### Requerimiento

Eliminar en todo el frontend los diálogos nativos del navegador y reemplazarlos por componentes propios de la aplicación.

### Comportamiento esperado

- Mostrar una ventana modal superpuesta dentro de Yukimi Gestión.
- Oscurecer u opacar el fondo mientras la ventana esté abierta.
- Mantener visibles el título, la explicación, los campos y los botones de acción.
- Conservar los datos escritos aunque la usuaria cambie temporalmente de pestaña y vuelva.
- No mostrar nunca textos del navegador como `localhost dice`.
- Mantener el mismo estilo visual, tipografía, espaciado y botones del sistema.
- Ser usable en escritorio y móvil.

### Acciones incluidas

- Crear.
- Editar.
- Desactivar o reactivar.
- Eliminar o anular.
- Confirmar operaciones sensibles.
- Solicitar motivos.
- Solicitar valores adicionales durante una operación.
- Mostrar advertencias antes de una acción irreversible.

## UX-002 — Componente modal reutilizable

Crear un componente común para no repetir lógica diferente en cada pantalla.

### Variantes requeridas

- Modal de formulario.
- Modal de confirmación.
- Modal de advertencia.
- Modal de error.
- Modal de éxito o información, cuando corresponda.

### Reglas mínimas

- Fondo oscurecido.
- Foco inicial dentro del modal.
- El foco no debe salir del modal mientras esté abierto.
- Cierre mediante botón visible.
- `Esc` puede cerrar solo cuando la operación no sea destructiva ni tenga datos críticos sin guardar.
- Debe avisar antes de descartar cambios escritos.
- Botón principal y botón cancelar claramente diferenciados.
- Estado de carga visible al guardar.
- Evitar doble envío mientras la operación está en curso.
- Mensajes accesibles mediante atributos ARIA.

## UX-003 — Mensajes de error claros para la usuaria

### Problema observado

Algunas operaciones pueden cancelarse o fallar sin mostrar una explicación visible. La usuaria no sabe qué dato está mal ni qué debe corregir.

### Requerimiento

Toda operación fallida debe mostrar un mensaje entendible, específico y accionable.

### Comportamiento esperado

- Explicar qué ocurrió.
- Indicar qué campo o acción causó el problema.
- Indicar cómo corregirlo.
- No mostrar códigos técnicos como único mensaje.
- Cuando exista un error técnico, mostrar un texto amigable y conservar el identificador de solicitud para soporte.
- No ocultar errores del backend.
- No dejar botones sin respuesta visible.

### Ejemplos

- `El nombre es obligatorio.`
- `El motivo debe tener al menos 5 caracteres.`
- `Ya existe una categoría con ese nombre.`
- `No se pudo guardar la categoría. Revisa los campos marcados en rojo.`
- `La información cambió desde que abriste esta pantalla. Recarga y vuelve a intentarlo.`

## UX-004 — Validación visual por campo

### Requerimiento

Cuando un campo tenga un error:

- Mostrar borde rojo alrededor del control.
- Mostrar un mensaje específico debajo del campo.
- Mantener el valor escrito para que la usuaria pueda corregirlo.
- Llevar el foco al primer campo inválido al intentar guardar.
- No depender únicamente del color: acompañar siempre con texto o icono.
- Retirar el estado de error cuando el dato quede corregido.

## UX-005 — Campos obligatorios identificados con asterisco

### Requerimiento

Todo campo obligatorio debe mostrar `*` junto a su etiqueta.

### Reglas

- El asterisco debe verse antes de enviar el formulario.
- Incluir una nota general: `* Campo obligatorio`.
- Mantener consistencia en todas las pantallas.
- No marcar como obligatorio un campo que el backend permita dejar vacío.
- Las reglas del frontend y backend deben coincidir.

## UX-006 — Resumen general de errores del formulario

Cuando existan varios errores al guardar:

- Mostrar un resumen visible en la parte superior del formulario o modal.
- Indicar cuántos campos requieren corrección.
- Permitir identificar rápidamente cada problema.
- Mantener también el mensaje específico junto a cada campo.

Ejemplo:

`No se pudo guardar. Corrige 3 campos marcados en rojo.`

## UX-007 — Persistencia temporal de formularios y modales

### Requerimiento

Evitar que la usuaria pierda lo escrito por cambiar de pestaña, cerrar accidentalmente un modal o navegar dentro de la aplicación.

### Comportamiento esperado

- Conservar el estado mientras el modal siga abierto.
- Advertir si intenta cerrar con cambios sin guardar.
- Evaluar borradores locales para formularios extensos.
- No guardar información sensible de forma insegura.
- Limpiar el borrador temporal después de guardar o descartar explícitamente.

## UX-008 — Revisión completa del proyecto

Antes del cierre de UX se debe buscar y eliminar en todo el frontend cualquier uso de:

- `window.prompt`
- `window.confirm`
- `window.alert`
- `prompt(`
- `confirm(`
- `alert(`

También se deben revisar acciones que no muestren respuesta, errores genéricos y formularios sin validación visible.

### Módulos mínimos a revisar

- Inicio de sesión y contraseña.
- Panel.
- Ventas y borradores.
- Clientes.
- Productos.
- Inventario.
- Pagos.
- Entregas.
- Importaciones.
- Finanzas.
- Conciliación bancaria.
- Reportes.
- Auditoría.
- Configuración.
- Administradoras.
- Catálogos.
- Almacenes.
- Cuentas financieras.
- Notificaciones.

## UX-009 — Criterios de aceptación globales

La mejora se considerará terminada cuando:

1. No exista ningún diálogo nativo visible del navegador.
2. Toda entrada adicional se solicite mediante un modal propio.
3. Cambiar de pestaña no borre lo escrito en un modal abierto.
4. Todos los campos obligatorios tengan `*`.
5. Todo campo inválido tenga borde rojo y mensaje específico.
6. Todo formulario inválido muestre un resumen general.
7. Todo error de API tenga una explicación visible para la usuaria.
8. Ninguna acción quede aparentemente sin respuesta.
9. Los modales funcionen correctamente con teclado y lector de pantalla.
10. Los modales sean utilizables en anchos móviles.
11. Las pruebas automáticas impidan reintroducir `window.prompt`, `window.confirm` o `window.alert`.
12. Las pruebas manuales de cada módulo queden registradas en el plan de pruebas.

## UX-010 — Evidencia inicial

Caso observado: edición de una categoría desde Configuración > Catálogos.

Comportamiento actual:

- Aparece un diálogo nativo con el encabezado `localhost:5173 dice`.
- El flujo solicita datos mediante cuadros separados.
- La experiencia no coincide con la identidad visual del sistema.
- La usuaria puede perder continuidad al cambiar de pestaña.

Comportamiento futuro esperado:

- Un solo modal del sistema debe contener nombre, descripción, penalidad y motivo.
- Debe mostrar los campos obligatorios con `*`.
- Debe validar cada campo antes de enviar.
- Debe resaltar errores con borde rojo y mensaje específico.
- Debe mostrar confirmación dentro del mismo diseño, sin cuadros nativos.

## UX-011 — Etiqueta QR descargable legible y equivalente a impresión

### Problema observado

La vista previa y la impresión muestran un QR grande y legible, pero el archivo descargado mediante `Descargar SVG` muestra el QR demasiado pequeño en la esquina superior izquierda y deja casi toda la etiqueta vacía.

### Requerimiento

- La etiqueta descargada debe conservar la misma composición visual que la vista de impresión.
- El QR debe ocupar un área grande, centrada y escaneable.
- Debe incluir nombre del producto, variante, SKU y contenido identificador.
- Debe conservar márgenes apropiados y no presentar espacios vacíos desproporcionados.
- La descarga debe producir una etiqueta lista para compartir o imprimir.

### Decisión UX propuesta

- Mantener el botón `Imprimir`.
- Sustituir `Descargar SVG` por `Descargar etiqueta`.
- Priorizar PNG de alta resolución o PDF de una página para usuarias no técnicas.
- SVG puede mantenerse como opción secundaria solo si conserva correctamente la escala y distribución.
- La etiqueta descargada debe verse igual que la impresión, no como una captura borrosa de pantalla.

### Criterios de aceptación

- El QR descargado se ve aproximadamente del mismo tamaño relativo que en la vista previa.
- El archivo abre correctamente en Windows y en móvil.
- El QR puede escanearse desde el archivo y después de imprimirlo.
- No se corta el nombre, la variante, el SKU ni el código inferior.

## UX-012 — Exportación CSV con explicación y confirmación visible

### Funcionamiento actual

`Exportar CSV` genera un archivo con el catálogo de productos que coincide con la búsqueda y categoría seleccionadas. Incluye código de producto, nombre, categoría, franquicia, SKU, variante, disponible, reservado, tránsito, preventa, precio y moneda.

Los navegadores normalmente descargan el archivo directamente a la carpeta `Descargas`; no muestran una ventana para elegir dónde guardarlo, por lo que la operación puede parecer que no hizo nada.

### Requerimiento

- Mantener la exportación porque permite abrir y analizar el catálogo en Excel.
- Mostrar antes o junto al botón una ayuda breve: `Descarga el catálogo filtrado para abrirlo en Excel`.
- Después de descargar, mostrar una confirmación visible con nombre del archivo y cantidad de filas.
- Mostrar un error claro si la descarga falla.
- Respetar los filtros activos y comunicarlo: `Se exportarán los resultados actuales`.
- Deshabilitar el botón y mostrar `Exportando…` durante el proceso.

### Criterios de aceptación

- Al pulsar el botón se descarga un archivo `.csv` no vacío.
- El archivo aparece en Descargas y abre correctamente en Excel.
- Los encabezados y caracteres con tilde se visualizan correctamente.
- La aplicación confirma la descarga y no deja a la usuaria sin respuesta.

## UX-013 — Visor de imágenes del producto y galería por variantes

### Requerimiento

- La miniatura de la tabla de productos debe ser interactiva.
- Al pulsarla debe abrirse un modal propio con fondo oscurecido.
- El modal debe mostrar arriba el nombre del producto.
- La imagen debe mostrarse grande, proporcionada y sin deformación.
- Cuando existan varias imágenes, debe haber miniaturas o controles anterior/siguiente.
- Cuando existan variantes, debe poder seleccionarse la variante y ver sus imágenes asociadas.
- Debe mostrarse una imagen general del producto cuando una variante no tenga una propia.
- Debe existir un estado vacío claro cuando no haya imagen.
- Debe funcionar en escritorio y móvil.

### Modelo de datos a evaluar

Actualmente la carga de imágenes está centrada en el producto. Se debe ampliar el diseño para permitir opcionalmente imágenes por variante, sin obligar a duplicar una misma imagen para todas las variantes.

## UX-014 — Ver detalle y editar productos existentes

### Problema observado

La tabla permite abrir la etiqueta QR, pero no presenta una acción clara para ver o editar un producto existente.

### Requerimiento

- Permitir abrir el detalle haciendo clic en el nombre, la fila o mediante una acción `Ver`.
- Incorporar una acción `Editar producto`.
- Permitir editar información general, imágenes, variantes, precios, stock mínimo, estado y asociaciones de catálogo según las reglas de negocio.
- Conservar código de producto y SKU cuando no corresponda regenerarlos.
- Solicitar motivo para cambios sensibles y registrar auditoría.
- Aplicar control de versión para evitar sobrescribir cambios de otra administradora.
- Mostrar `Desactivar` en lugar de eliminar físicamente cuando exista historial relacionado.

### Acciones sugeridas por fila

- Ver detalle.
- Editar.
- Ver o imprimir QR.
- Desactivar o reactivar.

## UX-015 — Selectores buscables, orden alfabético y dependencias

### Requerimiento transversal

Todos los controles con listas extensas deben convertirse en selectores buscables o combobox propios:

- La usuaria puede escribir dentro del control.
- La lista se filtra conforme escribe.
- La coincidencia ignora mayúsculas, minúsculas y, cuando sea posible, tildes.
- Se puede usar teclado, Enter y Escape.
- Se muestra `Sin resultados` cuando no existe coincidencia.
- Las opciones se ordenan alfabéticamente usando reglas de español.

### Alcance mínimo

- Categorías.
- Franquicias o animes.
- Marcas.
- Líneas o colecciones.
- Productos y variantes.
- Clientes.
- Almacenes.
- Cuentas financieras.
- Agencias y proveedores.
- Otros catálogos que puedan crecer.

### Dependencia marca → línea o colección

- Al elegir una marca, solo deben mostrarse las líneas asociadas a esa marca.
- Al cambiar de marca debe limpiarse una línea que ya no sea válida.
- Cuando no se haya elegido marca, debe definirse claramente si se muestran todas las líneas o se deshabilita el selector; se recomienda deshabilitarlo con el texto `Selecciona una marca primero`.
- Las líneas deben mostrarse ordenadas alfabéticamente.

### Estado actual identificado

El formulario ya filtra internamente las líneas por la marca seleccionada y limpia la línea al cambiar de marca. La mejora pendiente es convertir los selectores en buscables, ordenar todas las opciones y comunicar mejor la dependencia.

## UX-016 — Unificar acciones de inventario en un solo flujo

### Funcionamiento actual

- `Transferir` abre el modal preseleccionando el tipo Transferencia.
- `Nuevo movimiento` abre el mismo modal preseleccionando Ajuste dinámico.
- Ambos botones conducen al mismo formulario y el tipo puede cambiarse dentro del modal.

### Decisión UX propuesta

- Usar un único botón principal: `Registrar movimiento`.
- Dentro del modal elegir el tipo de movimiento.
- Mantener el botón contextual `Mover` por fila, pero cambiarlo por `Registrar movimiento` o abrir el mismo modal con producto y almacén preseleccionados.
- No es necesario mantener dos botones superiores porque los requisitos exigen diferenciar los tipos de operación, no necesariamente usar botones separados.

### Nombres recomendados

- Transferencia entre almacenes.
- Producto dañado.
- Pérdida.
- Regalo.
- Ajuste manual de stock.

Sustituir `Ajuste dinámico` por `Ajuste manual de stock`, porque el nombre actual no explica qué ocurrirá.

## UX-017 — Alerta de stock bajo comprensible y accionable

### Problema observado

La etiqueta `Revisar` aparece cuando el disponible es menor o igual al stock mínimo, pero no explica qué debe revisarse ni permite resolver el problema al pulsarla.

### Requerimiento

- Sustituir `Revisar` por `Stock bajo`.
- Mostrar la causa: disponible actual, stock mínimo y unidades faltantes para alcanzar el mínimo.
- Incorporar una ayuda contextual o tooltip.
- Convertir la alerta o una acción adyacente en un acceso útil.

### Acción recomendada

Al pulsar `Stock bajo` o `Resolver`:

1. Mostrar el detalle de la alerta.
2. Indicar si existe stock en otro almacén.
3. Permitir transferir desde otro almacén cuando corresponda.
4. Permitir registrar un ajuste manual solo con motivo y auditoría.
5. Cuando la reposición dependa de compra o importación, dirigir al flujo correspondiente sin inventar stock.

### Criterios de aceptación

- La usuaria entiende por qué existe la alerta.
- La pantalla indica una acción concreta para resolverla.
- Nunca se aumenta stock sin registrar un movimiento válido.
- Después de corregir el disponible o el stock mínimo, la alerta cambia a `Correcto`.

## UX-018 — Pruebas manuales añadidas para productos e inventario

Antes de cerrar estas mejoras se debe probar:

1. Vista previa, impresión y descarga de la misma etiqueta QR.
2. Escaneo del QR desde pantalla, archivo e impresión.
3. Descarga CSV con y sin filtros y apertura en Excel.
4. Visor de una imagen, varias imágenes y producto sin imagen.
5. Cambio entre imágenes de variantes.
6. Edición de producto y control de concurrencia.
7. Búsqueda y orden alfabético en todos los selectores.
8. Filtrado marca → línea o colección.
9. Todos los tipos de movimiento desde un único modal.
10. Explicación y resolución de stock bajo.
11. Comportamiento responsive de los modales y galerías.
12. Mensajes de éxito y error para cada operación.

## Prioridad sugerida

Prioridad: alta.

Orden recomendado de implementación:

1. Crear componentes comunes de modal, formulario y mensajes.
2. Sustituir primero los diálogos de Configuración.
3. Corregir la etiqueta QR descargable y añadir confirmación de exportación CSV.
4. Añadir detalle, edición y galería de productos.
5. Crear el selector buscable reutilizable y aplicarlo transversalmente.
6. Unificar el flujo de movimientos de inventario y hacer accionable el stock bajo.
7. Sustituir los diálogos de operaciones sensibles en todos los módulos.
8. Unificar validaciones, campos obligatorios y mensajes de error.
9. Añadir pruebas automáticas y revisión manual responsive.

## Nota de alcance

Esta bitácora registra requisitos pendientes. No implica que estas mejoras hayan sido implementadas todavía.
