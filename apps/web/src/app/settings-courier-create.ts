import { createDeliveryPartner } from '../features/deliveries/deliveries-api';

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

function closeModal() {
  document.querySelector('.settings-courier-modal-backdrop')?.remove();
}

function openCourierModal() {
  closeModal();
  const backdrop = node('div', 'app-modal-backdrop settings-courier-modal-backdrop');
  const form = node('form', 'app-modal-card final-partner-modal');
  const header = node('header', 'app-modal-header');
  const title = node('div');
  title.append(
    node('span', 'eyebrow', 'Nuevo operador'),
    node('h2', '', 'Courier o motorizado'),
    node('p', '', 'Aparecerá al seleccionar el método Motorizado en una entrega.'),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  close.addEventListener('click', closeModal);
  header.append(title, close);

  const error = node('div', 'alert alert-error final-partner-error');
  error.hidden = true;
  const grid = node('div', 'form-grid form-grid-2');
  const definitions = [
    ['legalName', 'Nombre *', 'text'],
    ['tradeName', 'Nombre comercial', 'text'],
    ['contactName', 'Persona de contacto', 'text'],
    ['phone', 'Teléfono', 'tel'],
    ['email', 'Correo', 'email'],
  ] as const;
  definitions.forEach(([name, labelText, type]) => {
    const label = node('label', 'field');
    label.append(node('span', '', labelText));
    const input = node('input');
    input.name = name;
    input.type = type;
    label.append(input);
    grid.append(label);
  });
  const notesLabel = node('label', 'field field-span-2');
  notesLabel.append(node('span', '', 'Notas'));
  const notes = node('textarea');
  notes.name = 'notes';
  notes.rows = 3;
  notesLabel.append(notes);
  const reasonLabel = node('label', 'field field-span-2');
  reasonLabel.append(node('span', '', 'Motivo *'));
  const reason = node('textarea');
  reason.name = 'reason';
  reason.rows = 3;
  reason.placeholder = 'Registro de operador para entregas locales…';
  reasonLabel.append(reason);
  grid.append(notesLabel, reasonLabel);

  const footer = node('footer', 'app-modal-actions');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  cancel.addEventListener('click', closeModal);
  const save = node('button', 'button button-primary', 'Crear motorizado');
  save.type = 'submit';
  footer.append(cancel, save);
  form.append(header, error, grid, footer);
  backdrop.append(form);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeModal();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const legalName = String(data.get('legalName') ?? '').trim();
    const auditReason = String(data.get('reason') ?? '').trim();
    if (legalName.length < 2 || auditReason.length < 5) {
      error.hidden = false;
      error.textContent = 'Completa el nombre y un motivo de al menos 5 caracteres.';
      return;
    }
    save.disabled = true;
    save.textContent = 'Guardando…';
    void createDeliveryPartner({
      partnerTypeCode: 'COURIER',
      legalName,
      tradeName: String(data.get('tradeName') ?? '').trim() || null,
      contactName: String(data.get('contactName') ?? '').trim() || null,
      phone: String(data.get('phone') ?? '').trim() || null,
      email: String(data.get('email') ?? '').trim() || null,
      notes: String(data.get('notes') ?? '').trim() || null,
      isActive: true,
      reason: auditReason,
    })
      .then(() => {
        closeModal();
        const navigation = document.querySelector<HTMLButtonElement>('[data-final-partners-nav]');
        navigation?.click();
      })
      .catch((requestError: unknown) => {
        error.hidden = false;
        error.textContent =
          requestError instanceof Error ? requestError.message : 'No se pudo crear el motorizado.';
        save.disabled = false;
        save.textContent = 'Crear motorizado';
      });
  });

  document.body.append(backdrop);
}

function enhanceSettingsCourierButton() {
  if (location.pathname !== '/configuracion') return;
  const heading = document.querySelector<HTMLElement>(
    '.final-delivery-partners-panel .panel-heading',
  );
  if (!heading) return;
  const agencyButton = [...heading.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes('Nuevo operador'),
  );
  if (agencyButton) agencyButton.textContent = '+ Nueva agencia';
  if (heading.querySelector('.settings-new-courier-button')) return;
  const actions = node('div', 'row-actions settings-partner-create-actions');
  if (agencyButton) {
    agencyButton.replaceWith(actions);
    actions.append(agencyButton);
  } else {
    heading.append(actions);
  }
  const courier = node(
    'button',
    'button button-secondary settings-new-courier-button',
    '+ Nuevo motorizado',
  );
  courier.type = 'button';
  courier.addEventListener('click', openCourierModal);
  actions.append(courier);
}

export function installSettingsCourierCreate() {
  if (document.documentElement.dataset.settingsCourierCreate === 'true') return;
  document.documentElement.dataset.settingsCourierCreate = 'true';
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceSettingsCourierButton();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
