import { getAdminSettings, upsertNotificationPreference } from '../features/admin/admin-api';

const CONTROL_ATTRIBUTE = 'notificationRuntimeControls';
const STYLE_ID = 'notification-runtime-settings-style';

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .notification-runtime-push-status {
      margin: 10px 0 18px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted, #756a70);
      font-size: 13px;
    }
    .notification-runtime-push-status::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #a69ca1;
      flex: 0 0 auto;
    }
    .notification-runtime-push-status[data-state='active']::before {
      background: #2f8f62;
    }
    .notification-runtime-push-status[data-state='error']::before {
      background: #b94b5b;
    }
    .notification-runtime-card {
      margin: 0 0 18px;
      padding: 18px;
      border: 1px solid var(--border-color, #e6dde1);
      border-radius: 14px;
      background: var(--surface-subtle, #faf8f9);
    }
    .notification-runtime-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }
    .notification-runtime-card-header strong {
      display: block;
      margin-bottom: 4px;
    }
    .notification-runtime-card-header small,
    .notification-runtime-feedback {
      color: var(--text-muted, #756a70);
    }
    .notification-runtime-time-grid {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr) auto;
      align-items: end;
      gap: 12px;
    }
    .notification-runtime-time-grid .field {
      margin: 0;
    }
    .notification-runtime-feedback {
      display: block;
      min-height: 18px;
      margin-top: 10px;
      font-size: 12px;
    }
    .notification-runtime-feedback[data-tone='success'] {
      color: #2f7756;
    }
    .notification-runtime-feedback[data-tone='error'] {
      color: #a33f4f;
    }
    @media (max-width: 720px) {
      .notification-runtime-time-grid {
        grid-template-columns: 1fr;
      }
      .notification-runtime-time-grid .button {
        width: 100%;
      }
    }
  `;
  document.head.append(style);
}

function formatTime(value: string | null | undefined, fallback: string) {
  const normalized = value?.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(normalized ?? '') ? (normalized as string) : fallback;
}

function updateRenderedQuietHourLabels(root: HTMLElement, start: string, end: string) {
  for (const small of root.querySelectorAll<HTMLElement>('.setting-list small')) {
    if (!small.textContent?.includes('horario silencioso')) continue;
    small.textContent = small.textContent.replace(
      /horario silencioso\s+\d{2}:\d{2}[–-]\d{2}:\d{2}/i,
      `horario silencioso ${start}–${end}`,
    );
  }
}

async function refreshPushDeviceStatus(status: HTMLElement) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    status.dataset.state = 'error';
    status.textContent = 'Push no está disponible en este navegador.';
    return;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      status.dataset.state = 'idle';
      status.textContent = 'Push todavía no está registrado en este dispositivo.';
      return;
    }
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      status.dataset.state = 'active';
      status.textContent = 'Push activo en este dispositivo.';
    } else {
      status.dataset.state = 'idle';
      status.textContent = 'Permiso concedido; falta registrar este dispositivo para Push.';
    }
  } catch {
    status.dataset.state = 'error';
    status.textContent = 'No se pudo comprobar el estado de Push.';
  }
}

async function hydrateQuietHourControls(
  root: HTMLElement,
  card: HTMLElement,
  startInput: HTMLInputElement,
  endInput: HTMLInputElement,
  feedback: HTMLElement,
) {
  if (card.dataset.loaded === 'true') return;
  card.dataset.loaded = 'true';
  feedback.textContent = 'Cargando horario actual…';

  try {
    const admin = await getAdminSettings();
    const preferences = admin.preferences ?? [];
    const starts = preferences.map((item) => formatTime(item.quietHoursStart, '21:00'));
    const ends = preferences.map((item) => formatTime(item.quietHoursEnd, '08:00'));
    const start = starts[0] ?? '21:00';
    const end = ends[0] ?? '08:00';
    const hasMixedSchedules = new Set(starts).size > 1 || new Set(ends).size > 1;

    startInput.value = start;
    endInput.value = end;
    card.dataset.currentStart = start;
    card.dataset.currentEnd = end;
    updateRenderedQuietHourLabels(root, start, end);
    feedback.textContent = hasMixedSchedules
      ? 'Hay horarios distintos entre eventos. Al guardar se unificará el horario para todos.'
      : `Horario actual: ${start}–${end}.`;
  } catch (error) {
    card.dataset.loaded = 'false';
    feedback.dataset.tone = 'error';
    feedback.textContent =
      error instanceof Error ? error.message : 'No se pudo cargar el horario silencioso.';
  }
}

async function saveQuietHours(
  root: HTMLElement,
  card: HTMLElement,
  startInput: HTMLInputElement,
  endInput: HTMLInputElement,
  button: HTMLButtonElement,
  feedback: HTMLElement,
) {
  const start = startInput.value;
  const end = endInput.value;
  feedback.dataset.tone = '';

  if (!start || !end) {
    feedback.dataset.tone = 'error';
    feedback.textContent = 'Selecciona la hora de inicio y la hora de fin.';
    return;
  }
  if (start === end) {
    feedback.dataset.tone = 'error';
    feedback.textContent = 'La hora de inicio y la hora de fin deben ser diferentes.';
    return;
  }

  button.disabled = true;
  button.textContent = 'Guardando…';
  feedback.textContent = 'Actualizando todos los tipos de notificación…';

  try {
    const admin = await getAdminSettings();
    await Promise.all(
      admin.notificationTypes.map((type) => {
        const current = admin.preferences.find(
          (item) => item.notificationTypeCode === type.code,
        );
        return upsertNotificationPreference({
          notificationTypeCode: type.code,
          inAppEnabled: current?.inAppEnabled ?? true,
          pushEnabled: current?.pushEnabled ?? false,
          emailEnabled: current?.emailEnabled ?? false,
          quietHoursStart: start,
          quietHoursEnd: end,
        });
      }),
    );

    card.dataset.currentStart = start;
    card.dataset.currentEnd = end;
    updateRenderedQuietHourLabels(root, start, end);
    feedback.dataset.tone = 'success';
    feedback.textContent = `Horario silencioso guardado: ${start}–${end} para todos los eventos.`;
  } catch (error) {
    feedback.dataset.tone = 'error';
    feedback.textContent =
      error instanceof Error ? error.message : 'No se pudo guardar el horario silencioso.';
  } finally {
    button.disabled = false;
    button.textContent = 'Guardar horario';
  }
}

function enhanceNotificationSettings() {
  if (location.pathname !== '/configuracion') return;
  ensureStyles();

  const root = document.querySelector<HTMLElement>('main.page');
  if (!root) return;
  const pushButton = [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Activar push en este dispositivo'),
  );
  if (!pushButton) return;

  const panel = pushButton.closest<HTMLElement>('.panel') ?? pushButton.parentElement;
  const settingList = panel?.querySelector<HTMLElement>('.setting-list');
  if (!panel || !settingList) return;

  let pushStatus = panel.querySelector<HTMLElement>('[data-notification-push-status]');
  if (!pushStatus) {
    pushStatus = document.createElement('div');
    pushStatus.className = 'notification-runtime-push-status';
    pushStatus.dataset.notificationPushStatus = 'true';
    pushButton.insertAdjacentElement('afterend', pushStatus);
    pushButton.addEventListener('click', () => {
      if (!pushStatus) return;
      pushStatus.dataset.state = 'idle';
      pushStatus.textContent = 'Registrando este dispositivo…';
      window.setTimeout(() => void refreshPushDeviceStatus(pushStatus as HTMLElement), 900);
      window.setTimeout(() => void refreshPushDeviceStatus(pushStatus as HTMLElement), 2500);
    });
  }
  void refreshPushDeviceStatus(pushStatus);

  let card = panel.querySelector<HTMLElement>('[data-notification-runtime-controls]');
  if (!card) {
    card = document.createElement('section');
    card.className = 'notification-runtime-card';
    card.dataset[CONTROL_ATTRIBUTE] = 'true';

    const header = document.createElement('div');
    header.className = 'notification-runtime-card-header';
    const heading = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'Horario silencioso';
    const description = document.createElement('small');
    description.textContent =
      'Durante este rango, las alertas Push se aplazan. El horario se aplica a todos los eventos.';
    heading.append(title, description);
    header.append(heading);

    const grid = document.createElement('div');
    grid.className = 'notification-runtime-time-grid';

    const startLabel = document.createElement('label');
    startLabel.className = 'field';
    const startText = document.createElement('span');
    startText.textContent = 'Desde';
    const startInput = document.createElement('input');
    startInput.type = 'time';
    startInput.value = '21:00';
    startLabel.append(startText, startInput);

    const endLabel = document.createElement('label');
    endLabel.className = 'field';
    const endText = document.createElement('span');
    endText.textContent = 'Hasta';
    const endInput = document.createElement('input');
    endInput.type = 'time';
    endInput.value = '08:00';
    endLabel.append(endText, endInput);

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'button button-secondary';
    saveButton.textContent = 'Guardar horario';

    const feedback = document.createElement('small');
    feedback.className = 'notification-runtime-feedback';
    feedback.setAttribute('aria-live', 'polite');

    saveButton.addEventListener('click', () =>
      void saveQuietHours(root, card as HTMLElement, startInput, endInput, saveButton, feedback),
    );

    grid.append(startLabel, endLabel, saveButton);
    card.append(header, grid, feedback);
    settingList.insertAdjacentElement('beforebegin', card);
    void hydrateQuietHourControls(root, card, startInput, endInput, feedback);
  } else {
    const start = card.dataset.currentStart;
    const end = card.dataset.currentEnd;
    if (start && end) updateRenderedQuietHourLabels(root, start, end);
  }
}

let scheduled = false;
function scheduleEnhancement() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceNotificationSettings();
  });
}

export function installNotificationSettingsRuntime() {
  if (document.documentElement.dataset.notificationSettingsRuntime === 'true') return;
  document.documentElement.dataset.notificationSettingsRuntime = 'true';
  new MutationObserver(scheduleEnhancement).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', scheduleEnhancement);
  scheduleEnhancement();
}
