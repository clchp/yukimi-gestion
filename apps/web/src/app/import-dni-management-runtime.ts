import type {
  ImportDetail,
  ImportDniPerson,
  RegisterImportDniUsageInput,
} from '@yukimi/shared';
import {
  getImport,
  getImportDniPeople,
  getImportDniUsages,
  registerImportDniUsage,
} from '../features/imports/imports-api';

const STORAGE_KEY = 'yukimi:import-dni-pending-v1';
const NEW_PERSON = '__NEW__';
const ATTACH_WINDOW_MS = 10 * 60 * 1000;

interface PendingUsage {
  key: string;
  input: RegisterImportDniUsageInput;
  name: string;
  dni: string;
}

interface PendingStore {
  usages: PendingUsage[];
  armedAt: number | undefined;
}

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

function readStore(): PendingStore {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<PendingStore>;
    return {
      usages: Array.isArray(parsed.usages) ? parsed.usages : [],
      armedAt: typeof parsed.armedAt === 'number' ? parsed.armedAt : undefined,
    };
  } catch {
    return { usages: [], armedAt: undefined };
  }
}

function writeStore(store: PendingStore) {
  if (store.usages.length === 0) sessionStorage.removeItem(STORAGE_KEY);
  else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
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

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function searchableCode(root: ParentNode, label: string) {
  const select = [...root.querySelectorAll<HTMLElement>('.searchable-select')].find(
    (item) =>
      item.querySelector('.searchable-select-label')?.textContent?.replace('*', '').trim() === label,
  );
  return (
    select
      ?.querySelector<HTMLElement>('.searchable-select-trigger > span')
      ?.textContent?.split('·')[0]
      ?.trim() ?? ''
  );
}

function fieldInput(root: ParentNode, label: string) {
  return [...root.querySelectorAll<HTMLLabelElement>('label.field')]
    .find((item) => item.querySelector('span')?.textContent?.trim().startsWith(label))
    ?.querySelector<HTMLInputElement>('input');
}

function newImportContext() {
  const currency = searchableCode(document, 'Moneda de compra') || 'PEN';
  const amount = [...document.querySelectorAll<HTMLElement>('.new-import-item-card')].reduce(
    (sum, item) => {
      if (searchableCode(item, 'Moneda') !== currency) return sum;
      const quantity = numberValue(fieldInput(item, 'Cantidad')?.value ?? '0');
      const unitCost = numberValue(fieldInput(item, 'Costo unitario')?.value ?? '0');
      return sum + quantity * unitCost;
    },
    0,
  );
  return { currency, amount };
}

function detailPurchaseAmount(detail: ImportDetail) {
  return detail.boxes.reduce(
    (total, box) =>
      total +
      box.items.reduce(
        (boxTotal, item) =>
          boxTotal +
          (item.originalCurrencyCode === detail.purchaseCurrencyCode
            ? item.expectedQuantity * item.originalUnitCost
            : 0),
        0,
      ),
    0,
  );
}

function showError(message: string) {
  const page = document.querySelector<HTMLElement>('main.page');
  if (!page) return;
  const alert = node('div', 'alert alert-error import-dni-runtime-error', message);
  page.querySelector('.page-header')?.after(alert);
  window.setTimeout(() => alert.remove(), 8000);
}

interface DialogOptions {
  currency: string;
  defaultAmount: number;
  excludedIds: Set<string>;
  onSave: (input: RegisterImportDniUsageInput, person: ImportDniPerson | null) => Promise<void>;
}

async function openDialog(options: DialogOptions) {
  let people: ImportDniPerson[];
  try {
    people = (await getImportDniPeople()).items;
  } catch {
    showError('No se pudieron cargar las personas guardadas para gestión por DNI.');
    return;
  }

  const backdrop = node('div', 'app-modal-backdrop import-dni-modal-backdrop');
  const card = node('section', 'app-modal-card modal-card-wide import-dni-modal');
  const header = node('header', 'app-modal-header');
  const title = node('div');
  title.append(
    node('span', 'eyebrow', 'Gestión de importación'),
    node('h2', '', 'Registrar gestión por DNI'),
    node(
      'p',
      '',
      `La conversión ${options.currency} → USD sirve para controlar lo comprado con el DNI y no reemplaza el tipo de cambio a soles.`,
    ),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  header.append(title, close);

  const form = node('form', 'import-dni-form');
  const error = node('div', 'form-error-summary import-dni-form-error');
  error.hidden = true;

  const personLabel = node('label', 'field field-span-2');
  personLabel.append(node('span', '', 'Persona utilizada *'));
  const personSelect = node('select');
  const createOption = node('option');
  createOption.value = NEW_PERSON;
  createOption.textContent = 'Registrar nueva persona';
  personSelect.append(createOption);
  for (const person of people) {
    const option = node('option');
    option.value = person.id;
    option.disabled = options.excludedIds.has(person.id);
    option.textContent = `${person.fullName} · DNI ${maskDni(person.documentNumber)} · ${usd(person.accumulatedUsd)}`;
    personSelect.append(option);
  }
  personLabel.append(personSelect);

  const personInfo = node('div', 'import-dni-person-summary field-span-2');
  const newPerson = node('div', 'import-dni-new-person field-span-2');
  const newFields = [
    ['Nombre completo *', 'text'],
    ['DNI *', 'text'],
    ['Dirección *', 'text'],
    ['Código postal *', 'text'],
  ] as const;
  const inputs = newFields.map(([label, type]) => {
    const field = node('label', 'field');
    field.append(node('span', '', label));
    const input = node('input');
    input.type = type;
    if (label === 'DNI *') {
      input.inputMode = 'numeric';
      input.maxLength = 8;
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 8);
      });
    }
    field.append(input);
    newPerson.append(field);
    return input;
  });
  const [nameInput, dniInput, addressInput, postalInput] = inputs;
  if (!nameInput || !dniInput || !addressInput || !postalInput) return;

  const amountLabel = node('label', 'field');
  amountLabel.append(node('span', '', `Monto de compra asociado (${options.currency}) *`));
  const amountInput = node('input');
  amountInput.type = 'number';
  amountInput.min = '0.0001';
  amountInput.step = '0.0001';
  amountInput.value = options.defaultAmount > 0 ? String(options.defaultAmount) : '';
  amountLabel.append(
    amountInput,
    node('small', '', 'Puedes cambiarlo si la compra se repartió entre varios DNI.'),
  );

  const rateLabel = node('label', 'field');
  rateLabel.append(node('span', '', `Tipo de cambio ${options.currency} → USD *`));
  const rateInput = node('input');
  rateInput.type = 'number';
  rateInput.min = '0.00000001';
  rateInput.step = '0.00000001';
  rateInput.value = options.currency === 'USD' ? '1' : '';
  rateInput.disabled = options.currency === 'USD';
  rateLabel.append(rateInput);

  const equivalent = node('div', 'import-dni-equivalent field-span-2');
  const equivalentValue = node('strong', '', usd(0));
  equivalent.append(node('span', '', 'Equivalente para control por DNI'), equivalentValue);

  const feeLabel = node('label', 'field field-span-2');
  feeLabel.append(node('span', '', 'Costo de gestión (PEN) *'));
  const feeInput = node('input');
  feeInput.type = 'number';
  feeInput.min = '0';
  feeInput.step = '0.01';
  feeInput.value = '30';
  feeLabel.append(
    feeInput,
    node('small', '', 'Se propone S/ 30.00 automáticamente, pero el importe queda editable.'),
  );

  const actions = node('div', 'app-modal-actions field-span-2');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  const save = node('button', 'button button-primary', 'Registrar gestión por DNI');
  save.type = 'submit';
  actions.append(cancel, save);
  form.append(
    error,
    personLabel,
    personInfo,
    newPerson,
    amountLabel,
    rateLabel,
    equivalent,
    feeLabel,
    actions,
  );
  card.append(header, form);
  backdrop.append(card);
  document.body.append(backdrop);

  const selectedPerson = () => people.find((person) => person.id === personSelect.value) ?? null;
  const dismiss = () => backdrop.remove();
  const refresh = () => {
    const person = selectedPerson();
    const isNew = personSelect.value === NEW_PERSON;
    newPerson.hidden = !isNew;
    personInfo.hidden = isNew;
    personInfo.replaceChildren();
    if (person) {
      personInfo.append(
        node('strong', '', person.fullName),
        node('span', '', `DNI ${maskDni(person.documentNumber)}`),
        node('span', '', `${person.address} · C.P. ${person.postalCode}`),
        node(
          'span',
          '',
          `${usd(person.accumulatedUsd)} acumulados · ${person.usageCount} ${person.usageCount === 1 ? 'uso' : 'usos'}`,
        ),
      );
    }
    const rate = options.currency === 'USD' ? 1 : numberValue(rateInput.value);
    equivalentValue.textContent = usd(numberValue(amountInput.value) * rate);
  };

  close.addEventListener('click', dismiss);
  cancel.addEventListener('click', dismiss);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) dismiss();
  });
  personSelect.addEventListener('change', refresh);
  amountInput.addEventListener('input', refresh);
  rateInput.addEventListener('input', refresh);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const person = selectedPerson();
    const isNew = personSelect.value === NEW_PERSON;
    const amount = numberValue(amountInput.value);
    const rate = options.currency === 'USD' ? 1 : numberValue(rateInput.value);
    const fee = numberValue(feeInput.value);
    const problems: string[] = [];
    if (isNew) {
      if (nameInput.value.trim().length < 3) problems.push('Ingresa el nombre completo.');
      if (!/^\d{8}$/.test(dniInput.value)) problems.push('El DNI debe tener 8 dígitos.');
      if (addressInput.value.trim().length < 3) problems.push('Ingresa la dirección.');
      if (postalInput.value.trim().length < 3) problems.push('Ingresa el código postal.');
      if (people.some((item) => item.documentNumber === dniInput.value)) {
        problems.push('Ese DNI ya está guardado. Selecciónalo desde la lista.');
      }
    } else if (!person) problems.push('Selecciona una persona.');
    if (amount <= 0) problems.push('El monto asociado debe ser mayor que cero.');
    if (rate <= 0) problems.push('Ingresa un tipo de cambio válido hacia USD.');
    if (fee < 0) problems.push('El costo de gestión no puede ser negativo.');
    if (problems.length > 0) {
      error.textContent = problems.join(' ');
      error.hidden = false;
      return;
    }

    const input: RegisterImportDniUsageInput = {
      personId: isNew ? null : person?.id,
      person: isNew
        ? {
            fullName: nameInput.value.trim(),
            documentNumber: dniInput.value,
            address: addressInput.value.trim(),
            postalCode: postalInput.value.trim(),
          }
        : null,
      purchaseAmount: amount,
      exchangeRateToUsd: rate,
      managementFeePen: fee,
    };
    save.disabled = true;
    save.textContent = 'Registrando…';
    try {
      await options.onSave(input, person);
      dismiss();
    } catch (caught) {
      error.textContent = caught instanceof Error ? caught.message : 'No se pudo registrar la gestión.';
      error.hidden = false;
      save.disabled = false;
      save.textContent = 'Registrar gestión por DNI';
    }
  });
  refresh();
}

async function renderNewImport() {
  if (location.pathname !== '/importaciones/nueva') return;
  const main = document.querySelector<HTMLElement>('.new-import-main');
  if (!main) return;
  let panel = main.querySelector<HTMLElement>('.import-dni-new-panel');
  if (!panel) {
    panel = node('section', 'panel import-dni-panel import-dni-new-panel');
    main.querySelector(':scope > .panel')?.after(panel);
  }

  const { currency, amount } = newImportContext();
  const store = readStore();
  const allocated = store.usages.reduce((sum, usage) => sum + usage.input.purchaseAmount, 0);
  const renderSignature = JSON.stringify({
    currency,
    amount,
    usages: store.usages.map((usage) => ({
      key: usage.key,
      personId: usage.input.personId,
      purchaseAmount: usage.input.purchaseAmount,
      exchangeRateToUsd: usage.input.exchangeRateToUsd,
      managementFeePen: usage.input.managementFeePen,
      name: usage.name,
      dni: usage.dni,
    })),
  });
  if (panel.dataset.renderSignature === renderSignature) return;
  panel.dataset.renderSignature = renderSignature;

  panel.replaceChildren();
  const heading = node('div', 'panel-heading');
  const copy = node('div');
  copy.append(
    node('h2', '', 'Gestión por DNI'),
    node('p', '', 'Asocia la persona utilizada y controla en USD el monto comprado con su DNI.'),
  );
  const add = node('button', 'button button-secondary', '+ Registrar gestión por DNI');
  add.type = 'button';
  heading.append(copy, add);
  const preview = node('div', 'import-dni-purchase-preview');
  preview.append(
    node('span', '', `Compra detectada en ${currency}`),
    node('strong', '', money(amount, currency)),
  );
  panel.append(heading, preview);

  if (store.usages.length === 0) {
    panel.append(
      node(
        'p',
        'import-dni-empty',
        'No hay una persona asociada todavía. El costo de gestión se propondrá en S/ 30.00 y podrás editarlo.',
      ),
    );
  } else {
    const list = node('div', 'import-dni-usage-list');
    for (const usage of store.usages) {
      const row = node('div', 'import-dni-usage-row');
      const copyRow = node('div');
      copyRow.append(
        node('strong', '', usage.name),
        node(
          'small',
          '',
          `DNI ${maskDni(usage.dni)} · ${money(usage.input.purchaseAmount, currency)} → ${usd(usage.input.purchaseAmount * usage.input.exchangeRateToUsd)} · Gestión S/ ${usage.input.managementFeePen.toFixed(2)}`,
        ),
      );
      const remove = node('button', 'button button-secondary button-compact', 'Quitar');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        const current = readStore();
        writeStore({
          usages: current.usages.filter((item) => item.key !== usage.key),
          armedAt: undefined,
        });
        void renderNewImport();
      });
      row.append(copyRow, remove);
      list.append(row);
    }
    panel.append(list);
  }

  add.addEventListener('click', () => {
    const current = readStore();
    const excluded = new Set(
      current.usages.map((usage) => usage.input.personId).filter((id): id is string => Boolean(id)),
    );
    void openDialog({
      currency,
      defaultAmount: Math.max(0, amount - allocated) || amount,
      excludedIds: excluded,
      onSave: async (input, person) => {
        const dni = input.person?.documentNumber ?? person?.documentNumber ?? '';
        const latest = readStore();
        if (
          latest.usages.some(
            (usage) =>
              (input.personId && usage.input.personId === input.personId) ||
              (dni && usage.dni === dni),
          )
        ) {
          throw new Error('Esta persona ya está asociada a la importación pendiente.');
        }
        writeStore({
          usages: [
            ...latest.usages,
            {
              key: crypto.randomUUID(),
              input,
              name: input.person?.fullName ?? person?.fullName ?? 'Persona',
              dni,
            },
          ],
          armedAt: undefined,
        });
        await renderNewImport();
      },
    });
  });
}

function detailId() {
  return location.pathname.match(/^\/importaciones\/([0-9a-f-]{36})$/i)?.[1] ?? null;
}

async function attachPending(importId: string) {
  const store = readStore();
  if (
    store.usages.length === 0 ||
    !store.armedAt ||
    Date.now() - store.armedAt > ATTACH_WINDOW_MS
  ) {
    return false;
  }
  const existing = (await getImportDniUsages(importId)).items;
  const failed: PendingUsage[] = [];
  let changed = false;
  for (const pending of store.usages) {
    const duplicate = existing.some(
      (usage) =>
        (pending.input.personId && usage.personId === pending.input.personId) ||
        (pending.dni && usage.documentNumber === pending.dni),
    );
    if (duplicate) continue;
    try {
      await registerImportDniUsage(importId, pending.input);
      changed = true;
    } catch {
      failed.push(pending);
    }
  }
  if (failed.length > 0) {
    writeStore({ usages: failed, armedAt: undefined });
    showError(
      'La importación se creó, pero una gestión por DNI quedó pendiente. Regístrala nuevamente desde este detalle.',
    );
    return false;
  }
  sessionStorage.removeItem(STORAGE_KEY);
  if (changed) window.location.reload();
  return changed;
}

async function renderDetail() {
  const importId = detailId();
  if (!importId) return;
  const column = document.querySelector<HTMLElement>('.import-actions-column');
  if (!column) return;
  if (await attachPending(importId)) return;

  let panel = column.querySelector<HTMLElement>('.import-dni-detail-panel');
  if (!panel) {
    panel = node('section', 'panel import-dni-panel import-dni-detail-panel');
    const dataPanel = [...column.querySelectorAll<HTMLElement>(':scope > .panel')].find((item) =>
      item.querySelector('h2')?.textContent?.includes('Datos generales'),
    );
    if (dataPanel) dataPanel.after(panel);
    else column.append(panel);
  }
  if (panel.dataset.loading === 'true') return;
  panel.dataset.loading = 'true';

  try {
    const [detail, usageResponse] = await Promise.all([
      getImport(importId),
      getImportDniUsages(importId),
    ]);
    const usages = usageResponse.items;
    const total = detailPurchaseAmount(detail);
    const remaining = Math.max(
      0,
      total - usages.reduce((sum, usage) => sum + usage.purchaseAmount, 0),
    );
    panel.replaceChildren();
    const heading = node('div', 'panel-heading');
    const copy = node('div');
    copy.append(
      node('h2', '', 'Gestión por DNI'),
      node('p', '', 'Personas asociadas a esta importación y acumulado histórico en USD.'),
    );
    const add = node(
      'button',
      'button button-secondary button-compact',
      usages.length === 0 ? '+ Registrar gestión por DNI' : '+ Agregar otra persona',
    );
    add.type = 'button';
    heading.append(copy, add);
    panel.append(heading);

    if (usages.length === 0) {
      panel.append(
        node('p', 'import-dni-empty', 'Todavía no hay una persona asociada a esta importación.'),
      );
    } else {
      const list = node('div', 'import-dni-usage-list');
      for (const usage of usages) {
        const row = node('div', 'import-dni-detail-usage');
        const identity = node('div');
        identity.append(
          node('strong', '', usage.fullName),
          node('span', '', `DNI ${maskDni(usage.documentNumber)}`),
        );
        const amounts = node('div', 'import-dni-detail-amounts');
        amounts.append(
          node(
            'span',
            '',
            `${money(usage.purchaseAmount, usage.sourceCurrencyCode)} → ${usd(usage.equivalentUsd)}`,
          ),
          node('span', '', `TC ${usage.sourceCurrencyCode} → USD: ${usage.exchangeRateToUsd}`),
          node('span', '', `Costo de gestión: S/ ${usage.managementFeePen.toFixed(2)}`),
          node('strong', '', `Acumulado histórico: ${usd(usage.personAccumulatedUsd)}`),
        );
        row.append(identity, amounts);
        list.append(row);
      }
      panel.append(list);
    }

    add.addEventListener('click', () => {
      void openDialog({
        currency: detail.purchaseCurrencyCode,
        defaultAmount: remaining || total,
        excludedIds: new Set(usages.map((usage) => usage.personId)),
        onSave: async (input) => {
          await registerImportDniUsage(importId, input);
          window.location.reload();
        },
      });
    });
  } catch (caught) {
    panel.replaceChildren(
      node(
        'div',
        'empty-state',
        caught instanceof Error ? caught.message : 'No se pudo cargar la gestión por DNI.',
      ),
    );
  } finally {
    panel.dataset.loading = 'false';
  }
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    if (location.pathname === '/importaciones/nueva') void renderNewImport();
    else if (detailId()) void renderDetail();
  });
}

export function installImportDniManagementRuntime() {
  if (document.documentElement.dataset.importDniManagementRuntime === 'true') return;
  document.documentElement.dataset.importDniManagementRuntime = 'true';
  document.addEventListener(
    'submit',
    (event) => {
      if (location.pathname !== '/importaciones/nueva') return;
      if (!(event.target as HTMLElement).closest('form.new-import-layout')) return;
      const store = readStore();
      if (store.usages.length > 0) writeStore({ ...store, armedAt: Date.now() });
    },
    true,
  );
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
