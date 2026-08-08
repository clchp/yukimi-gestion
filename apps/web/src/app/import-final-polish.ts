import type { ImportDetail } from '@yukimi/shared';
import { getImport } from '../features/imports/imports-api';

let scheduled = false;
let detailLoading = false;
let lastDetailId: string | null = null;
let lastDetailFingerprint = '';

function money(value: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(value);
}

function currentImportId() {
  return location.pathname.match(/^\/importaciones\/([0-9a-f-]{36})$/i)?.[1] ?? null;
}

function moveDniPanelBeforeSummary() {
  if (location.pathname !== '/importaciones/nueva') return;
  const main = document.querySelector<HTMLElement>('.new-import-main');
  const panel = main?.querySelector<HTMLElement>('.import-dni-new-panel');
  if (!main || !panel) return;

  // Mantener el panel dentro de la columna principal para que el runtime de DNI
  // continúe reutilizando la misma instancia, pero colocarlo al final del flujo,
  // inmediatamente antes del bloque Resumen en el orden del formulario.
  if (main.lastElementChild !== panel) main.append(panel);
}

function fieldIsResolved(field: HTMLElement) {
  if (field.classList.contains('searchable-select')) {
    const selected = field.querySelector<HTMLElement>('.searchable-select-trigger > span');
    return Boolean(selected && !selected.classList.contains('placeholder'));
  }

  const control = field.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >('input, select, textarea');
  if (!control) return false;
  if (control.disabled) return true;

  const label = field.querySelector(':scope > span')?.textContent ?? '';
  const required = label.includes('*');
  const value = control.value.trim();

  if (!value) return !required;
  if (control instanceof HTMLInputElement && control.type === 'number') {
    return control.validity.valid;
  }
  return control.validity.valid;
}

function patchNewImportValidation() {
  if (location.pathname !== '/importaciones/nueva') return;
  const form = document.querySelector<HTMLElement>('form.new-import-layout');
  const banner = document.querySelector<HTMLElement>('main.page > .form-error-summary');
  if (!form || !banner) return;

  for (const field of form.querySelectorAll<HTMLElement>('.field-invalid')) {
    if (!fieldIsResolved(field)) continue;
    field.classList.remove('field-invalid');
    const error = field.querySelector<HTMLElement>('.field-error');
    if (error) error.hidden = true;
  }

  const unresolved = [...form.querySelectorAll<HTMLElement>('.field-invalid')].filter(
    (field) => !fieldIsResolved(field),
  );
  if (unresolved.length === 0) {
    banner.hidden = true;
    return;
  }

  banner.hidden = false;
  banner.textContent = `No se pudo crear la importación. Corrige ${unresolved.length} ${
    unresolved.length === 1 ? 'campo marcado' : 'campos marcados'
  } en rojo.`;
}

function lockBoxCards(locked: boolean) {
  for (const card of document.querySelectorAll<HTMLElement>(
    '.import-detail-page .import-box-card',
  )) {
    card.classList.toggle('import-box-purchase-locked', locked);
    const footer = card.querySelector<HTMLElement>('.import-box-actions');
    if (!footer) continue;

    let note = card.querySelector<HTMLElement>('.import-box-purchase-lock-note');
    if (locked) {
      if (!note) {
        note = document.createElement('div');
        note.className = 'context-note import-box-purchase-lock-note';
        const title = document.createElement('strong');
        title.textContent = 'Caja bloqueada hasta confirmar la compra';
        const copy = document.createElement('span');
        copy.textContent =
          'Primero usa “Confirmar compra” en la acción general. Después podrás avanzar cada caja normalmente.';
        note.append(title, copy);
        footer.before(note);
      }
      for (const button of footer.querySelectorAll<HTMLButtonElement>('button')) {
        if (!button.disabled) button.dataset.purchaseConfirmationLock = 'true';
        button.disabled = true;
      }
    } else {
      note?.remove();
      for (const button of footer.querySelectorAll<HTMLButtonElement>(
        'button[data-purchase-confirmation-lock="true"]',
      )) {
        button.disabled = false;
        delete button.dataset.purchaseConfirmationLock;
      }
    }
  }
}

function lockBoxesFromVisibleState() {
  if (!currentImportId()) return;
  const badge = document.querySelector<HTMLElement>(
    '.import-detail-page .page-actions .status-badge',
  );
  const state = badge?.textContent?.trim().toLocaleLowerCase('es-PE') ?? '';
  if (state.includes('cotización') || state.includes('cotizacion')) lockBoxCards(true);
}

function pendingPurchaseValue(data: ImportDetail) {
  return data.boxes.reduce(
    (shipmentTotal, box) =>
      shipmentTotal +
      box.items.reduce(
        (boxTotal, item) =>
          boxTotal +
          Math.max(0, item.expectedQuantity - item.receivedQuantity) *
            item.originalUnitCost *
            item.exchangeRateToPen,
        0,
      ),
    0,
  );
}

function summaryCellByLabel(strip: HTMLElement, labels: string[]) {
  return [...strip.querySelectorAll<HTMLElement>(':scope > div')].find((cell) => {
    const text = cell.querySelector('span')?.textContent?.trim() ?? '';
    return labels.some((label) => text === label);
  });
}

function patchImportSummary(data: ImportDetail) {
  const strip = document.querySelector<HTMLElement>(
    '.import-detail-page .summary-strip.import-cost-summary',
  );
  if (!strip) return;

  const pending = summaryCellByLabel(strip, [
    'Diferencia no recibida',
    'Valor pendiente de recibir',
  ]);
  if (pending) {
    const label = pending.querySelector<HTMLElement>('span');
    const value = pending.querySelector<HTMLElement>('strong');
    if (label) label.textContent = 'Valor pendiente de recibir';
    if (value) value.textContent = money(pendingPurchaseValue(data));
  }

  const totalValue = data.totals.purchaseValuePen + data.totals.extraCostsPen;
  let total = strip.querySelector<HTMLElement>('.import-total-to-pay');
  if (!total) {
    total = document.createElement('div');
    total.className = 'import-total-to-pay';
    total.append(document.createElement('span'), document.createElement('strong'));
    strip.append(total);
  }
  const totalLabel = total.querySelector<HTMLElement>('span');
  const totalAmount = total.querySelector<HTMLElement>('strong');
  if (totalLabel) totalLabel.textContent = 'Valor total a cancelar';
  if (totalAmount) totalAmount.textContent = money(totalValue);
}

function patchImportDetail(data: ImportDetail) {
  lockBoxCards(data.stateCode === 'QUOTATION');
  patchImportSummary(data);
}

function detailFingerprint() {
  const page = document.querySelector<HTMLElement>('.import-detail-page');
  if (!page) return '';
  const badge = page.querySelector<HTMLElement>('.page-actions .status-badge')?.textContent ?? '';
  const summary =
    page.querySelector<HTMLElement>('.summary-strip.import-cost-summary')?.textContent ?? '';
  return `${location.pathname}|${badge}|${summary}`;
}

async function refreshDetailIfNeeded() {
  const importId = currentImportId();
  if (!importId) {
    lastDetailId = null;
    lastDetailFingerprint = '';
    return;
  }
  if (!document.querySelector('.import-detail-page')) return;

  lockBoxesFromVisibleState();
  const fingerprint = detailFingerprint();
  if (importId === lastDetailId && fingerprint === lastDetailFingerprint) return;
  if (detailLoading) return;

  detailLoading = true;
  try {
    const data = await getImport(importId);
    patchImportDetail(data);
    lastDetailId = importId;
    lastDetailFingerprint = detailFingerprint();
  } catch {
    // La interfaz React original permanece disponible si esta mejora no puede cargar datos.
  } finally {
    detailLoading = false;
  }
}

function run() {
  moveDniPanelBeforeSummary();
  patchNewImportValidation();
  void refreshDetailIfNeeded();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    run();
  });
}

export function installImportFinalPolish() {
  if (document.documentElement.dataset.importFinalPolish === 'true') return;
  document.documentElement.dataset.importFinalPolish = 'true';
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('input', schedule, true);
  document.addEventListener('change', schedule, true);
  document.addEventListener('click', schedule, true);
  window.addEventListener('popstate', schedule);
  schedule();
}
