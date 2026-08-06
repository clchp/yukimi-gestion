import { advanceImport, getImport } from '../features/imports/imports-api';

const reconciliationClearedKey = 'yukimi:bank-reconciliation:cleared';

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
  document.querySelector('.import-reconciliation-runtime-notice')?.remove();
  const notice = node(
    'div',
    `import-reconciliation-runtime-notice ${tone === 'error' ? 'error' : 'success'}`,
    message,
  );
  notice.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 5200);
}

function ensureReconciliationEmptyState(main: HTMLElement, controls: HTMLElement) {
  main.classList.add('reconciliation-cleared');
  let empty = main.querySelector<HTMLElement>('.runtime-reconciliation-empty');
  if (!empty) {
    empty = node(
      'div',
      'empty-state runtime-reconciliation-empty',
      'No hay un archivo abierto. El lote importado sigue guardado y puedes seleccionarlo nuevamente cuando lo necesites.',
    );
    controls.after(empty);
  } else {
    empty.textContent =
      'No hay un archivo abierto. El lote importado sigue guardado y puedes seleccionarlo nuevamente cuando lo necesites.';
  }
}

function forceClearedSelection(
  main: HTMLElement,
  controls: HTMLElement,
  select: HTMLSelectElement,
) {
  if (sessionStorage.getItem(reconciliationClearedKey) !== 'true') return;
  if (select.value !== '') select.value = '';
  ensureReconciliationEmptyState(main, controls);
}

function enhanceReconciliationSelection() {
  if (location.pathname !== '/bancos/conciliacion') return;
  const main = document.querySelector<HTMLElement>('main.page');
  const controls = main?.querySelector<HTMLElement>('.reconciliation-controls');
  if (!main || !controls) return;

  const labels = [...controls.querySelectorAll<HTMLLabelElement>('label.field')];
  const fileLabel = labels.find((label) =>
    label.querySelector('span')?.textContent?.toLocaleLowerCase('es').includes('archivo'),
  );
  const select = fileLabel?.querySelector<HTMLSelectElement>('select');
  const clear = fileLabel?.querySelector<HTMLButtonElement>('.reconciliation-clear-button');
  if (!fileLabel || !select || !clear) return;

  clear.title = 'Cerrar el lote actual sin eliminarlo';
  clear.setAttribute('aria-label', 'Cerrar el lote actual sin eliminarlo');

  if (clear.dataset.finalSelectionBound !== 'true') {
    clear.dataset.finalSelectionBound = 'true';
    clear.addEventListener(
      'click',
      () => {
        sessionStorage.setItem(reconciliationClearedKey, 'true');
        forceClearedSelection(main, controls, select);
        [0, 60, 180, 420].forEach((delay) => {
          window.setTimeout(() => forceClearedSelection(main, controls, select), delay);
        });
      },
      { capture: true },
    );
  }

  if (select.dataset.finalSelectionBound !== 'true') {
    select.dataset.finalSelectionBound = 'true';
    select.addEventListener('change', () => {
      if (select.value) {
        sessionStorage.removeItem(reconciliationClearedKey);
        main.classList.remove('reconciliation-cleared');
        main.querySelector('.runtime-reconciliation-empty')?.remove();
      }
    });
  }

  forceClearedSelection(main, controls, select);
}

function enhanceImportPresentation() {
  const match = location.pathname.match(/^\/importaciones\/([0-9a-f-]+)$/i);
  if (!match) return;
  const main = document.querySelector<HTMLElement>('main.import-detail-page');
  if (!main) return;

  main.querySelectorAll<HTMLElement>('.summary-strip span').forEach((label) => {
    if (label.textContent?.trim() === 'Diferencia no recibida') {
      label.textContent = 'Valor pendiente de recibir';
    }
  });

  main.querySelectorAll<HTMLElement>('.import-box-card').forEach((card) => {
    card.classList.add('import-box-contained');
    card.querySelectorAll<HTMLElement>('strong').forEach((value) => {
      if (value.textContent?.includes(',')) {
        value.textContent = value.textContent.replace(/,\s*/g, ', ');
      }
    });
  });

  const preorder = main.querySelector<HTMLElement>('.import-preorder-disclosure');
  if (preorder) preorder.classList.add('import-preorder-visible-menu');

  preorder?.querySelectorAll<HTMLElement>('.searchable-select').forEach((select) => {
    const label = select.querySelector<HTMLElement>('.searchable-select-label')?.textContent ?? '';
    if (!label.toLocaleLowerCase('es').includes('preventa pendiente')) return;
    select.querySelectorAll<HTMLElement>('.searchable-select-empty').forEach((empty) => {
      empty.textContent = 'No hay preventas pendientes compatibles con esta variante.';
    });
  });
}

let partialReceiptBusy = false;

async function preparePartialReceipt(button: HTMLButtonElement) {
  if (partialReceiptBusy) return;
  const match = location.pathname.match(/^\/importaciones\/([0-9a-f-]+)$/i);
  if (!match) return;
  partialReceiptBusy = true;
  const originalDisabled = button.disabled;
  button.disabled = true;
  try {
    const importId = match[1]!;
    const detail = await getImport(importId);
    if (detail.stateCode === 'IN_TRANSIT') {
      await advanceImport(importId, {
        nextStateCode: 'RECEIVED_PERU',
        reason: 'Recepción parcial iniciada desde una caja recibida en Perú.',
        occurredAt: new Date().toISOString(),
        masterTrackingNumber: null,
      });
    }
    button.dataset.partialReceiptPrepared = 'true';
    button.disabled = originalDisabled;
    button.click();
  } catch (error) {
    button.disabled = originalDisabled;
    showNotice(
      error instanceof Error
        ? error.message
        : 'No se pudo preparar la importación para recibir esta caja.',
      'error',
    );
  } finally {
    partialReceiptBusy = false;
  }
}

function bindPartialReceiptGuard() {
  if (document.documentElement.dataset.partialReceiptGuardInstalled === 'true') return;
  document.documentElement.dataset.partialReceiptGuardInstalled = 'true';
  document.addEventListener(
    'click',
    (event) => {
      if (!location.pathname.match(/^\/importaciones\/[0-9a-f-]+$/i)) return;
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button?.textContent?.includes('Recibir e ingresar caja a stock')) return;
      if (button.dataset.partialReceiptPrepared === 'true') {
        delete button.dataset.partialReceiptPrepared;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void preparePartialReceipt(button);
    },
    true,
  );
}

function runFinalFixes() {
  enhanceReconciliationSelection();
  enhanceImportPresentation();
}

export function installImportReconciliationFinalFixes() {
  if (document.documentElement.dataset.importReconciliationFinalFixes === 'true') return;
  document.documentElement.dataset.importReconciliationFinalFixes = 'true';
  bindPartialReceiptGuard();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      runFinalFixes();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
