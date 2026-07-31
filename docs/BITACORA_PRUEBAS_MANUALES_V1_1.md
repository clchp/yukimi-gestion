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

---

## 31 de julio de 2026 — Ventas, clientes, VIP, pagos y penalidades

### Alcance

Primer recorrido manual en computadora por creación de cliente, nueva venta, borradores, reservas, pedido personalizado, clientes VIP, pagos, vencimientos, penalidades y liberaciones. Lo que no fue reportado por la usuaria se considera aprobado en esta ronda.

### Hallazgo crítico adicional — borrador con error 404

- Al guardar un borrador, la aplicación navega a `/ventas/borradores/:draftId`, pero la ruta no existe y React Router muestra su pantalla técnica `Unexpected Application Error — 404 Not Found`.
- Debe agregarse la ruta de edición del borrador y una pantalla de error propia, clara y recuperable.
- El borrador guardado debe continuar sin reservar stock hasta su confirmación, conforme a RF-056.

### Cambios y defectos registrados

1. **Buscadores — presentación general**
   - Corregir en todas las pantallas el espaciado, altura, alineación del icono y del texto para que el buscador no se vea recortado ni pegado al borde.

2. **Tablas — alineación general**
   - Centrar los rótulos de las cabeceras y los datos de las tablas, manteniendo una lectura uniforme.

3. **Búsquedas sin sensibilidad a tildes**
   - Las búsquedas deben encontrar la misma coincidencia con o sin tildes, por ejemplo `Maria` y `María`.
   - Se registra como mejora transversal de usabilidad; los requisitos de búsqueda existentes no detallaban normalización de acentos.

4. **Documento obligatorio del cliente**
   - Hacer obligatorios el tipo y el número de documento al crear o editar un cliente.
   - RF-011 exige registrar DNI entre los datos del cliente, pero la versión original no declaraba expresamente su obligatoriedad. Se incorpora como cambio de negocio confirmado durante la prueba.

5. **Retorno después de crear cliente desde Ventas**
   - Cuando el alta del cliente se inicia desde `Nueva venta`, al guardar debe regresar al flujo de venta y dejar seleccionado al cliente recién creado.
   - Si el alta se inicia desde el módulo Clientes, puede conservarse la navegación a la ficha del cliente.

6. **Cantidad cero**
   - Si se ingresa `0`, mostrar un mensaje específico como: `La cantidad debe ser de al menos 1 unidad.`
   - No usar el mensaje de stock excedido para este caso.

7. **Producto único y distribución manual por almacén**
   - Mostrar cada producto una sola vez con su stock total disponible.
   - La administradora distribuirá manualmente la cantidad entre los almacenes Lorena y Camila.
   - Validar que la suma distribuida coincida con la cantidad vendida y que no supere el stock de cada almacén.
   - Esta presentación simplifica el formulario sin eliminar la trazabilidad por almacén exigida por RF-030, RF-031 y RF-052.

8. **Espacio en Condiciones de la reserva**
   - Añadir separación visual entre el texto `Vacía: se aplicará el plazo normal o VIP` y las tarjetas `Acumula almacén` / `Entrega pendiente`.

9. **Botón Confirmar y reservar**
   - Ampliar el botón para que ocupe correctamente el ancho disponible del bloque de acciones.

10. **Stock reservado no visible**
    - Al confirmar una venta, disminuye `Disponible`, pero `Reservado` permanece en cero.
    - Es un defecto funcional contrario a RF-032, RF-033, RF-034 y RN-003: la cantidad debe pasar de disponible a reservada y mostrarse en ambas vistas de inventario.

11. **Alineación del motivo de vencimiento**
    - El campo `Motivo del vencimiento` debe quedar a la misma altura y con dimensiones coherentes respecto de `Fecha de vencimiento opcional`.

12. **Regla del motivo de vencimiento**
    - La fecha personalizada es opcional: si queda vacía, se usa el plazo normal o VIP.
    - Si la administradora cambia la fecha, el motivo sí debe ser obligatorio, porque RF-058 exige conservar el motivo del ajuste.
    - La interfaz debe explicar esta condición junto al campo y mostrar el error allí mismo.

13. **Pedido personalizado y error genérico**
    - RF-059 define `Pedido personalizado` como una venta bajo pedido identificada y reportada por separado.
    - El requisito no indica que permita vender sin stock ni que omita la reserva por almacén; esas capacidades requerirían una regla adicional.
    - `CUSTOM_ORDER` es un tipo aceptado por el contrato actual. El mensaje `Los datos enviados no son válidos` al confirmar debe reproducirse y corregirse; no debe tratarse como comportamiento esperado del pedido personalizado.

14. **Tarjeta de producto seleccionado**
    - Reducir la altura y el espacio ocupado por cada producto seleccionado, conservando cantidad, precio, distribución por almacén y acción de quitar.

15. **Adelanto mínimo VIP por defecto**
    - Inicializar `Adelanto mínimo acordado` en `0`, permitiendo que la administradora lo modifique.

16. **Motivo VIP en el resumen**
    - Mostrar en la revisión final tanto el adelanto mínimo acordado como el motivo o criterio del acuerdo.

17. **Plazo VIP visible**
    - Mostrar el plazo VIP y la fecha de vencimiento propuesta antes de confirmar la venta.
    - RF-057 exige que la fecha se proponga y pueda revisarse; RF-058 y RN-006 permiten un plazo especial VIP.

18. **Editar condición VIP existente**
    - `Gestionar VIP` no debe limitarse a revocar el beneficio cuando el cliente ya es VIP.
    - Debe permitir editar plazo especial y permiso para reservar sin adelanto, conservando motivo e historial, conforme a RF-014 y RF-015 y a la decisión vigente de v1.1.

19. **Reserva de S/0 sin autorización**
    - Si `Puede negociarse una separación sin adelanto` está desmarcado, la venta VIP no debe aceptar adelanto mínimo `0`.
    - El permiso configurado en el perfil debe aplicarse realmente durante la validación de la venta.

20. **Pago sin constancia — recuperación**
    - Si un medio exige constancia y se intenta confirmar sin archivo, mostrar el error dentro de la tarjeta del pago y ofrecer una acción `Editar` para adjuntarla.
    - RF-064 exige la constancia para los medios que la requieran y RNF-024 exige mensajes claros y recuperación sin perder datos.

21. **Ubicación general de errores**
    - Los errores de campo deben mostrarse junto al control donde ocurren.
    - Los errores o resultados generales de una operación pueden mostrarse como notificación visible arriba a la derecha.
    - No mostrar mensajes técnicos genéricos ni obligar a buscar el error en la parte superior de la página. Se relaciona con RNF-024.

22. **Estado vencido automático**
    - Una venta debe identificarse como vencida automáticamente al superar su fecha con saldo pendiente.
    - `Calcular o actualizar` debe recalcular/materializar la penalidad, pero no ser el evento que recién convierte la venta en vencida. RF-067 y RN-007 vinculan el atraso directamente con la fecha de vencimiento.

23. **Penalidad detallada por producto**
    - Mostrar cada penalidad de liberación con monto y producto, por ejemplo `S/ 5.00 — Peluche Gojo` o `S/ 10.00 — Figura Bulma`.
    - Aplicar la decisión vigente de v1.1 por línea: Peluches S/5, Figuras S/10, Acrílicos S/3, Llaveros S/1 y Otros S/0; el monto puede editarse con trazabilidad.

24. **Estado durante una liberación**
    - Mientras la solicitud espera revisión, la línea debe mostrarse visualmente como `Liberación pendiente`, aunque el stock continúe reservado.
    - Si se aprueba, mostrar `Liberado` o `Parcialmente liberado`, según corresponda.
    - Si se rechaza, volver a mostrar el estado operativo normal. RF-070 y RN-004 establecen que el stock no cambia antes de la aprobación.

### Clasificación de la ronda

- **Defectos funcionales prioritarios:** borrador 404, stock reservado en cero, validación de S/0 VIP, edición de VIP, vencimiento dependiente del cálculo, confirmación de pedido personalizado con error genérico y recuperación de constancia.
- **Cambios de negocio aprobados:** documento obligatorio y distribución manual de cantidades por almacén dentro de un producto único.
- **Ajustes de UX:** buscadores, tablas, tildes, mensajes junto al campo, espacios, tamaños, botones, resumen VIP y estados visuales.
- **Comportamiento correcto que debe conservarse:** la fecha personalizada puede dejarse vacía, pero cuando se modifica debe conservar un motivo.

### Estado

**Hallazgos guardados; todavía no implementados.** Continuar la validación de los módulos restantes antes de aplicar el paquete de correcciones.
