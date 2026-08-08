import type { ImportDniPerson, UpdateImportDniPersonInput } from '@yukimi/shared';
import { getImportDniPeople, updateImportDniPerson } from '../features/imports/imports-api';

const NEW_PERSON = '__NEW__';
const edited = new Map<string, ImportDniPerson>();
let peopleRequest: Promise<ImportDniPerson[]> | null = null;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}

function setText(target: Element | null | undefined, text: string) {
  if (target && target.textContent !== text) target.textContent = text;
}

function maskDni(value: string) {
  return value ? `****${value.slice(-4)}` : '—';
}

function usd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function yearHistoryText(person: ImportDniPerson) {
  if (person.yearlyHistory.length === 0) return '';
  return `Historial anual: ${person.yearlyHistory
    .map(
      (item) =>
        `${item.year} — ${usd(item.accumulatedUsd)} · ${item.usageCount} ${item.usageCount === 1 ? 'uso' : 'usos'}`,
    )
    .join(' | ')}`;
}

function updateYearHistory(container: HTMLElement, person: ImportDniPerson) {
  const text = yearHistoryText(person);
  let history = container.querySelector<HTMLElement>('[data-import-dni-year-history]');
  if (!text) {
    history?.remove();
    return;
  }
  if (!history) {
    history = node('span');
    history.dataset.importDniYearHistory = 'true';
    const editButton = container.querySelector('[data-import-dni-edit-person]');
    if (editButton) container.insertBefore(history, editButton);
    else container.append(history);
  }
  setText(history, text);
}

async function people() {
  peopleRequest ??= getImportDniPeople().then((response) => response.items);
  return (await peopleRequest).map((person) => edited.get(person.id) ?? person);
}

function updateSummary(summary: HTMLElement, person: ImportDniPerson) {
  const spans = summary.querySelectorAll('span:not([data-import-dni-year-history])');
  setText(summary.querySelector('strong'), person.fullName);
  setText(spans[0], `DNI ${maskDni(person.documentNumber)}`);
  setText(spans[1], `${person.address} · C.P. ${person.postalCode}`);
  setText(
    spans[2],
    `${usd(person.accumulatedUsd)} acumulados en ${person.accumulationYear} · ${person.usageCount} ${person.usageCount === 1 ? 'uso' : 'usos'}`,
  );
  updateYearHistory(summary, person);
}

function field(label: string, value: string, dni = false) {
  const wrapper = node('label', 'field');
  wrapper.append(node('span', '', `${label} *`));
  const input = node('input');
  input.type = 'text';
  input.value = value;
  if (dni) {
    input.inputMode = 'numeric';
    input.maxLength = 8;
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 8);
    });
  }
  wrapper.append(input);
  return { wrapper, input };
}

function openEditor(person: ImportDniPerson, onSaved: (value: ImportDniPerson) => void) {
  const backdrop = node('div', 'app-modal-backdrop import-dni-modal-backdrop');
  const card = node(
    'section',
    'app-modal-card modal-card-wide import-dni-modal import-dni-edit-modal',
  );
  const header = node('header', 'app-modal-header');
  const title = node('div');
  title.append(
    node('span', 'eyebrow', 'Persona asociada'),
    node('h2', '', 'Editar datos de la persona'),
    node('p', '', 'Los cambios quedarán guardados para las próximas importaciones.'),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  header.append(title, close);

  const form = node('form', 'import-dni-form import-dni-edit-form');
  const error = node('div', 'form-error-summary import-dni-form-error');
  error.hidden = true;
  const name = field('Nombre completo', person.fullName);
  const dni = field('DNI', person.documentNumber, true);
  const address = field('Dirección', person.address);
  const postal = field('Código postal', person.postalCode);
  const actions = node('div', 'app-modal-actions field-span-2');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  const save = node('button', 'button button-primary', 'Guardar cambios');
  save.type = 'submit';
  actions.append(cancel, save);
  form.append(error, name.wrapper, dni.wrapper, address.wrapper, postal.wrapper, actions);
  card.append(header, form);
  backdrop.append(card);
  document.body.append(backdrop);

  const dismiss = () => backdrop.remove();
  close.addEventListener('click', dismiss);
  cancel.addEventListener('click', dismiss);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) dismiss();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const input: UpdateImportDniPersonInput = {
      fullName: name.input.value.trim(),
      documentNumber: dni.input.value,
      address: address.input.value.trim(),
      postalCode: postal.input.value.trim(),
    };
    const problems: string[] = [];
    if (input.fullName.length < 3) problems.push('Ingresa el nombre completo.');
    if (!/^\d{8}$/.test(input.documentNumber)) problems.push('El DNI debe tener 8 dígitos.');
    if (input.address.length < 3) problems.push('Ingresa la dirección.');
    if (input.postalCode.length < 3) problems.push('Ingresa el código postal.');
    if (problems.length > 0) {
      error.textContent = problems.join(' ');
      error.hidden = false;
      return;
    }
    save.disabled = true;
    save.textContent = 'Guardando…';
    try {
      const updated = await updateImportDniPerson(person.id, input);
      edited.set(updated.id, updated);
      onSaved(updated);
      dismiss();
    } catch (caught) {
      error.textContent =
        caught instanceof Error ? caught.message : 'No se pudieron guardar los cambios.';
      error.hidden = false;
      save.disabled = false;
      save.textContent = 'Guardar cambios';
    }
  });
}

async function patchRegistrationModal() {
  const modal = document.querySelector<HTMLElement>(
    '.import-dni-modal:not(.import-dni-edit-modal)',
  );
  const summary = modal?.querySelector<HTMLElement>('.import-dni-person-summary:not([hidden])');
  const select = modal?.querySelector<HTMLSelectElement>('.import-dni-form select');
  if (!summary || !select || !select.value || select.value === NEW_PERSON) return;
  const person = (await people()).find((item) => item.id === select.value);
  if (!person) return;
  updateSummary(summary, person);
  setText(
    select.selectedOptions[0],
    `${person.fullName} · DNI ${maskDni(person.documentNumber)} · ${person.accumulationYear} ${usd(person.accumulatedUsd)}`,
  );
  if (summary.querySelector('[data-import-dni-edit-person]')) return;
  const button = node(
    'button',
    'button button-secondary button-compact import-dni-edit-person',
    'Editar datos',
  );
  button.type = 'button';
  button.dataset.importDniEditPerson = person.id;
  button.addEventListener('click', () => {
    openEditor(edited.get(person.id) ?? person, (updated) => {
      updateSummary(summary, updated);
      const option = select.querySelector<HTMLOptionElement>(`option[value="${updated.id}"]`);
      setText(
        option,
        `${updated.fullName} · DNI ${maskDni(updated.documentNumber)} · ${updated.accumulationYear} ${usd(updated.accumulatedUsd)}`,
      );
    });
  });
  summary.append(button);
}

async function patchDetail() {
  if (!/^\/importaciones\/[0-9a-f-]{36}$/i.test(location.pathname)) return;
  const allPeople = await people();
  for (const row of document.querySelectorAll<HTMLElement>('.import-dni-detail-usage')) {
    const name = row.querySelector('strong')?.textContent?.trim() ?? '';
    const masked = row.querySelector('span')?.textContent?.trim() ?? '';
    const person = allPeople.find(
      (item) => item.fullName === name && masked.includes(maskDni(item.documentNumber)),
    );
    if (!person) continue;

    const amounts = row.querySelector<HTMLElement>('.import-dni-detail-amounts');
    if (amounts) {
      setText(
        amounts.querySelector('strong'),
        `Acumulado ${person.accumulationYear}: ${usd(person.accumulatedUsd)}`,
      );
      updateYearHistory(amounts, person);
    }

    if (row.querySelector('[data-import-dni-edit-person]')) continue;
    const identity = row.firstElementChild;
    if (!(identity instanceof HTMLElement)) continue;
    const button = node(
      'button',
      'button button-secondary button-compact import-dni-edit-person',
      'Editar persona',
    );
    button.type = 'button';
    button.dataset.importDniEditPerson = person.id;
    button.addEventListener('click', () => {
      openEditor(edited.get(person.id) ?? person, (updated) => {
        setText(identity.querySelector('strong'), updated.fullName);
        setText(identity.querySelector('span'), `DNI ${maskDni(updated.documentNumber)}`);
        if (amounts) {
          setText(
            amounts.querySelector('strong'),
            `Acumulado ${updated.accumulationYear}: ${usd(updated.accumulatedUsd)}`,
          );
          updateYearHistory(amounts, updated);
        }
      });
    });
    identity.append(button);
  }
}

function patchCopy() {
  for (const preview of document.querySelectorAll<HTMLElement>(
    '.import-dni-purchase-preview span',
  )) {
    const text = preview.textContent?.trim() ?? '';
    if (text.startsWith('Compra detectada en')) {
      preview.textContent = `${text.replace('Compra detectada', 'Compra base detectada')} · sin gastos adicionales`;
    }
  }
  const modal = document.querySelector<HTMLElement>(
    '.import-dni-modal:not(.import-dni-edit-modal)',
  );
  if (!modal) return;
  for (const wrapper of modal.querySelectorAll<HTMLLabelElement>('label.field')) {
    if (!wrapper.querySelector('span')?.textContent?.startsWith('Monto de compra asociado'))
      continue;
    setText(
      wrapper.querySelector('small'),
      'Solo corresponde al valor de los productos. No incluye flete, comisiones ni otros gastos adicionales.',
    );
  }
  setText(
    modal.querySelector('.import-dni-equivalent span'),
    'Equivalente del monto de compra para control por DNI',
  );
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    patchCopy();
    void patchRegistrationModal();
    void patchDetail();
  });
}

export function installImportDniFinalAdjustments() {
  if (document.documentElement.dataset.importDniFinalAdjustments === 'true') return;
  document.documentElement.dataset.importDniFinalAdjustments = 'true';
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
