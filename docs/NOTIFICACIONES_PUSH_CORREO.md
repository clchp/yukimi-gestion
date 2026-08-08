# Notificaciones Push y correo

Yukimi usa un mismo evento de notificación y decide los canales según la preferencia de cada administradora: interna, push y correo.

## Push

El frontend registra la suscripción del navegador con `VITE_WEB_PUSH_PUBLIC_KEY`. El worker usa el mismo par VAPID para enviar directamente al endpoint guardado del dispositivo.

Variables del frontend:

```text
VITE_WEB_PUSH_PUBLIC_KEY=<clave pública VAPID>
```

Variables del worker:

```text
WEB_PUSH_PUBLIC_KEY=<misma clave pública VAPID>
WEB_PUSH_PRIVATE_KEY=<clave privada VAPID>
WEB_PUSH_SUBJECT=mailto:correo-tecnico@example.com
```

La clave privada nunca debe ir en el frontend ni versionarse.

## Correo

El worker soporta Resend de forma directa:

```text
RESEND_API_KEY=<api key de Resend>
EMAIL_FROM=Yukimi Gestion <onboarding@resend.dev>
```

Para producción, reemplazar `EMAIL_FROM` por un remitente de un dominio verificado.

## Worker

El worker ejecuta el scheduler, reclama eventos pendientes del outbox, respeta el horario silencioso y entrega los canales externos habilitados.

En local puede leer `.env.notifications` y, como respaldo, `apps/api/.env`. Copiar el ejemplo:

```text
copy .env.notifications.example .env.notifications
```

`SUPABASE_SERVICE_ROLE_KEY` se usa exclusivamente por el worker de confianza; no debe exponerse al navegador ni agregarse al `.env` del frontend.

Para una ejecución local:

```text
npm install --no-save web-push@3.6.7
npm run notifications:process
```

## GitHub Actions

El workflow `.github/workflows/notifications.yml` corre cada hora y también permite ejecución manual. Configurar estos secretos del repositorio:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
PUBLIC_APP_URL
WEB_PUSH_PUBLIC_KEY
WEB_PUSH_PRIVATE_KEY
WEB_PUSH_SUBJECT
RESEND_API_KEY
EMAIL_FROM
```

`EMAIL_WEBHOOK_URL`, `PUSH_GATEWAY_URL` y `PUSH_GATEWAY_TOKEN` son alternativas opcionales y no son necesarias cuando se usan Resend y VAPID directo.

## Prueba funcional

1. Iniciar sesión con una administradora.
2. En Configuración > Notificaciones, activar Push para el tipo que se quiere probar.
3. Pulsar `Activar push en este dispositivo` y aceptar el permiso del navegador.
4. Activar Correo para el mismo tipo si se desea probar email.
5. Generar una condición real, por ejemplo un pago vencido, boleta pendiente, despacho pendiente o stock bajo.
6. Ejecutar manualmente `Yukimi Notifications` o esperar la ejecución programada.
7. Comprobar la notificación interna, el push del sistema operativo y el correo según los canales activados.
