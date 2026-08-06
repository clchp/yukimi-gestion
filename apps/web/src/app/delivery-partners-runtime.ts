import type { DeliveryPartner, DeliveryPartnerType } from '@yukimi/shared';
import {
  createDeliveryPartner,
  getDeliveryPartners,
  updateDeliveryPartner,
} from '../features/deliveries/deliveries-api';

type PartnerCallback = (partner: DeliveryPartner) => void;

const quickPartners = new Map<string, DeliveryPartner>();
let settingsPartnersLoading = false;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function showNotice(message: string, tone: 'success' | 'error' = 'success') {
  document.querySelector('.final-runtime-notice')?.remove();
  const notice = node('div', `final-runtime-notice ${tone}`, message);
  notice.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 5200);
}

function closePartnerModal() {
  document.querySelector('.final-partner-modal-backdrop')?.remove();
}

function partnerRequest(existing: DeliveryPartner | undefined, type: DeliveryPartnerType, form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    id: existing?.id,
    partnerTypeCode: type,
    legalName: String(data.get('legalName') ?? '').trim(),
    tradeName: String(data.get('tradeName') ?? '').trim() || null,
    contactName: String(data.get('contactName') ?? '').trim() || null,
    phone: String(data.get('phone') ?? '').trim() || null,
    email: String(data.get('email') ?? '').trim() || null,
    notes: String(data.get('notes') ?? '').trim() || null,
    isActive: existing?.isActive ?? true,
    version: existing?.version,
    reason: String(data.get('reason') ?? '').trim(),
  };
}

function openPartnerModal(
  type: DeliveryPartnerType,
  existing?: DeliveryPartner,
  callback?: PartnerCallback,
) {
  closePartnerModal();
  const backdrop = node('div', 'app-modal-backdrop final-partner-modal-backdrop');
  const form = node('form', 'app-modal-card final-partner-modal');
  const header = node('header', 'app-modal-header');
  const title = node('div');
  title.append(
    node('span', 'eyebrow', existing ? 'Editar operador' : 'Nuevo operador'),
    node('h2', '', type === 'AGENCY' ? 'Agencia de entrega' : 'Courier o motorizado'),
    node('p', '', 'Este registro aparecerá en el selector de las entregas.'),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  close.addEventListener('click', closePartnerModal);
  header.append(title, close);

  const error = node('div', 'alert alert-error final-partner-error');
  error.hidden = true;
  const grid = node('div', 'form-grid form-grid-2');
  const fields = [
    ['legalName', 'Nombre *', existing?.legalName ?? existing?.name ?? '', 'text'],
    ['tradeName', 'Nombre comercial', existing?.tradeName ?? '', 'text'],
    ['contactName', 'Persona de contacto', existing?.contactName ?? '', 'text'],
    ['phone', 'Teléfono', existing?.phone ?? '', 'tel'],
    ['email', 'Correo', existing?.email ?? '', 'email'],
  ] as const;
  fields.forEach(([name, labelText, value, typeName]) => {
    const label = node('label', 'field');
    label.append(node('span', '', labelText));
    const input = node('input');
    input.name = name;
    input.type = typeName;
    input.value = value;
    label.append(input);
    grid.append(label);
  });
  const notesLabel = node('label', 'field field-span-2');
  notesLabel.append(node('span', '', 'Notas'));
  const notes = node('textarea');
  notes.name = 'notes';
  notes.rows = 3;
  notes.value = existing?.notes ?? '';
  notesLabel.append(notes);
  const reasonLabel = node('label', 'field field-span-2');
  reasonLabel.append(node('span', '', 'Motivo *'));
  const reason = node('textarea');
  reason.name = 'reason';
  reason.rows = 3;
  reason.placeholder = existing
    ? 'Explica por qué modificas este operador…'
    : 'Registro de operador de entrega…';
  reasonLabel.append(reason);
  grid.append(notesLabel, reasonLabel);

  const footer = node('footer', 'app-modal-actions');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  cancel.addEventListener('click', closePartnerModal);
  const save = node(
    'button',
    'button button-primary',
    existing ? 'Guardar cambios' : 'Crear operador',
  );
  save.type = 'submit';
  footer.append(cancel, save);
  form.append(header, error, grid, footer);
  backdrop.append(form);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closePartnerModal();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = partnerRequest(existing, type, form);
    if (input.legalName.length < 2 || input.reason.length < 5) {
      error.hidden = false;
      error.textContent = 'Completa el nombre y escribe un motivo de al menos 5 caracteres.';
      return;
    }
    save.disabled = true;
    save.textContent = 'Guardando…';
    const request = existing
      ? updateDeliveryPartner(existing.id, input)
      : createDeliveryPartner(input);
    void request
      .then((partner) => {
        quickPartners.set(partner.id, partner);
        closePartnerModal();
        showNotice(`${partner.name} quedó disponible para las entregas.`);
        callback?.(partner);
        void renderSettingsPartners();
      })
      .catch((requestError: unknown) => {
        error.hidden = false;
        error.textContent =
          requestError instanceof Error ? requestError.message : 'No se pudo guardar el operador.';
        save.disabled = false;
        save.textContent = existing ? 'Guardar cambios' : 'Crear operador';
      });
  });
  document.body.append(backdrop);
}

function openPartnerStatusModal(partner: DeliveryPartner) {
  closePartnerModal();
  const nextActive = !partner.isActive;
  const action = nextActive ? 'reactivar' : 'desactivar';
  const backdrop = node('div', 'app-modal-backdrop final-partner-modal-backdrop');
  const form = node('form', 'app-modal-card final-partner-modal final-partner-status-modal');
  const header = node('header', 'app-modal-header');
  const title = node('div');
  title.append(
    node('span', 'eyebrow', 'Cambio sensible'),
    node('h2', '', `${nextActive ? 'Reactivar' : 'Desactivar'} operador`),
    node(
      'p',
      '',
      nextActive
        ? `${partner.name} volverá a aparecer en las entregas nuevas.`
        : `${partner.name} dejará de aparecer en las entregas nuevas; el historial se conserva.`,
    ),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  close.addEventListener('click', closePartnerModal);
  header.append(title, close);
  const error = node('div', 'alert alert-error final-partner-error');
  error.hidden = true;
  const label = node('label', 'field final-partner-status-reason');
  label.append(node('span', '', 'Motivo *'));
  const reason = node('textarea');
  reason.rows = 4;
  reason.placeholder = `Explica por qué vas a ${action} este operador…`;
  label.append(reason);
  const footer = node('footer', 'app-modal-actions');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  cancel.addEventListener('click', closePartnerModal);
  const confirm = node(
    'button',
    nextActive ? 'button button-primary' : 'button button-danger',
    nextActive ? 'Reactivar' : 'Desactivar',
  );
  confirm.type = 'submit';
  footer.append(cancel, confirm);
  form.append(header, error, label, footer);
  backdrop.append(form);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closePartnerModal();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const auditReason = reason.value.trim();
    if (auditReason.length < 5) {
      error.hidden = false;
      error.textContent = 'Escribe un motivo de al menos 5 caracteres.';
      return;
    }
    confirm.disabled = true;
    confirm.textContent = 'Guardando…';
    void updateDeliveryPartner(partner.id, {
      id: partner.id,
      partnerTypeCode: partner.partnerTypeCode,
      legalName: partner.legalName,
      tradeName: partner.tradeName,
      contactName: partner.contactName,
      phone: partner.phone,
      email: partner.email,
      notes: partner.notes,
      isActive: nextActive,
      version: partner.version,
      reason: auditReason,
    })
      .then(() => {
        closePartnerModal();
        showNotice(`Operador ${nextActive ? 'reactivado' : 'desactivado'} correctamente.`);
        void renderSettingsPartners();
      })
      .catch((requestError: unknown) => {
        error.hidden = false;
        error.textContent =
          requestError instanceof Error ? requestError.message : 'No se pudo actualizar el operador.';
        confirm.disabled = false;
        confirm.textContent = nextActive ? 'Reactivar' : 'Desactivar';
      });
  });
  document.body.append(backdrop);
}

function enhanceDeliveryQuickCreate() {
  if (!/^\/entregas\/(nueva|[0-9a-f-]+\/editar)$/i.test(location.pathname)) return;
  const field = [...document.querySelectorAll<HTMLElement>('.field')].find((candidate) => {
    const text = candidate.querySelector(':scope > span')?.textContent?.trim() ?? '';
    return text.startsWith('Agencia') || text.startsWith('Courier o motorizado');
  });
  if (!field) return;
  const select = field.querySelector<HTMLSelectElement>('select');
  const label = field.querySelector<HTMLElement>(':scope > span');
  if (!select || !label) return;
  quickPartners.forEach((partner) => {
    const matches = label.textContent?.startsWith('Agencia')
      ? partner.partnerTypeCode === 'AGENCY'
      : partner.partnerTypeCode === 'COURIER';
    if (matches && !select.querySelector(`option[value="${partner.id}"]`)) {
      select.append(new Option(partner.name, partner.id));
    }
  });
  if (field.querySelector('.final-quick-partner-button')) return;
  const title = node('div', 'delivery-field-title final-operator-field-title');
  label.replaceWith(title);
  title.append(label);
  const add = node('button', 'delivery-add-address-button final-quick-partner-button', '+ Crear');
  add.type = 'button';
  add.addEventListener('click', () => {
    const type: DeliveryPartnerType = label.textContent?.startsWith('Agencia')
      ? 'AGENCY'
      : 'COURIER';
    openPartnerModal(type, undefined, (partner) => {
      if (!select.querySelector(`option[value="${partner.id}"]`)) {
        select.append(new Option(partner.name, partner.id));
      }
      select.value = partner.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  title.append(add);
}

async function renderSettingsPartners() {
  const panel = document.querySelector<HTMLElement>('.final-delivery-partners-panel');
  if (!panel || settingsPartnersLoading) return;
  settingsPartnersLoading = true;
  panel
    .querySelector('.final-partner-list')
    ?.replaceChildren(node('div', 'empty-state', 'Cargando operadores…'));
  try {
    const response = await getDeliveryPartners();
    const list = panel.querySelector<HTMLElement>('.final-partner-list');
    if (!list) return;
    list.replaceChildren();
    response.items.forEach((partner) => {
      const row = node('div', 'catalog-list-row final-partner-row');
      const text = node('div');
      text.append(
        node('strong', '', partner.name),
        node(
          'small',
          '',
          `${partner.code} · ${partner.partnerTypeCode === 'AGENCY' ? 'Agencia' : 'Courier/motorizado'} · ${partner.phone ?? 'Sin teléfono'}`,
        ),
      );
      const badge = node(
        'span',
        `status-badge ${partner.isActive ? 'status-success' : 'status-neutral'}`,
        partner.isActive ? 'Activo' : 'Inactivo',
      );
      const actions = node('div', 'row-actions');
      const edit = node('button', 'button button-secondary button-compact', 'Editar');
      edit.type = 'button';
      edit.addEventListener('click', () => openPartnerModal(partner.partnerTypeCode, partner));
      const toggle = node(
        'button',
        `button button-compact ${partner.isActive ? 'button-danger' : 'button-secondary'}`,
        partner.isActive ? 'Desactivar' : 'Reactivar',
      );
      toggle.type = 'button';
      toggle.addEventListener('click', () => openPartnerStatusModal(partner));
      actions.append(edit, toggle);
      row.append(text, badge, actions);
      list.append(row);
    });
    if (response.items.length === 0) {
      list.append(node('div', 'empty-state', 'Todavía no hay agencias ni motorizados registrados.'));
    }
  } catch (error) {
    panel
      .querySelector('.final-partner-list')
      ?.replaceChildren(
        node(
          'div',
          'alert alert-error',
          error instanceof Error ? error.message : 'No se pudieron cargar los operadores.',
        ),
      );
  } finally {
    settingsPartnersLoading = false;
  }
}

function enhanceSettingsPartners() {
  if (location.pathname !== '/configuracion') return;
  const main = document.querySelector<HTMLElement>('main.page');
  const nav = main?.querySelector<HTMLElement>('.settings-nav');
  const content = main?.querySelector<HTMLElement>('.settings-content');
  if (!main || !nav || !content) return;
  let panel = content.querySelector<HTMLElement>('.final-delivery-partners-panel');
  if (!panel) {
    panel = node('section', 'panel final-delivery-partners-panel');
    panel.hidden = true;
    const heading = node('div', 'panel-heading');
    const text = node('div');
    text.append(
      node('h2', '', 'Agencias y motorizados'),
      node('p', '', 'Operadores disponibles al preparar una entrega.'),
    );
    const actions = node('div', 'row-actions settings-partner-create-actions');
    const agency = node('button', 'button button-primary', '+ Nueva agencia');
    agency.type = 'button';
    agency.addEventListener('click', () => openPartnerModal('AGENCY'));
    const courier = node('button', 'button button-secondary', '+ Nuevo motorizado');
    courier.type = 'button';
    courier.addEventListener('click', () => openPartnerModal('COURIER'));
    actions.append(agency, courier);
    heading.append(text, actions);
    panel.append(heading, node('div', 'catalog-list final-partner-list'));
    content.append(panel);
  }
  let button = nav.querySelector<HTMLButtonElement>('[data-final-partners-nav]');
  if (!button) {
    button = node('button', '', 'Agencias y motorizados');
    button.type = 'button';
    button.dataset.finalPartnersNav = 'true';
    button.addEventListener('click', () => {
      main.dataset.finalPartnersActive = 'true';
      nav.querySelectorAll('button').forEach((candidate) => candidate.classList.remove('active'));
      button!.classList.add('active');
      [...content.children].forEach((child) => {
        (child as HTMLElement).hidden = child !== panel;
      });
      panel!.hidden = false;
      void renderSettingsPartners();
    });
    nav.append(button);
    nav.addEventListener(
      'click',
      (event) => {
        const clicked = (event.target as HTMLElement).closest('button');
        if (!clicked || clicked === button) return;
        main.dataset.finalPartnersActive = 'false';
        panel!.hidden = true;
        [...content.children].forEach((child) => {
          if (child !== panel) (child as HTMLElement).hidden = false;
        });
      },
      true,
    );
  }
  if (main.dataset.finalPartnersActive === 'true') {
    [...content.children].forEach((child) => {
      (child as HTMLElement).hidden = child !== panel;
    });
    panel.hidden = false;
  }
}

function runDeliveryPartnersRuntime() {
  enhanceDeliveryQuickCreate();
  enhanceSettingsPartners();
}

export function installDeliveryPartnersRuntime() {
  if (document.documentElement.dataset.deliveryPartnersRuntime === 'true') return;
  document.documentElement.dataset.deliveryPartnersRuntime = 'true';
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      runDeliveryPartnersRuntime();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
