import type { ImportDetail } from '@yukimi/shared';
import { createManualFinanceTransaction, getFinanceSupport } from '../features/finance/finance-api';
import {
  getImport,
  getImportSupportData,
  updateInsuranceClaim,
} from '../features/imports/imports-api';
import { createInventoryMovement } from '../features/products/products-api';

type Incident = ImportDetail['incidents'][number];
type Claim = Incident['insuranceClaims'][number];
type ResolutionMode = 'NONE' | 'REFUND' | 'REPLACEMENT' | 'CREDIT' | 'MIXED';

type SelectOption = { value: string; label: string };

const statusLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  SUBMITTED: 'Presentado',
  APPROVED: 'Aprobado',
  PARTIALLY_APPROVED: 'Aprobado parcialmente',
  REJECTED: 'Rechazado',
  PAID: 'Pagado',
  CLOSED: 'Cerrado',
};

const resolutionLabels: Record<ResolutionMode, string> = {
  NONE: 'Sin resolución económica todavía',
  REFUND: 'Reembolso de dinero',
  REPLACEMENT: 'Reposición de productos',
  CREDIT: 'Crédito a favor',
  MIXED: 'Mixto: reembolso + reposición',
};

let scheduled = false;
let loading = false;
let lastFingerprint = '';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function currentImportId() {
  return location.pathname.match(/^\/importaciones\/([0-9a-f-]{36})$/i)?.[1] ?? null;
}

function dateTimeLocalNow() {
  const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000);
  return now.toISOString().slice(0, 16);
}

function selectField(label: string, options: SelectOption[], value: string) {
  const wrapper = node('label', 'field');
  wrapper.append(node('span', '', label));
  const select = node('select');
  options.forEach((option) => {
    const item = node('option');
    item.value = option.value;
    item.textContent = option.label;
    item.selected = option.value === value;
    select.append(item);
  });
  wrapper.append(select);
  return { wrapper, select };
}

function inputField(
  label: string,
  value = '',
  type: 'text' | 'number' | 'datetime-local' = 'text',
) {
  const wrapper = node('label', 'field');
  wrapper.append(node('span', '', label));
  const input = node('input');
  input.type = type;
  input.value = value;
  if (type === 'number') {
    input.min = '0';
    input.step = '0.01';
  }
  wrapper.append(input);
  return { wrapper, input };
}

function textareaField(label: string, value = '') {
  const wrapper = node('label', 'field field-span-2');
  wrapper.append(node('span', '', label));
  const textarea = node('textarea');
  textarea.rows = 4;
  textarea.value = value;
  wrapper.append(textarea);
  return { wrapper, textarea };
}

function allowedStatuses(currentStatus: string): SelectOption[] {
  const map: Record<string, string[]> = {
    PENDING: ['PENDING', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'],
    SUBMITTED: ['SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'],
    APPROVED: ['APPROVED', 'PAID', 'CLOSED'],
    PARTIALLY_APPROVED: ['PARTIALLY_APPROVED', 'PAID', 'CLOSED'],
    PAID: ['PAID', 'CLOSED'],
    REJECTED: ['REJECTED', 'CLOSED'],
    CLOSED: ['CLOSED'],
  };
  return (map[currentStatus] ?? Object.keys(statusLabels)).map((value) => ({
    value,
    label: statusLabels[value] ?? value,
  }));
}

function needsResolution(status: string) {
  return ['APPROVED', 'PARTIALLY_APPROVED', 'PAID', 'CLOSED'].includes(status);
}

function showNotice(message: string, tone: 'success' | 'error' = 'success') {
  document.querySelector('.import-insurance-resolution-notice')?.remove();
  const notice = node(
    'div',
    `import-reconciliation-runtime-notice ${tone} import-insurance-resolution-notice`,
    message,
  );
  notice.setAttribute('role', 'status');
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 6000);
}

async function openResolutionModal(data: ImportDetail, incident: Incident, claim: Claim) {
  document.querySelector('.import-insurance-resolution-backdrop')?.remove();

  const [finance, importSupport] = await Promise.all([getFinanceSupport(), getImportSupportData()]);
  const claimCurrency = claim.currencyCode ?? 'PEN';
  const incomeAccounts = finance.accounts.filter(
    (account) => account.currencyCode === claimCurrency,
  );
  const incomeCategories = finance.categories.filter(
    (category) => category.isActive && ['INCOME', 'BOTH'].includes(category.nature),
  );
  const importItems = data.boxes.flatMap((box) =>
    box.items.map((item) => ({ ...item, boxCode: box.code })),
  );
  const linkedItem = incident.importBoxItemId
    ? importItems.find((item) => item.id === incident.importBoxItemId)
    : undefined;

  const backdrop = node('div', 'app-modal-backdrop import-insurance-resolution-backdrop');
  const card = node('form', 'app-modal-card modal-card-wide import-insurance-resolution-modal');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');

  const header = node('header', 'app-modal-header');
  const copy = node('div');
  copy.append(
    node('span', 'eyebrow', 'Reclamo de importación'),
    node('h2', '', 'Gestionar resolución del reclamo'),
    node(
      'p',
      '',
      'Aprobar no mueve dinero ni stock. Yukimi registra el movimiento únicamente cuando el reembolso o la reposición ocurren de verdad.',
    ),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  header.append(copy, close);

  const summary = node('div', 'claim-resolution-summary');
  summary.append(
    node('strong', '', claim.claimNumber ?? 'Reclamo sin número'),
    node(
      'span',
      '',
      `${incident.itemLabel ?? incident.description} · reclamado ${claimCurrency} ${Number(claim.claimedAmount ?? 0).toFixed(2)}`,
    ),
  );

  const error = node('div', 'form-error-summary claim-resolution-error');
  error.hidden = true;

  const grid = node('div', 'form-grid form-grid-2 claim-resolution-grid');
  const status = selectField('Nuevo estado *', allowedStatuses(claim.status), claim.status);
  const resolution = selectField(
    'Resultado del reclamo *',
    (Object.entries(resolutionLabels) as Array<[ResolutionMode, string]>).map(([value, label]) => ({
      value,
      label,
    })),
    'NONE',
  );
  const approvedAmount = inputField(
    'Monto aprobado',
    String(claim.approvedAmount ?? claim.claimedAmount ?? 0),
    'number',
  );
  approvedAmount.input.step = '0.01';
  const notes = textareaField('Resolución o explicación *');

  const financeSection = node('section', 'claim-resolution-section field-span-2');
  financeSection.append(node('h3', '', 'Reembolso recibido → Finanzas'));
  const financeGrid = node('div', 'form-grid form-grid-2');
  const account = selectField(
    `Cuenta de ingreso (${claimCurrency}) *`,
    [
      { value: '', label: 'Seleccionar cuenta' },
      ...incomeAccounts.map((item) => ({
        value: item.id,
        label: `${item.name} · ${item.currencyCode}`,
      })),
    ],
    '',
  );
  const category = selectField(
    'Categoría de ingreso *',
    [
      { value: '', label: 'Seleccionar categoría' },
      ...incomeCategories.map((item) => ({ value: item.id, label: item.name })),
    ],
    '',
  );
  const refundAmount = inputField(
    'Monto realmente recibido *',
    String(claim.approvedAmount ?? claim.claimedAmount ?? 0),
    'number',
  );
  const refundDate = inputField('Fecha y hora recibida *', dateTimeLocalNow(), 'datetime-local');
  const refundReference = inputField('Operación o referencia', claim.claimNumber ?? '');
  financeGrid.append(
    account.wrapper,
    category.wrapper,
    refundAmount.wrapper,
    refundDate.wrapper,
    refundReference.wrapper,
  );
  financeSection.append(
    node(
      'p',
      'claim-resolution-help',
      incomeAccounts.length > 0
        ? 'Se creará un ingreso real en Finanzas y quedará referenciado al reclamo.'
        : `No hay una cuenta financiera activa en ${claimCurrency}. Crea o habilita una antes de registrar el reembolso.`,
    ),
    financeGrid,
  );

  const replacementSection = node('section', 'claim-resolution-section field-span-2');
  replacementSection.append(node('h3', '', 'Reposición recibida → Inventario'));
  const replacementGrid = node('div', 'form-grid form-grid-2');
  const replacementItem = selectField(
    'Producto repuesto *',
    [
      { value: '', label: 'Seleccionar producto' },
      ...importItems.map((item) => ({
        value: item.id,
        label: `${item.productName} · ${item.variantName} · ${item.boxCode}`,
      })),
    ],
    linkedItem?.id ?? '',
  );
  const warehouse = selectField(
    'Almacén donde ingresó *',
    [
      { value: '', label: 'Seleccionar almacén' },
      ...importSupport.warehouses.map((item) => ({ value: item.id, label: item.name })),
    ],
    linkedItem?.destinationWarehouseId ?? '',
  );
  const replacementQuantity = inputField(
    'Cantidad realmente recibida *',
    String(incident.affectedQuantity ?? 1),
    'number',
  );
  replacementQuantity.input.step = '1';
  replacementQuantity.input.min = '1';
  replacementGrid.append(replacementItem.wrapper, warehouse.wrapper, replacementQuantity.wrapper);
  replacementSection.append(
    node(
      'p',
      'claim-resolution-help',
      'Yukimi crea un ajuste positivo auditado solo cuando confirmas que las unidades de reposición llegaron físicamente.',
    ),
    replacementGrid,
  );

  const actionNote = node('div', 'context-note claim-resolution-action-note');
  grid.append(
    status.wrapper,
    resolution.wrapper,
    approvedAmount.wrapper,
    notes.wrapper,
    financeSection,
    replacementSection,
    actionNote,
  );

  const actions = node('footer', 'app-modal-actions');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  const submit = node('button', 'button button-primary', 'Guardar resolución');
  submit.type = 'submit';
  actions.append(cancel, submit);

  card.append(header, summary, error, grid, actions);
  backdrop.append(card);
  document.body.append(backdrop);

  const dismiss = () => backdrop.remove();
  close.addEventListener('click', dismiss);
  cancel.addEventListener('click', dismiss);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) dismiss();
  });

  function refreshVisibility() {
    const targetStatus = status.select.value;
    const mode = resolution.select.value as ResolutionMode;
    const realResolution = needsResolution(targetStatus);
    resolution.wrapper.hidden = !realResolution;
    approvedAmount.wrapper.hidden = !realResolution || mode === 'NONE';

    const refundMode = mode === 'REFUND' || mode === 'MIXED';
    const replacementMode = mode === 'REPLACEMENT' || mode === 'MIXED';
    const createsRefund =
      refundMode &&
      ['PAID', 'CLOSED'].includes(targetStatus) &&
      !(claim.status === 'PAID' && targetStatus === 'CLOSED');
    const createsReplacement =
      replacementMode && targetStatus === 'CLOSED' && claim.status !== 'CLOSED';

    financeSection.hidden = !createsRefund;
    replacementSection.hidden = !createsReplacement;

    if (!realResolution) {
      actionNote.textContent = 'Este cambio solo actualiza el seguimiento del reclamo.';
    } else if (targetStatus === 'APPROVED' || targetStatus === 'PARTIALLY_APPROVED') {
      actionNote.textContent =
        'Se guardará la aprobación y el tipo de solución, pero todavía no se moverá dinero ni inventario.';
    } else if (createsRefund && createsReplacement) {
      actionNote.textContent =
        'Al confirmar se registrarán el ingreso en Finanzas y la reposición en Inventario. Los identificadores quedarán escritos en la resolución.';
    } else if (createsRefund) {
      actionNote.textContent =
        'Al confirmar se registrará el reembolso como ingreso real en Finanzas y se guardará su referencia en la resolución.';
    } else if (createsReplacement) {
      actionNote.textContent =
        'Al confirmar se ingresarán las unidades repuestas al Inventario mediante un ajuste positivo auditado.';
    } else if (mode === 'CREDIT') {
      actionNote.textContent =
        'El crédito a favor quedará documentado en el reclamo. No se crea un movimiento de dinero o stock hasta que ese crédito se utilice.';
    } else {
      actionNote.textContent =
        'Se actualizará el estado y la resolución sin generar movimientos nuevos.';
    }
  }

  status.select.addEventListener('change', refreshVisibility);
  resolution.select.addEventListener('change', refreshVisibility);
  refreshVisibility();

  card.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;
    const targetStatus = status.select.value;
    const mode = resolution.select.value as ResolutionMode;
    const explanation = notes.textarea.value.trim();
    const approved = approvedAmount.input.value ? Number(approvedAmount.input.value) : null;
    const problems: string[] = [];

    if (explanation.length < 3) problems.push('Escribe una explicación de al menos 3 caracteres.');
    if (needsResolution(targetStatus) && mode === 'NONE') {
      problems.push('Selecciona cómo se resolverá el reclamo.');
    }
    if (approved != null && (!Number.isFinite(approved) || approved < 0)) {
      problems.push('El monto aprobado no es válido.');
    }
    if (mode === 'REPLACEMENT' && targetStatus === 'PAID') {
      problems.push(
        'Una reposición no se marca como Pagada; déjala Aprobada o ciérrala cuando llegue.',
      );
    }
    if (mode === 'CREDIT' && targetStatus === 'PAID') {
      problems.push(
        'Un crédito a favor no se marca como Pagado; documenta el crédito o cierra el reclamo.',
      );
    }

    const createsRefund =
      (mode === 'REFUND' || mode === 'MIXED') &&
      ['PAID', 'CLOSED'].includes(targetStatus) &&
      !(claim.status === 'PAID' && targetStatus === 'CLOSED');
    const createsReplacement =
      (mode === 'REPLACEMENT' || mode === 'MIXED') &&
      targetStatus === 'CLOSED' &&
      claim.status !== 'CLOSED';

    const actualRefund = Number(refundAmount.input.value);
    if (createsRefund) {
      if (!account.select.value) problems.push('Selecciona la cuenta donde ingresó el reembolso.');
      if (!category.select.value)
        problems.push('Selecciona la categoría financiera del reembolso.');
      if (!Number.isFinite(actualRefund) || actualRefund <= 0)
        problems.push('Ingresa el monto realmente recibido.');
      if (!refundDate.input.value) problems.push('Selecciona la fecha real del reembolso.');
    }

    const quantity = Number(replacementQuantity.input.value);
    if (createsReplacement) {
      if (!replacementItem.select.value) problems.push('Selecciona el producto que fue repuesto.');
      if (!warehouse.select.value)
        problems.push('Selecciona el almacén donde llegó la reposición.');
      if (!Number.isInteger(quantity) || quantity <= 0)
        problems.push('La cantidad repuesta debe ser un entero mayor que cero.');
    }

    if (problems.length > 0) {
      error.textContent = problems.join(' ');
      error.hidden = false;
      return;
    }

    submit.disabled = true;
    cancel.disabled = true;
    submit.textContent = 'Procesando…';

    void (async () => {
      try {
        let financeCode: string | undefined;
        let inventoryCode: string | undefined;

        if (createsRefund) {
          const transaction = await createManualFinanceTransaction(
            {
              transactionTypeCode: 'INCOME',
              accountId: account.select.value,
              categoryId: category.select.value,
              amount: actualRefund,
              occurredAt: new Date(refundDate.input.value).toISOString(),
              description: `Reembolso por reclamo de importación ${claim.claimNumber ?? claim.id.slice(0, 8)}`,
              reference: refundReference.input.value.trim() || claim.claimNumber || null,
              notes: `Importación ${data.code}. Incidencia: ${incident.description}`,
              reason: 'Reembolso de reclamo de importación efectivamente recibido.',
            },
            `insurance-claim-refund-${claim.id}`,
          );
          financeCode = transaction.code;
        }

        if (createsReplacement) {
          const selectedItem = importItems.find((item) => item.id === replacementItem.select.value);
          if (!selectedItem)
            throw new Error('No se encontró el producto seleccionado para la reposición.');
          const movement = await createInventoryMovement(
            {
              action: 'DYNAMIC',
              variantId: selectedItem.variantId,
              sourceWarehouseId: warehouse.select.value,
              destinationWarehouseId: null,
              quantity,
              reason: `Reposición recibida por reclamo ${claim.claimNumber ?? claim.id.slice(0, 8)}.`,
              notes: `Importación ${data.code}. Incidencia: ${incident.description}. La reposición se registra únicamente al confirmar la recepción física.`,
            },
            `insurance-claim-replacement-${claim.id}`,
          );
          inventoryCode = movement.code;
        }

        const trace: string[] = [`Resultado: ${resolutionLabels[mode]}.`, explanation];
        if (targetStatus === 'APPROVED' || targetStatus === 'PARTIALLY_APPROVED') {
          trace.push(
            'Movimiento real pendiente; la aprobación por sí sola no modificó Finanzas ni Inventario.',
          );
        }
        if (financeCode) trace.push(`Movimiento financiero: ${financeCode}.`);
        if (inventoryCode) trace.push(`Movimiento de inventario: ${inventoryCode}.`);
        if (mode === 'CREDIT')
          trace.push('Crédito a favor documentado; sin movimiento automático hasta su uso real.');

        await updateInsuranceClaim(claim.id, {
          status: targetStatus as
            | 'PENDING'
            | 'SUBMITTED'
            | 'APPROVED'
            | 'PARTIALLY_APPROVED'
            | 'REJECTED'
            | 'PAID'
            | 'CLOSED',
          approvedAmount: approved,
          resolutionNotes: trace.join('\n'),
        });

        dismiss();
        showNotice(
          createsRefund || createsReplacement
            ? 'Reclamo actualizado y movimiento real registrado correctamente.'
            : 'Reclamo actualizado. No se generó ningún movimiento porque todavía no ocurrió uno real.',
        );
        window.setTimeout(() => location.reload(), 650);
      } catch (caught) {
        error.textContent =
          caught instanceof Error
            ? caught.message
            : 'No se pudo completar la resolución del reclamo.';
        error.hidden = false;
        submit.disabled = false;
        cancel.disabled = false;
        submit.textContent = 'Guardar resolución';
      }
    })();
  });
}

async function patchClaimRows() {
  const importId = currentImportId();
  if (!importId || loading || !document.querySelector('.import-detail-page')) return;
  loading = true;
  try {
    const data = await getImport(importId);
    const fingerprint = data.incidents
      .flatMap((incident) =>
        incident.insuranceClaims.map((claim) => `${incident.id}:${claim.id}:${claim.status}`),
      )
      .join('|');
    const cards = [...document.querySelectorAll<HTMLElement>('.incident-card')];
    if (cards.length !== data.incidents.length) return;

    data.incidents.forEach((incident, incidentIndex) => {
      const card = cards[incidentIndex];
      if (!card) return;
      const rows = [...card.querySelectorAll<HTMLElement>('.insurance-claim-row')];
      incident.insuranceClaims.forEach((claim, claimIndex) => {
        const row = rows[claimIndex];
        if (!row) return;
        const original = [...row.querySelectorAll<HTMLButtonElement>('button')].find(
          (button) => button.textContent?.trim() === 'Actualizar',
        );
        if (original) original.hidden = true;

        let button = row.querySelector<HTMLButtonElement>('[data-insurance-resolution-button]');
        if (!button) {
          button = node('button', 'button button-secondary button-compact', 'Gestionar resolución');
          button.type = 'button';
          button.dataset.insuranceResolutionButton = claim.id;
          row.append(button);
        }
        button.onclick = () => {
          void openResolutionModal(data, incident, claim).catch((caught) => {
            showNotice(
              caught instanceof Error
                ? caught.message
                : 'No se pudieron cargar las opciones para resolver el reclamo.',
              'error',
            );
          });
        };

        let help = row.querySelector<HTMLElement>('[data-insurance-resolution-help]');
        if (!help) {
          help = node('small', 'insurance-claim-resolution-help');
          help.dataset.insuranceResolutionHelp = claim.id;
          row.append(help);
        }
        help.textContent = ['APPROVED', 'PARTIALLY_APPROVED'].includes(claim.status)
          ? 'Aprobado no mueve stock ni dinero; registra la recepción o el reembolso cuando ocurra.'
          : claim.status === 'PAID'
            ? 'El reembolso ya puede cerrarse cuando no queden acciones pendientes.'
            : claim.status === 'CLOSED'
              ? 'Reclamo cerrado.'
              : 'El movimiento real se registra desde Gestionar resolución.';
      });
    });
    lastFingerprint = fingerprint;
  } catch {
    // La interfaz React original sigue disponible si esta mejora no puede cargar datos.
  } finally {
    loading = false;
  }
}

function schedulePatch() {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    const importId = currentImportId();
    if (!importId) {
      lastFingerprint = '';
      return;
    }
    const visibleClaims = document.querySelectorAll('.insurance-claim-row').length;
    if (visibleClaims === 0 && lastFingerprint === '') return;
    void patchClaimRows();
  }, 220);
}

export function installImportInsuranceResolutionRuntime() {
  if (document.documentElement.dataset.importInsuranceResolutionRuntime === 'true') return;
  document.documentElement.dataset.importInsuranceResolutionRuntime = 'true';
  new MutationObserver(schedulePatch).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedulePatch);
  schedulePatch();
}
