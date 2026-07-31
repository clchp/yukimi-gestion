# Bitácora de pruebas manuales — Yukimi Gestión v1.1

> Esta bitácora corresponde exclusivamente a la rama `version-1-1`.

## 31 de julio de 2026 — Inicio / Dashboard

### Alcance

Validación funcional y visual en computadora. La revisión para celular queda aplazada hasta terminar primero la funcionalidad principal.

### Resultado general

La carga inicial, los datos, los accesos rápidos, las listas recientes, la consistencia de información y el diseño general funcionan correctamente.

### Cambios pendientes

1. **Menú lateral en computadora**
   - El botón para abrir y cerrar el menú lateral no funciona.

2. **Gráfico “Rendimiento de los últimos 7 días”**
   - Para el periodo **Mes**, no conviene mostrar cada día. Debe agruparse por semanas para evitar saturación visual.
   - Para periodos amplios, usar una agrupación automática que mantenga aproximadamente cinco segmentos legibles.
   - Al pasar el cursor sobre una barra o segmento, debe aparecer un recuadro informativo con ambos valores, uno debajo del otro, por ejemplo:

     ```text
     ● Ventas: S/ 418.00
     ● Cobros: S/ 294.00
     ```

     Cada indicador debe conservar el color de su serie.

3. **Selector de periodo**
   - Cambiar la opción **Personalizado** por **Total**.

### Elementos aprobados

- La página abre correctamente y sin mensajes de error.
- La recarga con F5 y el reingreso después de cerrar sesión funcionan.
- El encabezado, la opción activa del menú y el cierre de sesión funcionan.
- Los títulos y números mostrados tienen sentido con los datos reales.
- Los filtros de fecha existentes actualizan la información correctamente.
- Las listas y movimientos recientes están ordenados y no muestran duplicados.
- Los accesos rápidos abren las secciones correctas.
- Los datos de ventas, stock, importaciones y totales coinciden con el sistema.
- El diseño general, alineación, tamaños, colores y jerarquía visual fueron aprobados.

### Estado

**Revisión de Inicio completada.** Los cambios se implementarán después de terminar la validación funcional de los demás módulos.
