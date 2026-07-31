# Continuación de bitácora — Revalidación de Ventas

> Fecha: 31 de julio de 2026  
> Rama: `version-1-1`  
> Complementa `docs/BITACORA_PRUEBAS_MANUALES_V1_1.md`.

## Dashboard — periodo y detalle del gráfico

1. Reemplazar la opción `Personalizado` por `Total`.
2. Mantener únicamente los periodos visibles: `Hoy`, `7 días`, `Mes` y `Total`.
3. Al colocar el cursor sobre una barra o segmento, mostrar un recuadro informativo con la fecha o periodo correspondiente y ambos valores:

   ```text
   Ventas: S/ ...
   Cobros: S/ ...
   ```

4. Cada valor debe conservar el color de su serie.
5. El recuadro debe aparecer tanto cuando una de las series sea cero como cuando ambas tengan valor.

## Ayudas explicativas mediante icono `(i)`

- Las explicaciones de conceptos de negocio no deben ocupar espacio permanente como párrafos visibles dentro del formulario o listado.
- Colocar un icono pequeño `(i)` junto al rótulo correspondiente.
- Al pasar el cursor por computadora o tocar el icono en celular, debe aparecer un recuadro breve con la explicación.
- Aplicar este patrón, como mínimo, a:
  - `Reservadas`.
  - `Adelanto mínimo requerido para esta reserva`.
  - `Acumula almacén`.
  - `Entrega por coordinar`.
  - Cualquier otro término que pueda ser ambiguo para una administradora.
- El recuadro debe poder cerrarse al retirar el cursor, tocar fuera o presionar Escape, según el dispositivo.
- No debe tapar campos importantes ni salirse del contenedor.

## Aclaración del filtro `Reservadas`

- En el listado de ventas, `Reservadas` significa ventas ya confirmadas cuyas unidades fueron separadas del stock disponible para un cliente.
- Una venta reservada no equivale necesariamente a una venta pagada. Puede estar sin pago, con pago parcial o pagada.
- `Todas` muestra las ventas sin limitar por esa condición.
- La opción `Total` del gráfico del dashboard corresponde a todo el periodo histórico y no reemplaza ni significa lo mismo que `Reservadas`.
- Mostrar esta explicación únicamente mediante el icono `(i)` junto al filtro `Reservadas`.

## Adelanto mínimo acordado para clientes VIP

- Cambiar la etiqueta por `Adelanto mínimo requerido para esta reserva`.
- El adelanto mínimo es una condición de la reserva y no un importe adicional.
- No se suma al total de la venta.
- Ejemplo: si la venta total es S/ 155 y el adelanto mínimo es S/ 10, el total continúa siendo S/ 155.
- Mientras no exista un pago confirmado, el saldo continúa siendo S/ 155.
- Cuando se registra y confirma un pago de S/ 10, el total pagado pasa a S/ 10 y el saldo queda en S/ 145.
- Registrar el valor del adelanto mínimo no debe crear automáticamente un pago ni un ingreso financiero.
- La venta solo debe considerarse que cumplió la condición de adelanto cuando la suma de pagos confirmados alcance o supere el monto mínimo acordado.
- Si el perfil VIP permite reservar sin adelanto, el valor puede ser S/ 0.
- Si el perfil VIP no permite reservar sin adelanto, el sistema debe exigir un valor mayor que cero y verificar el pago correspondiente según la regla definida para confirmar o mantener la reserva.
- La explicación debe aparecer mediante un icono `(i)` junto al campo, con un texto breve como: `Es el pago mínimo requerido para separar la mercadería. No se suma al total ni registra un pago automáticamente.`
- Para ventas regulares, los pagos parciales continúan registrándose en Pagos. La especificación actual no define un adelanto mínimo configurable por cliente regular.

## Listado de ventas y clientes — presentación visual

1. Corregir el buscador para que no quede pegado a la esquina y para que el icono permanezca dentro del campo.
2. Separar visualmente el nombre, código y teléfono del cliente.
3. No mostrar el código interno unido al nombre en la misma línea sin separación.
4. Presentación sugerida:

   ```text
   Karin
   CLI-000005 · 995033879
   ```

5. Mantener alturas, márgenes y alineación consistentes en todas las filas.
6. Revisar que los valores no se superpongan al cambiar el ancho de la ventana.

## Estados completamente en español y con colores consistentes

En la ficha del cliente y en cualquier tabla relacionada, reemplazar los textos técnicos en inglés:

- `UNPAID` → `Sin pago`.
- `PARTIAL` → `Pago parcial`.
- `PAID` → `Pagada`.
- `OVERDUE` → `Vencida`.
- `ACCUMULATED` → `Acumula almacén`.
- `DELIVERED` → `Entregada`.

Aplicar indicadores visuales coherentes:

- Verde: pagada, entregada, al día.
- Amarillo o ámbar: sin pago, pago parcial, entrega por coordinar.
- Rojo: vencida, cancelada o estado que requiere atención.
- Morado o azul: acumula almacén.

Los estados de pago y de entrega deben permanecer en columnas separadas para no mezclar conceptos.

## Etiqueta QR — defecto funcional y visual

1. La vista previa de la etiqueta aparece vacía y no muestra el código QR.
2. El contenido interior y el borde de la etiqueta se desplazan hacia un lado y dejan de estar centrados.
3. Corregir la generación del QR para que identifique realmente el producto.
4. Centrar dentro de la etiqueta:
   - Nombre del producto.
   - Variante y SKU.
   - Código QR.
5. Ajustar el tamaño del QR para que sea legible al imprimir y no se recorte.
6. El borde de la etiqueta debe cerrarse correctamente y mantenerse dentro del área imprimible.
7. La vista previa, la impresión y el archivo descargado deben mostrar el mismo contenido.
8. Evitar un espacio vertical excesivo y una barra de desplazamiento innecesaria cuando la etiqueta cabe en pantalla.
9. Validar la etiqueta descargada y la impresa con un lector de QR antes de considerar el caso aprobado.

## Clasificación

- **Defecto funcional prioritario:** QR ausente en la etiqueta.
- **Defectos visuales:** etiqueta descentrada, buscadores pegados al borde, información de cliente amontonada.
- **Internacionalización pendiente:** estados técnicos en inglés.
- **Aclaraciones de negocio y UX:** ayudas mediante `(i)`, significado de Reservadas y funcionamiento del adelanto VIP.
- **Cambio pendiente ya confirmado:** periodo `Total` y tooltip del gráfico.

## Estado

**Pendiente de implementación y prueba manual en la rama `version-1-1`. `main` no debe modificarse.**
