import type { ImportDniPerson, UpdateImportDniPersonInput } from '@yukimi/shared';
import { getImportDniPeople, updateImportDniPerson } from '../features/imports/imports-api';

const NEW_PERSON = '__NEW__';
const editedPeople = new Map<string, ImportDniPerson>();
let peopleRequest: Promise<ImportDniPerson[]> | null = null;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
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

async function loadPeople() {
  peopleRequest ??= getImportDniPeople().then((response) => response.items);
  const people = await peopleRequest;
  return people.map((person) => editedPeople.get(person.id) ?? person);
}

function setPersonSummary(summary: HTMLElement, person: ImportDniPerson) {
  const strong = summary.querySelector('strong');
  const spans = summary.querySelectorAll('span');
  if (strong) strong.textContent = person.fullName;
  if (spans[0]) spans[0].textContent = `DNI ${maskDni(person.documentNumber)}`;
  if (spans[1]) spans[1].textContent = `${person.address} · C.P. ${person.postalCode}`;
  if (spans[2]) {
    spans[2].textContent = `${usd(person.accumulatedUsd)} acumulados · ${person.usageCount} ${person.usageCount === 1 ? 'uso' : 'usos'}`;
  }
}

function personField(labelText: string, value: string, numeric = false) {
  const field = node('label', 'field');
  field.append(node('span', '', `${labelText} *`));
  const input = node('input');
  input.type = 'text';
  input.value = value;
  if (numeric) {
    input.inputMode = 'numeric';
    input.maxLength = 8;
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 8);
    });
  }
  field.append(input);
  return { field, input };
}

function openPersonEditor(person: ImportDniPerson, onSaved: (person: ImportDniPerson) => void) {
  const backdrop = node('div', 'app-modal-backdrop import-dni-modal-backdrop');
  const card = node('section', 'app-modal-card modal-card-wide import-dni-modal import-dni-edit-modal');
  const header = node('header', 'app-modal-header');
  const title = node('div');
  title.append(
    node('span', 'eyebrow', 'Persona asociada'),
    node('h2', '', 'Editar datos de la persona'),
    node('p', '', 'Los cambios se guardarán para las próximas importaciones que usen este DNI.'),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  header.append(title, close);

  const form = node('form', 'import-dni-form import-dni-edit-form');
  const error = node('div', 'form-error-summary import-dni-form-error');
  error.hidden = true;

  const name = personField('Nombre completo', person.fullName);
  const dni = personField('DNI', person.documentNumber, true);
  const address = personField('Dirección', person.address);
  const postal = personField('Código postal', person.postalCode);

  const actions = node('div', 'app-modal-actions field-span-2');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  const save = node('button', 'button button-primary', 'Guardar cambios');
  save.type = 'submit';
  actions.append(cancel, save);

  form.append(error, name.field, dni.field, address.field, postal.field, actions);
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
      editedPeople.set(updated.id, updated);
      onSaved(updated);
      dismiss();
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : 'No se pudieron guardar los cambios.';
      error.hidden = false;
      save.disabled = false;
      save.textContent = 'Guardar cambios';
    }
  });
}

async function patchRegistrationPersonEditor() {
  const modal = document.querySelector<HTMLElement>('.import-dni-modal:not(.import-dni-edit-modal)');
  if (!modal) return;
  const summary = modal.querySelector<HTMLElement>('.import-dni-person-summary:not([hidden])');
  const select = modal.querySelector<HTMLSelectElement>('.import-dni-form select');
  if (!summary || !select || !select.value || select.value === NEW_PERSON) return;

  const person = (await loadPeople()).find((item) => item.id === select.value);
  if (!person) return;
  setPersonSummary(summary, person);

  if (summary.querySelector('[data-import-dni-edit-person]')) return;
  const edit = node('button', 'button button-secondary button-compact import-dni-edit-person', 'Editar datos');
  edit.type = 'button';
  edit.dataset.importDniEditPerson = person.id;
  edit.addEventListener('click', () => {
    const current = editedPeople.get(person.id) ?? person;
    openPersonEditor(current, (updated) => {
      setPersonSummary(summary, updated);
      const option = select.querySelector<HTMLOptionElement>(`option[value="${updated.id}"]`);
      if (option) {
        option.textContent = `${updated.fullName} · DNI ${maskDni(updated.documentNumber)} · ${usd(updated.accumulatedUsd)}`;
      }
    });
  });
  summary.append(edit);
}

async function patchDetailPersonEditors() {
  const importId = location.pathname.match(/^\/importaciones\/([0-9a-f-]{36})$/i)?.[1];
  if (!importId) return;
  const rows = [...document.querySelectorAll<HTMLElement>('.import-dni-detail-usage')];
  if (rows.length === 0) return;
  const people = await loadPeople();

  for (const row of rows) {
    if (row.querySelector('[data-import-dni-edit-person]')) continue;
    const name = row.querySelector('strong')?.textContent?.trim();
    const person = people.find((item) => item.fullName === name);
    if (!person) continue;

    const identity = row.firstElementChild as HTMLElement | null;
    if (!identity) continue;
    const edit = node('button', 'button button-secondary button-compact import-dni-edit-person', 'Editar persona');
    edit.type = 'button';
    edit.dataset.importDniEditPerson = person.id;
    edit.addEventListener('click', () => {
      const current = editedPeople.get(person.id) ?? person;
      openPersonEditor(current, (updated) => {
        const strong = identity.querySelector('strong');
        const span = identity.querySelector('span');
        if (strong) strong.textContent = updated.fullName;
        if (span) span.textContent = `DNI ${maskDni(updated.documentNumber)}`;
      });
    });
    identity.append(edit);
  }
}

function patchPurchaseCopy() {
  for (const preview of document.querySelectorAll<HTMLElement>('.import-dni-purchase-preview span')) {
    const text = preview.textContent?.trim() ?? '';
    if (text.startsWith('Compra detectada en')) {
      preview.textContent = `${text.replace('Compra detectada', 'Compra base detectada')} · sin gastos adicionales`;
    }
  }

  const modal = document.querySelector<HTMLElement>('.import-dni-modal:not(.import-dni-edit-modal)');
  if (!modal) return;
  for (const field of modal.querySelectorAll<HTMLLabelElement>('label.field')) {
    const label = field.querySelector('span')?.textContent?.trim() ?? '';
    if (!label.startsWith('Monto de compra asociado')) continue;
    const help = field.querySelector('small');
    if (help) {
      help.textContent = 'Solo corresponde al valor de los productos. No incluye flete, comisiones ni otros gastos adicionales.';
    }
  }
  const equivalentLabel = modal.querySelector<HTMLElement>('.import-dni-equivalent span');
  if (equivalentLabel) equivalentLabel.textContent = 'Equivalente del monto de compra para control por DNI';
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    patchPurchaseCopy();
    void patchRegistrationPersonEditor();
    void patchDetailPersonEditors();
  });
}

export function installImportDniFinalAdjustments() {
  if (document.documentElement.dataset.importDniFinalAdjustments === 'true') return;
  document.documentElement.dataset.importDniFinalAdjustments = 'true';
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
