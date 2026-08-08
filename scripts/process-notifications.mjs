#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

async function loadEnvFile(path) {
  let content;
  try {
    content = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

await loadEnvFile('.env.notifications');
await loadEnvFile('apps/api/.env');

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Falta la variable ${name}.`);
}

const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workerId =
  process.env.NOTIFICATION_WORKER_ID ?? `github-${process.env.GITHUB_RUN_ID ?? process.pid}`;
const batchSize = Math.min(100, Math.max(1, Number(process.env.NOTIFICATION_BATCH_SIZE ?? 25)));

async function rpc(name, body = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${name}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function localMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function parseMinutes(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : fallback;
}

function isQuietHours(payload) {
  const current = localMinutes();
  const start = parseMinutes(payload.quietHoursStart, 21 * 60);
  const end = parseMinutes(payload.quietHoursEnd, 8 * 60);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

function notificationPayload(payload) {
  return {
    title: payload.title,
    body: payload.body,
    actionUrl: payload.actionUrl ?? '/',
    tag: payload.notificationId ? `yukimi-${payload.notificationId}` : undefined,
    notificationId: payload.notificationId,
    typeCode: payload.typeCode,
  };
}

function normalizePushSubscription(subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh =
    subscription?.keys?.p256dh ?? subscription?.p256dhKey ?? subscription?.p256dh_key ?? null;
  const auth = subscription?.keys?.auth ?? subscription?.authKey ?? subscription?.auth_key ?? null;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resolveActionUrl(actionUrl) {
  if (!actionUrl) return null;
  try {
    return new URL(actionUrl).toString();
  } catch {
    const baseUrl = process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
    if (!baseUrl) return null;
    const path = String(actionUrl).startsWith('/') ? String(actionUrl) : `/${actionUrl}`;
    return `${baseUrl}${path}`;
  }
}

function buildEmailText(payload) {
  const actionUrl = resolveActionUrl(payload.actionUrl);
  return `${payload.body ?? ''}${actionUrl ? `\n\nAbrir en Yukimi: ${actionUrl}` : ''}`;
}

function buildEmailHtml(payload) {
  const title = escapeHtml(payload.title || 'Notificación de Yukimi Gestión');
  const body = escapeHtml(payload.body || '').replaceAll('\n', '<br>');
  const typeLabel = escapeHtml(String(payload.typeCode || 'NOTIFICACIÓN').replaceAll('_', ' '));
  const actionUrl = resolveActionUrl(payload.actionUrl);
  const actionButton = actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px"><tr><td bgcolor="#6d3b5c" style="border-radius:10px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 22px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">Abrir en Yukimi</a></td></tr></table>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f2f4;color:#2d2430;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f6f2f4;padding:36px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #eadfe5;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(63,38,54,.08)">
            <tr>
              <td style="height:6px;background:#6d3b5c;font-size:0;line-height:0">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:30px 32px 8px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="52" valign="middle">
                      <div style="width:44px;height:44px;line-height:44px;text-align:center;border-radius:13px;background:#6d3b5c;color:#ffffff;font-size:20px;font-weight:700">Y</div>
                    </td>
                    <td valign="middle">
                      <div style="font-size:18px;font-weight:700;color:#3b2b38">Yukimi Gestión</div>
                      <div style="margin-top:3px;font-size:12px;color:#8a7684">Notificación del sistema</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 34px">
                <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#f2e8ee;color:#6d3b5c;font-size:11px;font-weight:700;letter-spacing:.35px">${typeLabel}</div>
                <h1 style="margin:18px 0 12px;font-size:25px;line-height:1.25;color:#2d2430">${title}</h1>
                <div style="font-size:16px;line-height:1.65;color:#5e505a">${body}</div>
                ${actionButton}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#fbf8fa;border-top:1px solid #eee4e9">
                <div style="font-size:12px;line-height:1.55;color:#927f8b">Este correo fue generado automáticamente por Yukimi Gestión. Puedes administrar tus canales de notificación desde Configuración.</div>
              </td>
            </tr>
          </table>
          <div style="max-width:620px;padding:16px 8px 0;text-align:center;font-size:11px;line-height:1.5;color:#a28f9b">Yukimi Gestión · Aviso operativo</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendEmail(payload) {
  if (!payload.emailEnabled) return false;
  if (!payload.email) throw new Error('La persona destinataria no tiene correo configurado.');
  if (process.env.RESEND_API_KEY) {
    const from = process.env.EMAIL_FROM;
    if (!from) throw new Error('Falta EMAIL_FROM para enviar con Resend.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [payload.email],
        subject: payload.title,
        text: buildEmailText(payload),
        html: buildEmailHtml(payload),
      }),
    });
    if (!response.ok)
      throw new Error(`Resend respondió ${response.status}: ${await response.text()}`);
    return true;
  }
  if (process.env.EMAIL_WEBHOOK_URL) {
    const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: payload.email,
        subject: payload.title,
        text: payload.body,
        actionUrl: payload.actionUrl,
      }),
    });
    if (!response.ok)
      throw new Error(`Webhook de correo respondió ${response.status}: ${await response.text()}`);
    return true;
  }
  throw new Error('Correo habilitado, pero no se configuró RESEND_API_KEY ni EMAIL_WEBHOOK_URL.');
}

async function sendPushWithVapid(subscriptions, payload) {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;

  let webPushModule;
  try {
    webPushModule = await import('web-push');
  } catch {
    throw new Error(
      'Falta el paquete web-push. Instálalo para el worker con npm install --no-save web-push@3.6.7.',
    );
  }
  const webPush = webPushModule.default ?? webPushModule;
  webPush.setVapidDetails(subject, publicKey, privateKey);

  let sent = 0;
  let expired = 0;
  let lastError = null;
  const body = JSON.stringify(notificationPayload(payload));

  for (const rawSubscription of subscriptions) {
    const subscription = normalizePushSubscription(rawSubscription);
    if (!subscription) continue;
    try {
      await webPush.sendNotification(subscription, body, { TTL: 60 * 60 });
      sent += 1;
    } catch (error) {
      const statusCode = Number(error?.statusCode ?? error?.status ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        expired += 1;
        continue;
      }
      lastError = error;
    }
  }

  if (sent > 0) return true;
  if (lastError) throw lastError;
  if (expired > 0) return false;
  return false;
}

async function sendPushWithGateway(subscriptions, payload) {
  if (!process.env.PUSH_GATEWAY_URL) return null;
  const response = await fetch(process.env.PUSH_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.PUSH_GATEWAY_TOKEN
        ? { authorization: `Bearer ${process.env.PUSH_GATEWAY_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      subscriptions,
      notification: notificationPayload(payload),
    }),
  });
  if (!response.ok)
    throw new Error(`Gateway push respondió ${response.status}: ${await response.text()}`);
  return true;
}

async function sendPush(payload) {
  if (!payload.pushEnabled) return false;
  const subscriptions = Array.isArray(payload.pushSubscriptions) ? payload.pushSubscriptions : [];
  if (subscriptions.length === 0) return false;

  const directResult = await sendPushWithVapid(subscriptions, payload);
  if (directResult !== null) return directResult;

  const gatewayResult = await sendPushWithGateway(subscriptions, payload);
  if (gatewayResult !== null) return gatewayResult;

  throw new Error(
    'Push habilitado, pero faltan WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY y WEB_PUSH_SUBJECT.',
  );
}

await rpc('run_notification_scheduler_v1', { p_now: new Date().toISOString() });
const events = await rpc('claim_notification_outbox_events_v1', {
  p_worker: workerId,
  p_limit: batchSize,
});
let processed = 0;
let failed = 0;
let deferred = 0;

for (const event of events ?? []) {
  try {
    if (event.eventType !== 'DELIVER_NOTIFICATION')
      throw new Error(`Tipo de evento no soportado: ${event.eventType}`);
    const payload = event.payload ?? {};
    if (payload.pushEnabled && isQuietHours(payload)) {
      await rpc('defer_outbox_event_v1', {
        p_event_id: event.id,
        p_available_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        p_reason: 'Entrega diferida por horario silencioso.',
      });
      deferred += 1;
      continue;
    }
    const [emailSent, pushSent] = await Promise.all([sendEmail(payload), sendPush(payload)]);
    if (!emailSent && !pushSent && !payload.inAppEnabled)
      throw new Error('La notificación no tiene ningún canal habilitado o disponible.');
    await rpc('complete_outbox_event_v1', { p_event_id: event.id, p_success: true, p_error: null });
    processed += 1;
  } catch (error) {
    failed += 1;
    await rpc('complete_outbox_event_v1', {
      p_event_id: event.id,
      p_success: false,
      p_error: error instanceof Error ? error.message : String(error),
    });
    console.error(`Evento ${event.id}:`, error);
  }
}

console.log(
  JSON.stringify({ workerId, claimed: events?.length ?? 0, processed, deferred, failed }),
);
if (failed > 0) process.exitCode = 1;
