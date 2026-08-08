import type {
  ImportDetail,
  ImportDniPerson,
  ImportDniUsage,
  RegisterImportDniUsageInput,
} from '@yukimi/shared';
import {
  getImport,
  getImportDniPeople,
  getImportDniUsages,
  registerImportDniUsage,
} from '../features/imports/imports-api';

const STORAGE_KEY = 'yukimi:import-dni-pending-v1';
const NEW_PERSON = '__NEW_PERSON__';
const AUTO_ATTACH_WINDOW_MS = 10 * 60 * 1000;

interface PendingDniUsage {
  key: string;
  input: RegisterImportDniUsageInput;
  displayName: string;
  documentNumber: string;
}

interface PendingDniStore {
  usages: PendingDniUsage[];
  armedAt?: number;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function readPendingStore(): PendingDniStore {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { usages: [] };
    const parsed = JSON.parse(raw) as PendingDniStore;
    return {
      usages: Array.isArray(parsed.usages) ? parsed.usages : [],
      armedAt: typeof parsed.armedAt === 'number' ? parsed.armedAt : undefined,
    };
  } catch {
    return { usages: [] };
  }
}

function writePendingStore(store: PendingDniStore) {
  if (store.usages.length === 0) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function maskDni(value: string) {
  return value.length >= 4 ? `****${value.slice(-4)}` : value;
}

function numberValue(value: string) {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function currencyAmount(value: number, currency: string) {
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

function usd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fieldInput(root: ParentNode, labelText: string) {
  return [...root.querySelectorAll<HTMLLabelElement>('label.field')]
    .find((label) => label.querySelector('span')?.textContent?.trim().startsWith(labelText))
    ?.querySelector<HTMLInputElement>('input');
}

function searchableValue(root: ParentNode, labelText: string) {
  const select = [...root.querySelectorAll<HTMLElement>('.searchable-select')].find(
    (candidate) =>
      candidate.querySelector('.searchable-select-label')?.textContent?.trim().replace(/\s*\*$/, '') ===
      labelText,
  );
  const text = select?.querySelector<HTMLElement>('.searchable-select-trigger > span')?.textContent?.trim();
  if (!text || text === 'Seleccionar…') return '';
  return text.split('·')[0]?.trim() ?? '';
}

function currentNewImportCurrency() {
  return searchableValue(document, 'Moneda de compra') || 'PEN';
}

function currentNewImportPurchaseAmount(currencyCode: string) {
  return [...document.querySelectorAll<HTMLElement>('.new-import-item-card')].reduce((sum, card) => {
    const itemCurrency = searchableValue(card, 'Moneda');
    if (itemCurrency !== currencyCode) return sum;
    const quantity = numberValue(fieldInput(card, 'Cantidad')?.value ?? '0');
    const cost = numberValue(fieldInput(card, 'Costo unitario')?.value ?? '0');
    return sum + quantity * cost;
  }, 0);
}

function totalDetailPurchaseAmount(detail: ImportDetail) {
  return detail.boxes.reduce(
    (shipmentTotal, box) =>
      shipmentTotal +
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

function maskPendingDocument(input: RegisterImportDniUsageInput, people: ImportDniPerson[]) {
  if (input.person?.documentNumber) return input.person.documentNumber;
  return people.find((person) => person.id === input.personId)?.documentNumber ?? '';
}

function pendingLabel(input: RegisterImportDniUsageInput, people: ImportDniPerson[]) {
  if (input.person?.fullName) return input.person.fullName;
  return people.find((person) => person.id === input.personId)?.fullName ?? 'Persona guardada';
}

function showInlineError(message: string) {
  const page = document.querySelector<HTMLElement>('main.page');
  if (!page) return;
  const existing = page.querySelector<HTMLElement>('.import-dni-runtime-error');
  const alert = existing ?? element('div', 'alert alert-error import-dni-runtime-error');
  alert.textContent = message;
  if (!existing) page.querySelector('.page-header')?.after(alert);
  window.setTimeout(() => alert.remove(), 9000);
}

function renderPersonSummary(container: HTMLElement, person: ImportDniPerson | null) {
  container.replaceChildren();
  if (!person) return;
  const name = element('strong', '', person.fullName);
  const document = element('span', '', `DNI ${maskDni(person.documentNumber)}`);
  const address = element('span', '', `${person.address} · C.P. ${person.postalCode}`);
  const usage = element(
    'span',
    '',
    `${usd(person.accumulatedUsd)} acumulados · ${person.usageCount} ${person.usageCount === 1 ? 'uso' : 'usos'}`,
  );
  container.append(name, document, address, usage);
}

interface DniDialogOptions {
  currencyCode: string;
  defaultPurchaseAmount: number;
  excludedPersonIds?: Set<string>;
  onSave: (input: RegisterImportDniUsageInput, person: ImportDniPerson | null) => Promise<void> | void;
}

async function openDniDialog(options: DniDialogOptions) {
  let people: ImportDniPerson[] = [];
  try {
    people = (await getImportDniPeople()).items;
  } catch {
    showInlineError('No se pudieron cargar las personas guardadas para gestión por DNI.');
    return;
  }

  const backdrop = element('div', 'app-modal-backdrop import-dni-modal-backdrop');
  const card = element('section', 'app-modal-card modal-card-wide import-dni-modal');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');

  const header = element('header', 'app-modal-header');
  const headerCopy = element('div');
  headerCopy.append(
    element('span', 'eyebrow', 'Gestión de importación'),
    element('h2', '', 'Registrar gestión por DNI'),
    element(
      'p',
      '',
      `Asocia la compra en ${options.currencyCode} a una persona y conviértela a USD para su seguimiento.`,
    ),
  );
  const close = element('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  header.append(headerCopy, close);

  const form = element('form', 'import-dni-form');
  const errors = element('div', 'form-error-summary import-dni-form-error');
  errors.hidden = true;

  const personField = element('label', 'field field-span-2');
  personField.append(element('span', '', 'Persona utilizada *'));
  const personSelect = element('select');
  const newOption = element('option');
  newOption.value = NEW_PERSON;
  newOption.textContent = 'Registrar nueva persona';
  personSelect.append(newOption);
  people.forEach((person) => {
    const option = element('option');
    option.value = person.id;
    option.textContent = `${person.fullName} · DNI ${maskDni(person.documentNumber)} · ${usd(person.accumulatedUsd)}`;
    option.disabled = options.excludedPersonIds?.has(person.id) ?? false;
    personSelect.append(option);
  });
  personField.append(personSelect);

  const personSummary = element('div', 'import-dni-person-summary field-span-2');
  const newPersonFields = element('div', 'import-dni-new-person field-span-2');
  const fullNameLabel = element('label', 'field');
  fullNameLabel.append(element('span', '', 'Nombre completo *'));
  const fullNameInput = element('input');
  fullNameLabel.append(fullNameInput);
  const dniLabel = element('label', 'field');
  dniLabel.append(element('span', '', 'DNI *'));
  const dniInput = element('input');
  dniInput.inputMode = 'numeric';
  dniInput.maxLength = 8;
  dniLabel.append(dniInput);
  const addressLabel = element('label', 'field');
  addressLabel.append(element('span', '', 'Dirección *'));
  const addressInput = element('input');
  addressLabel.append(addressInput);
  const postalLabel = element('label', 'field');
  postalLabel.append(element('span', '', 'Código postal *'));
  const postalInput = element('input');
  postalLabel.append(postalInput);
  newPersonFields.append(fullNameLabel, dniLabel, addressLabel, postalLabel);

  const purchaseLabel = element('label', 'field');
  purchaseLabel.append(element('span', '', `Monto de compra asociado (${options.currencyCode}) *`));
  const purchaseInput = element('input');
  purchaseInput.type = 'number';
  purchaseInput.min = '0.0001';
  purchaseInput.step = '0.0001';
  purchaseInput.value = options.defaultPurchaseAmount > 0 ? String(options.defaultPurchaseAmount) : '';
  purchaseLabel.append(
    purchaseInput,
    element('small', '', 'Puedes ajustar este monto si la compra se repartió entre más de un DNI.'),
  );

  const rateLabel = element('label', 'field');
  rateLabel.append(element('span', '', `Tipo de cambio ${options.currencyCode} → USD *`));
  const rateInput = element('input');
  rateInput.type = 'number';
  rateInput.min = '0.00000001';
  rateInput.step = '0.00000001';
  rateInput.value = options.currencyCode === 'USD' ? '1' : '';
  rateInput.disabled = options.currencyCode === 'USD';
  rateLabel.append(rateInput);
  if (options.currencyCode === 'USD') rateLabel.append(element('small', '', 'En dólares equivale a 1.'));

  const equivalent = element('div', 'import-dni-equivalent field-span-2');
  const equivalentLabel = element('span', '', 'Equivalente para control por DNI');
  const equivalentValue = element('strong', '', usd(0));
  equivalent.append(equivalentLabel, equivalentValue);

  const feeLabel = element('label', 'field field-span-2');
  feeLabel.append(element('span', '', 'Costo de gestión (PEN) *'));
  const feeInput = element('input');
  feeInput.type = 'number';
  feeInput.min = '0';
  feeInput.step = '0.01';
  feeInput.value = '30';
  feeLabel.append(
    feeInput,
    element(
      'small',
      '',
      'Se propone S/ 30.00 automáticamente, pero puedes cambiarlo antes de registrar la gestión.',
    ),
  );

  const actions = element('div', 'app-modal-actions field-span-2');
  const cancel = element('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  const submit = element('button', 'button button-primary', 'Registrar gestión por DNI');
  submit.type = 'submit';
  actions.append(cancel, submit);

  form.append(
    errors,
    personField,
    personSummary,
    newPersonFields,
    purchaseLabel,
    rateLabel,
    equivalent,
    feeLabel,
    actions,
  );
  card.append(header, form);
  backdrop.append(card);
  document.body.append(backdrop);

  function selectedPerson() {
    return people.find((person) => person.id === personSelect.value) ?? null;
  }

  function refreshPersonMode() {
    const person = selectedPerson();
    const isNew = personSelect.value === NEW_PERSON;
    newPersonFields.hidden = !isNew;
    personSummary.hidden = isNew;
    renderPersonSummary(personSummary, person);
  }

  function refreshEquivalent() {
    const amount = numberValue(purchaseInput.value);
    const rate = options.currencyCode === 'USD' ? 1 : numberValue(rateInput.value);
    equivalentValue.textContent = usd(Math.max(0, amount * rate));
  }

  function dismiss() {
    backdrop.remove();
  }

  close.addEventListener('click', dismiss);
  cancel.addEventListener('click', dismiss);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) dismiss();
  });
  personSelect.addEventListener('change', refreshPersonMode);
  purchaseInput.addEventListener('input', refreshEquivalent);
  rateInput.addEventListener('input', refreshEquivalent);
  dniInput.addEventListener('input', () => {
    dniInput.value = dniInput.value.replace(/\D/g, '').slice(0, 8);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errors.hidden = true;
    errors.textContent = '';
    const person = selectedPerson();
    const isNew = personSelect.value === NEW_PERSON;
    const amount = numberValue(purchaseInput.value);
    const rate = options.currencyCode === 'USD' ? 1 : numberValue(rateInput.value);
    const fee = numberValue(feeInput.value);
    const validation: string[] = [];

    if (isNew) {
      if (fullNameInput.value.trim().length < 3) validation.push('Ingresa el nombre completo.');
      if (!/^\d{8}$/.test(dniInput.value.trim())) validation.push('El DNI debe tener 8 dígitos.');
      if (addressInput.value.trim().length < 3) validation.push('Ingresa la dirección.');
      if (postalInput.value.trim().length < 3) validation.push('Ingresa el código postal.');
      if (people.some((candidate) => candidate.documentNumber === dniInput.value.trim())) {
        validation.push('Ese DNI ya está guardado. Selecciona a la persona desde la lista.');
      }
    } else if (!person) {
      validation.push('Selecciona una persona.');
    }
    if (!(amount > 0)) validation.push('El monto de compra asociado debe ser mayor que cero.');
    if (!(rate > 0)) validation.push('Ingresa un tipo de cambio válido hacia USD.');
    if (fee < 0) validation.push('El costo de gestión no puede ser negativo.');

    if (validation.length > 0) {
      errors.textContent = validation.join(' ');
      errors.hidden = false;
      return;
    }

    const input: RegisterImportDniUsageInput = {
      personId: isNew ? null : person?.id,
      person: isNew
        ? {
            fullName: fullNameInput.value.trim(),
            documentNumber: dniInput.value.trim(),
            address: addressInput.value.trim(),
            postalCode: postalInput.value.trim(),
          }
        : null,
      purchaseAmount: amount,
      exchangeRateToUsd: rate,
      managementFeePen: fee,
    };

    submit.disabled = true;
    submit.textContent = 'Registrando…';
    try {
      await options.onSave(input, person);
      dismiss();
    } catch (error) {
      errors.textContent = error instanceof Error ? error.message : 'No se pudo registrar la gestión.';
      errors.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Registrar gestión por DNI';
    }
  });

  refreshPersonMode();
  refreshEquivalent();
}

function newImportPanel() {
  const main = document.querySelector<HTMLElement>('.new-import-main');
  if (!main) return null;
  let panel = main.querySelector<HTMLElement>('.import-dni-new-panel');
  if (panel) return panel;

  panel = element('section', 'panel import-dni-panel import-dni-new-panel');
  const firstPanel = main.querySelector(':scope > .panel');
  if (firstPanel) firstPanel.after(panel);
  else main.prepend(panel);
  return panel;
}

async function renderNewImportPanel() {
  if (location.pathname !== '/importaciones/nueva') return;
  const panel = newImportPanel();
  if (!panel) return;
  const currencyCode = currentNewImportCurrency();
  const totalPurchase = currentNewImportPurchaseAmount(currencyCode);
  let people: ImportDniPerson[] = [];
  try {
    people = (await getImportDniPeople()).items;
  } catch {
    // El modal volverá a intentar la carga y mostrará el error si corresponde.
  }
  const store = readPendingStore();
  const allocated = store.usages.reduce((sum, usage) => sum + usage.input.purchaseAmount, 0);
  const remaining = Math.max(0, totalPurchase - allocated);

  panel.replaceChildren();
  const heading = element('div', 'panel-heading');
  const copy = element('div');
  copy.append(
    element('h2', '', 'Gestión por DNI'),
    element(
      'p',
      '',
      'Asocia la persona utilizada y controla en USD cuánto de la compra corresponde a cada DNI.',
    ),
  );
  const button = element('button', 'button button-secondary', '+ Registrar gestión por DNI');
  button.type = 'button';
  heading.append(copy, button);

  const purchase = element('div', 'import-dni-purchase-preview');
  purchase.append(
    element('span', '', `Compra detectada en ${currencyCode}`),
    element('strong', '', currencyAmount(totalPurchase, currencyCode)),
  );
  panel.append(heading, purchase);

  if (store.usages.length > 0) {
    const list = element('div', 'import-dni-usage-list');
    store.usages.forEach((usage) => {
      const row = element('div', 'import-dni-usage-row');
      const text = element('div');
      const equivalent = usage.input.purchaseAmount * usage.input.exchangeRateToUsd;
      const documentNumber = usage.documentNumber || maskPendingDocument(usage.input, people);
      text.append(
        element('strong', '', usage.displayName || pendingLabel(usage.input, people)),
        element(
          'small',
          '',
          `DNI ${maskDni(documentNumber)} · ${currencyAmount(usage.input.purchaseAmount, currencyCode)} → ${usd(equivalent)} · Gestión S/ ${usage.input.managementFeePen.toFixed(2)}`,
        ),
      );
      const remove = element('button', 'button button-secondary button-compact', 'Quitar');
      remove.type = 'button';
      remove.addEventListener('click', () => {
        const current = readPendingStore();
        writePendingStore({ ...current, usages: current.usages.filter((item) => item.key !== usage.key) });
        void renderNewImportPanel();
      });
      row.append(text, remove);
      list.append(row);
    });
    panel.append(list);
  } else {
    panel.append(
      element(
        'p',
        'import-dni-empty',
        'No hay una persona asociada todavía. Este registro es independiente del tipo de cambio a soles.',
      ),
    );
  }

  button.addEventListener('click', () => {
    const current = readPendingStore();
    const alreadyUsed = new Set(
      current.usages.map((usage) => usage.input.personId).filter((value): value is string => Boolean(value)),
    );
    void openDniDialog({
      currencyCode,
      defaultPurchaseAmount: remaining || totalPurchase,
      excludedPersonIds: alreadyUsed,
      onSave: (input, person) => {
        const documentNumber = input.person?.documentNumber ?? person?.documentNumber ?? '';
        const latest = readPendingStore();
        if (
          latest.usages.some(
            (usage) =>
              (input.personId && usage.input.personId === input.personId) ||
              (documentNumber && usage.documentNumber === documentNumber),
          )
        ) {
          throw new Error('Esta persona ya está asociada a la importación pendiente.');
        }
        writePendingStore({
          usages: [
            ...latest.usages,
            {
              key: crypto.randomUUID(),
              input,
              displayName: input.person?.fullName ?? person?.fullName ?? 'Persona',
              documentNumber,
            },
          ],
        });
        void renderNewImportPanel();
      },
    });
  });
}

async function attachPendingUsages(importId: string) {
  const store = readPendingStore();
  if (
    store.usages.length === 0 ||
    !store.armedAt ||
    Date.now() - store.armedAt > AUTO_ATTACH_WINDOW_MS
  ) {
    return false;
  }
  const existing = (await getImportDniUsages(importId)).items;
  const failed: PendingDniUsage[] = [];
  let registered = 0;
  for (const pending of store.usages) {
    const duplicate = existing.some(
      (usage) =>
        (pending.input.personId && usage.personId === pending.input.personId) ||
        (pending.documentNumber && usage.documentNumber === pending.documentNumber),
    );
    if (duplicate) continue;
    try {
      await registerImportDniUsage(importId, pending.input);
      registered += 1;
    } catch {
      failed.push(pending);
    }
  }

  if (failed.length > 0) {
    writePendingStore({ usages: failed });
    showInlineError(
      'La importación se creó, pero una gestión por DNI no pudo registrarse. Puedes volver a agregarla desde este detalle.',
    );
    return false;
  }

  sessionStorage.removeItem(STORAGE_KEY);
  if (registered > 0) {
    window.location.reload();
    return true;
  }
  return false;
}

function detailImportId() {
  const match = location.pathname.match(/^\/importaciones\/([0-9a-f-]{36})$/i);
  return match?.[1] ?? null;
}

async function renderDetailPanel() {
  const importId = detailImportId();
  if (!importId) return;
  const column = document.querySelector<HTMLElement>('.import-actions-column');
  if (!column) return;
  if (await attachPendingUsages(importId)) return;

  let panel = column.querySelector<HTMLElement>('.import-dni-detail-panel');
  if (!panel) {
    panel = element('section', 'panel import-dni-panel import-dni-detail-panel');
    const dataPanel = [...column.querySelectorAll<HTMLElement>(':scope > .panel')].find((candidate) =>
      candidate.querySelector('h2')?.textContent?.includes('Datos generales'),
    );
    if (dataPanel) dataPanel.after(panel);
    else column.append(panel);
  }
  if (panel.dataset.loading === 'true') return;
  panel.dataset.loading = 'true';

  try {
    const [detail, usagesResponse, peopleResponse] = await Promise.all([
      getImport(importId),
      getImportDniUsages(importId),
      getImportDniPeople(),
    ]);
    const usages = usagesResponse.items;
    const people = peopleResponse.items;
    const purchaseTotal = totalDetailPurchaseAmount(detail);
    const allocated = usages.reduce((sum, usage) => sum + usage.purchaseAmount, 0);
    const remaining = Math.max(0, purchaseTotal - allocated);

    panel.replaceChildren();
    const heading = element('div', 'panel-heading');
    const copy = element('div');
    copy.append(
      element('h2', '', 'Gestión por DNI'),
      element('p', '', 'Personas asociadas a esta importación y valor controlado en USD.'),
    );
    const button = element(
      'button',
      'button button-secondary button-compact',
      usages.length === 0 ? '+ Registrar gestión por DNI' : '+ Agregar otra persona',
    );
    button.type = 'button';
    heading.append(copy, button);
    panel.append(heading);

    if (usages.length === 0) {
      panel.append(
        element(
          'p',
          'import-dni-empty',
          'Todavía no hay un DNI asociado. La conversión a USD se usa solo para este seguimiento; no reemplaza el tipo de cambio a PEN.',
        ),
      );
    } else {
      const list = element('div', 'import-dni-usage-list');
      usages.forEach((usage: ImportDniUsage) => {
        const row = element('div', 'import-dni-detail-usage');
        const top = element('div');
        top.append(
          element('strong', '', usage.fullName),
          element('span', '', `DNI ${maskDni(usage.documentNumber)}`),
        );
        const amounts = element('div', 'import-dni-detail-amounts');
        amounts.append(
          element(
            'span',
            '',
            `${currencyAmount(usage.purchaseAmount, usage.sourceCurrencyCode)} → ${usd(usage.equivalentUsd)}`,
          ),
          element('span', '', `TC ${usage.sourceCurrencyCode} → USD: ${usage.exchangeRateToUsd}`),
          element('span', '', `Costo de gestión: S/ ${usage.managementFeePen.toFixed(2)}`),
          element('strong', '', `Acumulado histórico: ${usd(usage.personAccumulatedUsd)}`),
        );
        row.append(top, amounts);
        list.append(row);
      });
      panel.append(list);
    }

    button.addEventListener('click', () => {
      const excluded = new Set(usages.map((usage) => usage.personId));
      void openDniDialog({
        currencyCode: detail.purchaseCurrencyCode,
        defaultPurchaseAmount: remaining || purchaseTotal,
        excludedPersonIds: excluded,
        onSave: async (input) => {
          await registerImportDniUsage(importId, input);
          window.location.reload();
        },
      });
    });

    if (people.length === 0 && usages.length === 0) {
      panel.append(
        element(
          'small',
          'import-dni-panel-note',
          'La primera persona que registres quedará guardada para futuras importaciones.',
        ),
      );
    }
  } catch (error) {
    panel.replaceChildren(
      element(
        'div',
        'empty-state',
        error instanceof Error ? error.message : 'No se pudo cargar la gestión por DNI.',
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
    if (location.pathname === '/importaciones/nueva') void renderNewImportPanel();
    else if (detailImportId()) void renderDetailPanel();
  });
}

export function installImportDniManagementRuntime() {
  if (document.documentElement.dataset.importDniManagementRuntime === 'true') return;
  document.documentElement.dataset.importDniManagementRuntime = 'true';

  document.addEventListener(
    'submit',
    (event) => {
      if (location.pathname !== '/importaciones/nueva') return;
      const form = (event.target as HTMLElement).closest<HTMLFormElement>('form.new-import-layout');
      if (!form) return;
      const store = readPendingStore();
      if (store.usages.length > 0) writePendingStore({ ...store, armedAt: Date.now() });
    },
    true,
  );

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}