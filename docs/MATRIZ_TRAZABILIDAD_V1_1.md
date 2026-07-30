# Matriz de trazabilidad — Yukimi Gestión v1.1

| Requisito posterior a v1.0                | Base de datos            | Backend / contrato                  | Frontend                                                                                        | Pruebas                          | Estado                                           |
| ----------------------------------------- | ------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------ |
| Penalidad por línea y sugerencia editable | Migración 026            | Cotización, solicitud y revisión v2 | Detalle de venta y modales explícitos                                                           | pgTAP 005 + contratos API        | Implementado                                     |
| Mayor entre mora y liberación             | Migración 026            | Cotización v2                       | Explicación y desglose                                                                          | pgTAP 005                        | Implementado                                     |
| Retención desde adelanto                  | Migración 026            | Respuesta con retenido/reembolsable | Resumen de devolución                                                                           | pgTAP 005 + contratos API        | Implementado                                     |
| VIP negociado por venta                   | Migración 027            | Creación de venta v2                | Flujo de nueva venta y perfil cliente                                                           | pgTAP 006 + contratos API        | Implementado                                     |
| Costo importado automático                | Migraciones 028–029      | Costos y recepción v2               | Recepción sin costo manual; advertencia bajo costo                                              | pgTAP 007 + contratos API        | Implementado                                     |
| Costos posteriores como ajuste            | Migración 028            | Recalculo idempotente               | Se refleja en costo vigente                                                                     | pgTAP 007                        | Implementado                                     |
| Obligaciones de tarjeta completas         | Migración 030            | Creación v2                         | Formulario financiero                                                                           | pgTAP 008 + contratos API        | Implementado                                     |
| Dos RUC / emisor                          | Migración 031            | Contratos aún pendientes            | UI pendiente de datos legales                                                                   | pgTAP 009                        | Preparado, bloqueado por datos                   |
| Búsqueda ERP global                       | Migración 032            | `GET /api/v1/search`                | Buscador con teclado y rutas reales                                                             | pgTAP 010 + contratos API        | Implementado                                     |
| UI responsive sin datos ocultos           | Sin cambio               | Sin cambio                          | Tarjetas móviles o tablas desplazables                                                          | `test:ui:static`                 | Implementado; aceptación visual manual pendiente |
| Acciones sin diálogos del navegador       | Sin cambio               | Contratos existentes                | Modales accesibles en ventas, pagos, entregas, importaciones, clientes, finanzas y conciliación | Typecheck + `test:ui:static`     | Implementado                                     |
| Rendimiento de primera carga              | Sin cambio               | Sin cambio                          | Páginas divididas por ruta                                                                      | Build Vite con chunks por página | Implementado                                     |
| RLS en exportaciones                      | Migración 024            | Sin cambio                          | Sin cambio                                                                                      | pgTAP dinámico de esquema/RLS    | Implementado                                     |
| Defaults configurables confirmados        | Migración 025            | Consumidos por flujos v2            | Valores sugeridos                                                                               | pgTAP 004                        | Implementado                                     |
| Dos Yapes BCP                             | Configuración preparada  | Pendiente                           | Pendiente                                                                                       | Pendiente de datos               | Bloqueado por datos                              |
| Reporte semanal por correo                | Configuración preparada  | Programación pendiente              | No aplica                                                                                       | Pendiente                        | Bloqueado por destinatarios                      |
| Push y silencio                           | Configuración existente  | Programación pendiente              | Preferencias pendientes                                                                         | Pendiente                        | Bloqueado por reglas                             |
| Ingreso nuevo sin comprobante             | Estado técnico preparado | No se automatiza                    | No se habilita ocultamiento                                                                     | No aplica                        | Bloqueo legal/tributario                         |

## Verificaciones obligatorias

La CI ejecuta:

1. ESLint.
2. Compilación del paquete compartido.
3. Typecheck de shared, API y web.
4. Pruebas de contrato/API.
5. Validación estática de migraciones.
6. Validación estática de planes pgTAP.
7. Verificación estática de flujos críticos y responsive.
8. Build de producción.
9. Supabase local desde cero.
10. Aplicación incremental de todas las migraciones.
11. pgTAP de esquema, RLS y reglas de negocio.
12. Pruebas de idempotencia y concurrencia.
13. Lint SQL de Supabase.

No se considera cerrada una migración hasta que pase el trabajo dinámico `database` de GitHub Actions.

## Limitación de validación visual

El navegador remoto disponible para esta ejecución bloqueó la URL local de Vite (`ERR_BLOCKED_BY_CLIENT`). Por ello se completaron build, typecheck, validación estática responsive y revisión de alternativas móviles, pero la aceptación visual con captura e interacción a anchos reales debe ejecutarse en un entorno que pueda abrir la aplicación local o una vista previa no productiva. Esta limitación no autoriza desplegar.
