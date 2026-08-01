# Continuación de bitácora — Importaciones

> Fecha: 1 de agosto de 2026  
> Rama: `version-1-1`  
> Complementa `docs/BITACORA_REVALIDACION_IMPORTACIONES_2026-08-01.md`.

## Resultado del avance a `Despacho confirmado`

- La importación `IMP-000003` avanzó desde `En almacén internacional` hasta `Despacho confirmado`.
- La ventana solicitó `Motivo o evidencia *`, lo cual es obligatorio y adecuado para la trazabilidad.
- El campo `Tracking maestro` no mostró asterisco y el sistema permitió continuar sin completarlo, por lo que actualmente funciona como campo opcional.
- La acción siguiente cambió a `Avanzar a Embarcado`.
- Las unidades recibidas continúan en cero y no debe existir todavía ingreso a stock.

## Hallazgo 11 — Leyenda global de campo obligatorio ambigua

- Debajo de `Tracking maestro` aparece la leyenda general `* Campo obligatorio`.
- Por su ubicación, parece indicar que `Tracking maestro` es obligatorio, aunque el campo no tiene asterisco y el sistema permite dejarlo vacío.
- Eliminar la leyenda global de la parte inferior, porque cada campo obligatorio ya debe identificarse con un asterisco rojo junto a su propia etiqueta.
- Mostrar el campo como `Tracking maestro (opcional)` para evitar dudas.
- Mantener `Motivo o evidencia *` como obligatorio.
- Si posteriormente el tracking se vuelve obligatorio en otro estado, el asterisco debe aparecer directamente junto a `Tracking maestro` y el error debe mostrarse debajo del campo.

## Hallazgo 12 — Despacho confirmado sin operador internacional

- La importación pudo avanzar a `Despacho confirmado` aunque previamente el selector de operador internacional se encontraba vacío y no existía una forma visible de crear uno.
- Antes de confirmar el despacho debe existir un operador internacional seleccionado, porque la ficha logística debe conservar al responsable del transporte internacional.
- El sistema debe impedir el avance y mostrar un error junto al operador cuando no exista.
- Debe ofrecerse `+ Crear operador` sin abandonar el formulario ni perder datos.

## Estado

**La importación está en `Despacho confirmado`. Pendiente validar la ventana de avance a `Embarcado`. `main` no debe modificarse.**
