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
        text: `${payload.body}${payload.actionUrl ? `\n\nAbrir: ${process.env.PUBLIC_APP_URL ?? ''}${payload.actionUrl}` : ''}`,
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
const events = await rpc('claim_outbox_events_v1', { p_worker: workerId, p_limit: batchSize });
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
