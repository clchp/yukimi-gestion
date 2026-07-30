# Fase 4 — Clientes, direcciones y condición VIP

## Alcance implementado

- Lista real de clientes con búsqueda, filtros y paginación.
- Resumen real de clientes activos, VIP, saldo pendiente y vencidos.
- Creación de clientes con código automático e idempotencia.
- Edición con control optimista de versión.
- Activación y desactivación sin borrado físico.
- Varias direcciones por cliente y una dirección principal.
- Agencia preferida por dirección.
- Gestión VIP con motivo, límite, plazo y reserva sin adelanto.
- Historial inmutable de cambios VIP.
- Registro y resolución de incumplimientos e incidencias.
- Detalle real con estadísticas, direcciones, incidentes y ventas recientes.
- Auditoría automática mediante los triggers existentes.

## Migraciones requeridas

Ejecutar en orden:

1. `supabase/migrations/012_add_product_attribute_description.sql`
2. `supabase/migrations/013_clients_vip_api.sql`
3. `supabase/tests/004_phase4_clients_checks.sql`

## Endpoints

```text
GET    /api/v1/clients
GET    /api/v1/clients/support-data
GET    /api/v1/clients/:clientId
POST   /api/v1/clients
PUT    /api/v1/clients/:clientId
PATCH  /api/v1/clients/:clientId/status
PUT    /api/v1/clients/:clientId/vip
POST   /api/v1/clients/:clientId/addresses
PUT    /api/v1/clients/:clientId/addresses/:addressId
POST   /api/v1/clients/:clientId/incidents
PATCH  /api/v1/clients/incidents/:incidentId/resolve
```

## Pruebas de aceptación

### CLI-01 Crear cliente

1. Ir a `Clientes > Nuevo cliente`.
2. Registrar nombre, celular, DNI y dirección.
3. Guardar.

Resultado esperado: se genera un código `CLI-...`, aparece la ficha y persiste al recargar.

### CLI-02 Bloquear duplicado de documento

Crear otro cliente activo con el mismo tipo y número de documento.

Resultado esperado: respuesta 409 y mensaje de registro duplicado.

### CLI-03 Editar cliente

Editar celular o notas desde la ficha.

Resultado esperado: el cambio persiste y aumenta la versión del registro.

### CLI-04 Direcciones

Agregar una segunda dirección y marcarla como principal.

Resultado esperado: solamente una dirección activa queda como principal.

### CLI-05 Condición VIP

Otorgar VIP con motivo, límite y plazo.

Resultado esperado: la ficha muestra VIP y aparece un movimiento `GRANTED` en el historial.

Actualizar el límite.

Resultado esperado: aparece un movimiento `UPDATED`.

Retirar VIP.

Resultado esperado: aparece `REVOKED`; no se borra el historial.

### CLI-06 Incidentes

Registrar un pago tardío de severidad alta y después marcarlo como resuelto.

Resultado esperado: aparece primero pendiente y después resuelto con nota de resolución.

### CLI-07 Desactivar y reactivar

Desactivar el cliente desde su ficha.

Resultado esperado: queda visible como inactivo, no se elimina y puede reactivarse.

### CLI-08 Seguridad

Cerrar sesión e intentar abrir `/clientes`.

Resultado esperado: redirección al inicio de sesión.

### CLI-09 Concurrencia

Abrir el mismo cliente en dos pestañas. Editarlo en la primera y después intentar guardar desde la segunda.

Resultado esperado: la segunda recibe conflicto 409 y solicita actualizar la pantalla.

### CLI-10 Responsive

Probar en 390 × 844 y 1440 × 900.

Resultado esperado: formularios, tarjetas, modales y acciones quedan accesibles sin desbordamiento horizontal.
