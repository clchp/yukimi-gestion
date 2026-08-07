import type { ImportStateCode } from '@yukimi/shared';
import { advanceImport, getImport } from '../features/imports/imports-api';

const shipmentFlow: ImportStateCode[] = [
  'QUOTATION',
  'PURCHASE_CONFIRMED',
  'FOREIGN_WAREHOUSE',
  'DISPATCH_CONFIRMED',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVED_PERU',
  'STOCKED',
];

let preparingReceipt = false;

function importIdFromPath() {
  return location.pathname.match(/^\/importaciones\/([0-9a-f-]+)$/i)?.[1] ?? null;
}

function showNotice(message: string) {
  document.querySelector('.import-parent-sync-notice')?.remove();
  const notice = document.createElement('div');
  notice.className = 'import-reconciliation-runtime-notice error import-parent-sync-notice';
  notice.setAttribute('role', 'alert');
  notice.textContent = message;
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 6200);
}

async function ensureParentReadyForReceipt(importId: string) {
  let detail = await getImport(importId);
  if (detail.stateCode === 'RECEIVED_PERU' || detail.stateCode === 'STOCKED') return;
  if (detail.stateCode === 'CANCELLED') {
    throw new Error('La importación está cancelada y no puede recibir cajas.');
  }

  const hasArrivedBox = detail.boxes.some((box) =>
    ['RECEIVED_PERU', 'STOCKED'].includes(box.stateCode),
  );
  if (!hasArrivedBox) {
    throw new Error('Marca primero la caja como recibida en Perú.');
  }

  const currentIndex = shipmentFlow.indexOf(detail.stateCode);
  const targetIndex = shipmentFlow.indexOf('RECEIVED_PERU');
  if (currentIndex < 0 || currentIndex > targetIndex) {
    throw new Error('No se pudo determinar el estado general de la importación.');
  }

  for (let index = currentIndex + 1; index <= targetIndex; index += 1) {
    const nextStateCode = shipmentFlow[index];
    if (!nextStateCode) continue;
    await advanceImport(importId, {
      nextStateCode,
      reason:
        nextStateCode === 'RECEIVED_PERU'
          ? 'Sincronización automática por recepción física de una caja.'
          : 'Sincronización automática del avance general según el estado de las cajas.',
      occurredAt: new Date().toISOString(),
      masterTrackingNumber: detail.masterTrackingNumber,
    });
    detail = await getImport(importId);
  }
}

function isReceiptConfirmationForm(form: HTMLFormElement) {
  const title = form.querySelector('h2')?.textContent?.trim() ?? '';
  return title.startsWith('Recibir CJA-');
}

export function installImportParentReceiptSync() {
  if (document.documentElement.dataset.importParentReceiptSync === 'true') return;
  document.documentElement.dataset.importParentReceiptSync = 'true';

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const importId = importIdFromPath();
      if (!importId || !isReceiptConfirmationForm(form)) return;

      if (form.dataset.parentReceiptPrepared === 'true') {
        delete form.dataset.parentReceiptPrepared;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (preparingReceipt) return;
      preparingReceipt = true;

      const submitEvent = event as SubmitEvent;
      const submitter =
        submitEvent.submitter instanceof HTMLButtonElement ? submitEvent.submitter : undefined;
      const originalText = submitter?.textContent ?? '';
      if (submitter) {
        submitter.disabled = true;
        submitter.textContent = 'Preparando recepción…';
      }

      void ensureParentReadyForReceipt(importId)
        .then(() => {
          form.dataset.parentReceiptPrepared = 'true';
          if (submitter) {
            submitter.disabled = false;
            submitter.textContent = originalText;
          }
          form.requestSubmit(submitter);
        })
        .catch((error: unknown) => {
          if (submitter) {
            submitter.disabled = false;
            submitter.textContent = originalText;
          }
          showNotice(
            error instanceof Error
              ? error.message
              : 'No se pudo preparar la importación para recibir esta caja.',
          );
        })
        .finally(() => {
          preparingReceipt = false;
        });
    },
    true,
  );
}
