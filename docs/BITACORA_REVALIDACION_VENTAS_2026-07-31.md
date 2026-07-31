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

## Aclaración del filtro `Reservadas`

- En el listado de ventas, `Reservadas` significa ventas ya confirmadas cuyas unidades fueron separadas del stock disponible para un cliente.
- Una venta reservada no equivale necesariamente a una venta pagada. Puede estar sin pago, con pago parcial o pagada.
- `Todas` muestra las ventas sin limitar por esa condición.
- La opción `Total` del gráfico del dashboard corresponde a todo el periodo histórico y no reemplaza ni significa lo mismo que `Reservadas`.
- Evaluar añadir una ayuda breve o tooltip junto al filtro para evitar confusión.

## Adelanto mínimo acordado para clientes VIP

- El adelanto mínimo acordado es el importe mínimo que se pacta para permitir la separación o reserva de la mercadería.
- No representa por sí mismo un pago ya registrado; el pago real se registra después en el módulo de pagos.
- La regla especial aparece para clientes VIP porque su perfil permite configurar límites, plazos y la posibilidad de reservar sin adelanto.
- Cambiar la etiqueta por una más clara: `Adelanto mínimo requerido para esta reserva`.
- Añadir una ayuda visible: `Este monto es la condición acordada; no registra un pago automáticamente.`
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
- **Aclaraciones de negocio y UX:** significado de Reservadas y del adelanto VIP.
- **Cambio pendiente ya confirmado:** periodo `Total` y tooltip del gráfico.

## Estado

**Pendiente de implementación y prueba manual en la rama `version-1-1`. `main` no debe modificarse.**
