# Notificaciones y scheduler

La migración `034_compliance_closure.sql` incorpora un flujo transaccional de notificaciones basado en outbox:

1. `run_notification_scheduler_v1` actualiza alertas operativas, genera el resumen semanal y los recordatorios de despacho de lunes y jueves.
2. `queue_notification_deliveries_v1` crea eventos idempotentes `DELIVER_NOTIFICATION`.
3. `claim_outbox_events_v1` reclama lotes con `FOR UPDATE SKIP LOCKED`, recupera bloqueos vencidos y evita que dos workers procesen el mismo evento.
4. `defer_outbox_event_v1` posterga notificaciones durante el horario silencioso sin consumir reintentos.
5. `complete_outbox_event_v1` marca éxito, reintenta con espera exponencial o envía a `DEAD_LETTER` después de cinco intentos.

## Ejecución

El workflow `.github/workflows/notifications.yml` corre cada hora y también puede iniciarse manualmente. Requiere estos secretos:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_APP_URL`

Para correo, configurar una de estas opciones:

- Resend: `RESEND_API_KEY` y `EMAIL_FROM`.
- Webhook propio: `EMAIL_WEBHOOK_URL`.

Para push web, configurar:

- `PUSH_GATEWAY_URL`, endpoint que reciba las suscripciones y el contenido de la notificación.
- `PUSH_GATEWAY_TOKEN`, opcional.
- `VITE_PUBLIC_VAPID_KEY` en el frontend.

El worker falla de forma visible cuando un canal está habilitado pero no tiene adaptador configurado; no marca como enviado algo que no pudo entregar.
