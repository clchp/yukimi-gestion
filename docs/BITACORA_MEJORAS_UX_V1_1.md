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

## Prioridad sugerida

Prioridad: alta.

Orden recomendado de implementación:

1. Crear componentes comunes de modal, formulario y mensajes.
2. Sustituir primero los diálogos de Configuración.
3. Sustituir los diálogos de operaciones sensibles en todos los módulos.
4. Unificar validaciones, campos obligatorios y mensajes de error.
5. Añadir pruebas automáticas y revisión manual responsive.

## Nota de alcance

Esta bitácora registra requisitos pendientes. No implica que estas mejoras hayan sido implementadas todavía.
