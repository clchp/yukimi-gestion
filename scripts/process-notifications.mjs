#!/usr/bin/env node

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

async function sendPush(payload) {
  if (!payload.pushEnabled) return false;
  const subscriptions = Array.isArray(payload.pushSubscriptions) ? payload.pushSubscriptions : [];
  if (subscriptions.length === 0) return false;
  if (!process.env.PUSH_GATEWAY_URL)
    throw new Error('Push habilitado, pero falta PUSH_GATEWAY_URL.');
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
      notification: {
        title: payload.title,
        body: payload.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: {
          url: payload.actionUrl ?? '/',
          notificationId: payload.notificationId,
          typeCode: payload.typeCode,
        },
      },
    }),
  });
  if (!response.ok)
    throw new Error(`Gateway push respondió ${response.status}: ${await response.text()}`);
  return true;
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
