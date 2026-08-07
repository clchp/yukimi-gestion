import type { ImportBoxStateCode, ImportDetail, ImportStateCode } from '@yukimi/shared';
import {
  advanceImport,
  advanceImportBox,
  getImport,
} from '../features/imports/imports-api';

const importFlow: ImportStateCode[] = [
  'QUOTATION',
  'PURCHASE_CONFIRMED',
  'FOREIGN_WAREHOUSE',
  'DISPATCH_CONFIRMED',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVED_PERU',
  'STOCKED',
];

const boxFlow: ImportBoxStateCode[] = [
  'REGISTERED',
  'FOREIGN_WAREHOUSE',
  'DISPATCH_CONFIRMED',
  'SHIPPED',
  'IN_TRANSIT',
  'RECEIVED_PERU',
  'STOCKED',
];

const labels: Record<string, string> = {
  QUOTATION: 'Cotización',
  PURCHASE_CONFIRMED: 'Compra confirmada',
  REGISTERED: 'Registrada',
  FOREIGN_WAREHOUSE: 'En almacén internacional',
  DISPATCH_CONFIRMED: 'Despacho confirmado',
  SHIPPED: 'Embarcada',
  IN_TRANSIT: 'En tránsito',
  RECEIVED_PERU: 'Recibida en Perú',
  STOCKED: 'Ingresada a stock',
  CANCELLED: 'Cancelada',
};

const help: Record<string, string> = {
  QUOTATION: 'La compra todavía está siendo evaluada.',
  PURCHASE_CONFIRMED: 'La compra fue confirmada con el proveedor.',
  FOREIGN_WAREHOUSE: 'Las cajas llegaron al almacén internacional.',
  DISPATCH_CONFIRMED: 'El operador confirmó el despacho de las cajas.',
  SHIPPED: 'Las cajas fueron embarcadas y salieron del origen.',
  IN_TRANSIT: 'Las cajas están viajando hacia Perú.',
  RECEIVED_PERU: 'Las cajas llegaron físicamente a Perú.',
  STOCKED: 'Las cantidades fueron confirmadas e ingresadas a inventario.',
};

const boxActionLabels: Partial<Record<ImportBoxStateCode, string>> = {
  REGISTERED: 'Confirmar llegada al almacén internacional',
  FOREIGN_WAREHOUSE: 'Confirmar despacho',
  DISPATCH_CONFIRMED: 'Confirmar embarque',
  SHIPPED: 'Marcar como en tránsito',
  IN_TRANSIT: 'Confirmar llegada a Perú',
  RECEIVED_PERU: 'Revisar cantidades e ingresar a stock',
};

const boxActionHelp: Partial<Record<ImportBoxStateCode, string>> = {
  REGISTERED: 'Confirma que esta caja llegó al almacén internacional.',
  FOREIGN_WAREHOUSE: 'Confirma que el operador despachó esta caja.',
  DISPATCH_CONFIRMED: 'Confirma que esta caja fue embarcada.',
  SHIPPED: 'Marca la caja como en tránsito cuando haya iniciado el viaje.',
  IN_TRANSIT: 'Confirma la llegada física de esta caja a Perú.',
  RECEIVED_PERU: 'Verifica cantidades, faltantes y almacén antes de ingresar a stock.',
};

let scheduled = false;
let rendering = false;
let syncingParent = false;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function currentImportId() {
  return location.pathname.match(/^\/importaciones\/([0-9a-f-]+)$/i)?.[1] ?? null;
}

function panelByTitle(title: string) {
  return [...document.querySelectorAll<HTMLElement>('.import-detail-page .panel')].find(
    (panel) => panel.querySelector('.panel-heading h2')?.textContent?.trim() === title,
  );
}

function activeBoxes(data: ImportDetail) {
  return data.boxes.filter((box) => box.stateCode !== 'CANCELLED');
}

function boxIndex(state: string) {
  return boxFlow.indexOf(state as ImportBoxStateCode);
}

function nextBoxTransition(box: ImportDetail['boxes'][number]) {
  return box.allowedTransitions.find(
    (transition) =>
      transition.stateCode !== 'CANCELLED' && transition.stateCode !== 'STOCKED',
  );
}

function overallLabel(data: ImportDetail) {
  if (data.stateCode === 'CANCELLED') return 'Cancelada';
  if (data.stateCode === 'QUOTATION') return 'Cotización';
  const boxes = activeBoxes(data);
  if (boxes.length === 0) return labels[data.stateCode] ?? data.stateCode;
  const indices = boxes.map((box) => boxIndex(box.stateCode)).filter((index) => index >= 0);
  if (indices.length === 0) return labels[data.stateCode] ?? data.stateCode;
  const min = Math.min(...indices);
  const max = Math.max(...indices);
  if (min === max) return labels[boxFlow[max] ?? data.stateCode] ?? data.stateCode;
  const countAtMax = indices.filter((index) => index === max).length;
  return `Avance parcial — ${countAtMax} de ${boxes.length} cajas en ${labels[
    boxFlow[max] ?? ''
  ]?.toLocaleLowerCase('es-PE')}`;
}

function updateHeaderBadge(data: ImportDetail) {
  const badge = document.querySelector<HTMLElement>(
    '.import-detail-page .page-actions .status-badge',
  );
  if (!badge) return;
  const dot = badge.querySelector('.status-dot');
  badge.replaceChildren();
  if (dot) badge.append(dot);
  badge.append(document.createTextNode(overallLabel(data)));
}

function timelineStep(
  state: ImportStateCode,
  index: number,
  data: ImportDetail,
  boxes: ImportDetail['boxes'],
) {
  const row = node('div', 'flow-step import-smart-flow-step');
  const marker = node('span', 'flow-step-marker');
  const copy = node('div');
  const title = node('strong', '', labels[state] ?? state);
  const description = node('small');

  if (state === 'QUOTATION' || state === 'PURCHASE_CONFIRMED') {
    const current = importFlow.indexOf(data.stateCode);
    const reached = state === 'QUOTATION' || current >= importFlow.indexOf(state);
    const complete = state === 'QUOTATION' ? current > 0 : reached;
    if (complete) {
      row.classList.add('complete');
      marker.textContent = '✓';
    } else {
      row.classList.add('current');
      marker.textContent = String(index + 1);
    }
    description.textContent = help[state] ?? '';
  } else {
    const required = boxIndex(state);
    const reached = boxes.filter((box) => boxIndex(box.stateCode) >= required).length;
    const complete = boxes.length > 0 && reached === boxes.length;
    const partial = reached > 0 && reached < boxes.length;
    if (complete) {
      row.classList.add('complete');
      marker.textContent = '✓';
      description.textContent =
        boxes.length === 1
          ? `La caja alcanzó la etapa “${labels[state]}”.`
          : `Las ${boxes.length} cajas alcanzaron esta etapa.`;
    } else if (partial) {
      row.classList.add('partial', 'current');
      marker.textContent = `${reached}/${boxes.length}`;
      description.textContent = `${reached} de ${boxes.length} cajas alcanzaron esta etapa.`;
    } else {
      const previousState = importFlow[index - 1];
      const previousRequired = previousState ? boxIndex(previousState) : -1;
      const previousReached =
        previousRequired < 0 ||
        boxes.every((box) => boxIndex(box.stateCode) >= previousRequired);
      if (previousReached) row.classList.add('current');
      marker.textContent = String(index + 1);
      description.textContent = help[state] ?? '';
    }
  }

  copy.append(title, description);
  row.append(marker, copy);
  return row;
}

function renderTimeline(data: ImportDetail) {
  const panel = panelByTitle('Flujo de la importación');
  if (!panel) return;
  panel.classList.add('import-smart-flow-panel');
  const subtitle = panel.querySelector<HTMLElement>('.panel-heading p');
  if (subtitle) {
    subtitle.textContent =
      'Confirma la compra una sola vez. Después, el recorrido se controla desde las cajas y este resumen se actualiza automáticamente.';
  }
  panel.querySelector('.import-smart-timeline')?.remove();
  const timeline = node('div', 'flow-timeline import-smart-timeline');
  const boxes = activeBoxes(data);
  importFlow.forEach((state, index) => {
    timeline.append(timelineStep(state, index, data, boxes));
  });
  panel.append(timeline);
}

function findOriginalButton(panel: HTMLElement, text: string) {
  return [...panel.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes(text),
  );
}

function boxCard(code: string) {
  return [...document.querySelectorAll<HTMLElement>('.import-box-card')].find(
    (card) => card.querySelector('h3')?.textContent?.trim() === code,
  );
}

function scrollToBox(code: string) {
  const card = boxCard(code);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.remove('import-box-focus');
  window.requestAnimationFrame(() => card.classList.add('import-box-focus'));
  window.setTimeout(() => card.classList.remove('import-box-focus'), 2400);
}

function showNotice(message: string, tone: 'success' | 'error' = 'success') {
  document.querySelector('.import-smart-workflow-notice')?.remove();
  const notice = node(
    'div',
    `import-reconciliation-runtime-notice ${tone} import-smart-workflow-notice`,
    message,
  );
  notice.setAttribute('role', 'status');
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 5200);
}

async function synchronizeParent(data: ImportDetail) {
  if (syncingParent) return;
  if (
    data.stateCode === 'QUOTATION' ||
    data.stateCode === 'CANCELLED' ||
    data.stateCode === 'STOCKED'
  ) {
    return;
  }
  const boxes = activeBoxes(data);
  if (boxes.length === 0) return;
  const minimumBoxIndex = Math.min(...boxes.map((box) => boxIndex(box.stateCode)));
  if (minimumBoxIndex <= 0) return;
  const targetState = boxFlow[minimumBoxIndex] as ImportStateCode | undefined;
  if (!targetState || targetState === 'STOCKED') return;
  let currentIndex = importFlow.indexOf(data.stateCode);
  const targetIndex = importFlow.indexOf(targetState);
  if (currentIndex < 0 || targetIndex <= currentIndex) return;

  syncingParent = true;
  try {
    for (let index = currentIndex + 1; index <= targetIndex; index += 1) {
      const nextStateCode = importFlow[index];
      if (!nextStateCode) continue;
      await advanceImport(data.id, {
        nextStateCode,
        reason: 'Sincronización automática según el avance confirmado de todas las cajas.',
        occurredAt: new Date().toISOString(),
        masterTrackingNumber: data.masterTrackingNumber,
      });
      currentIndex = index;
    }
  } catch {
    // El resumen visual depende de las cajas; la sincronización técnica se reintentará después.
  } finally {
    syncingParent = false;
  }
}

function createBulkDialog(
  data: ImportDetail,
  boxes: ImportDetail['boxes'],
  transition: NonNullable<ReturnType<typeof nextBoxTransition>>,
) {
  document.querySelector('.import-smart-bulk-backdrop')?.remove();
  const backdrop = node('div', 'app-modal-backdrop import-smart-bulk-backdrop');
  const form = node('form', 'app-modal-card import-smart-bulk-modal');
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-modal', 'true');

  const header = node('header', 'app-modal-header');
  const headerCopy = node('div');
  headerCopy.append(
    node('span', 'eyebrow', 'Acción masiva'),
    node('h2', '', `Avanzar ${boxes.length} cajas a ${transition.name}`),
    node(
      'p',
      '',
      `Se actualizarán: ${boxes.map((box) => box.code).join(', ')}.`,
    ),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  header.append(headerCopy, close);

  const field = node('label', 'field');
  field.append(node('span', '', 'Motivo o evidencia *'));
  const textarea = node('textarea');
  textarea.rows = 4;
  textarea.placeholder = 'Ej. Confirmación recibida del operador…';
  const error = node('small', 'field-error');
  field.append(textarea, error);

  const note = node('div', 'context-note');
  note.textContent =
    'La acción cambia realmente cada caja. El estado general se actualizará solo cuando todas alcancen la misma etapa.';

  const actions = node('footer', 'app-modal-actions');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  const confirm = node('button', 'button button-primary', `Avanzar ${boxes.length} cajas`);
  confirm.type = 'submit';
  actions.append(cancel, confirm);
  form.append(header, note, field, actions);
  backdrop.append(form);
  document.body.append(backdrop);
  textarea.focus();

  const dismiss = () => backdrop.remove();
  close.addEventListener('click', dismiss);
  cancel.addEventListener('click', dismiss);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) dismiss();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const reason = textarea.value.trim();
    if (reason.length < 5) {
      error.textContent = 'Escribe un motivo de al menos 5 caracteres.';
      field.classList.add('field-invalid');
      return;
    }
    confirm.disabled = true;
    cancel.disabled = true;
    confirm.textContent = 'Actualizando cajas…';
    void (async () => {
      try {
        for (const box of boxes) {
          await advanceImportBox(box.id, {
            nextStateCode: transition.stateCode,
            reason,
            occurredAt: new Date().toISOString(),
            trackingNumber: box.trackingNumber,
          });
        }
        const refreshed = await getImport(data.id);
        await synchronizeParent(refreshed);
        dismiss();
        showNotice(`${boxes.length} cajas fueron actualizadas correctamente.`);
        window.setTimeout(() => location.reload(), 450);
      } catch (caught) {
        confirm.disabled = false;
        cancel.disabled = false;
        confirm.textContent = `Avanzar ${boxes.length} cajas`;
        error.textContent =
          caught instanceof Error
            ? caught.message
            : 'No se pudieron actualizar todas las cajas. Revisa su estado actual.';
        field.classList.add('field-invalid');
      }
    })();
  });
}

function actionSummary(data: ImportDetail, boxes: ImportDetail['boxes']) {
  const summary = node('div', 'import-smart-action-summary');
  if (boxes.length === 0) return summary;
  const counts = new Map<string, number>();
  boxes.forEach((box) => counts.set(box.stateCode, (counts.get(box.stateCode) ?? 0) + 1));
  [...counts.entries()]
    .sort(([left], [right]) => boxIndex(right) - boxIndex(left))
    .forEach(([state, count]) => {
      const item = node('span');
      item.append(node('strong', '', String(count)), document.createTextNode(` ${labels[state]}`));
      summary.append(item);
    });
  return summary;
}

function priorityBox(boxes: ImportDetail['boxes']) {
  return (
    boxes.find((box) => box.stateCode === 'RECEIVED_PERU') ??
    [...boxes]
      .filter((box) => box.stateCode !== 'STOCKED')
      .sort((left, right) => boxIndex(left.stateCode) - boxIndex(right.stateCode))[0] ??
    boxes[0]
  );
}

function renderActionPanel(data: ImportDetail) {
  const panel = panelByTitle('Siguiente acción');
  if (!panel) return;
  panel.classList.add('import-smart-action-panel');
  const subtitle = panel.querySelector<HTMLElement>('.panel-heading p');
  if (subtitle) subtitle.textContent = 'La acción superior orienta; las cajas guardan el avance real.';
  panel.querySelector('.import-smart-action-body')?.remove();
  const body = node('div', 'import-smart-action-body');
  const boxes = activeBoxes(data);

  if (data.stateCode === 'CANCELLED') {
    body.append(node('div', 'empty-state', 'La importación está cancelada.'));
  } else if (data.stateCode === 'QUOTATION') {
    body.append(
      node(
        'p',
        'import-smart-action-copy',
        'Primero confirma la compra con el proveedor. Después, el recorrido se manejará desde las cajas.',
      ),
    );
    const button = node('button', 'button button-primary button-full', 'Confirmar compra');
    button.type = 'button';
    button.addEventListener('click', () =>
      findOriginalButton(panel, 'Compra confirmada')?.click(),
    );
    body.append(button);
  } else if (boxes.length === 0) {
    body.append(node('div', 'empty-state', 'No hay cajas activas para continuar.'));
  } else if (boxes.every((box) => box.stateCode === 'STOCKED')) {
    const final = node('div', 'empty-state');
    final.append(
      node('strong', '', 'Flujo finalizado'),
      node('p', '', 'Todas las cajas fueron recibidas e ingresadas correctamente.'),
    );
    body.append(final);
  } else if (boxes.length === 1) {
    const box = boxes[0];
    if (!box) return;
    body.append(
      node('strong', 'import-smart-action-title', `Continúa desde ${box.code}`),
      node(
        'p',
        'import-smart-action-copy',
        boxActionHelp[box.stateCode] ?? 'Revisa el estado y la siguiente acción de la caja.',
      ),
    );
    const button = node('button', 'button button-primary button-full', `Gestionar ${box.code}`);
    button.type = 'button';
    button.addEventListener('click', () => scrollToBox(box.code));
    body.append(button);
  } else {
    const states = new Set(boxes.map((box) => box.stateCode));
    body.append(actionSummary(data, boxes));
    if (states.size === 1) {
      const first = boxes[0];
      if (!first) return;
      if (first.stateCode === 'RECEIVED_PERU') {
        body.append(
          node(
            'p',
            'import-smart-action-copy',
            `Las ${boxes.length} cajas llegaron a Perú. Confirma las cantidades de cada una antes de ingresarlas a stock.`,
          ),
        );
        const review = node(
          'button',
          'button button-primary button-full',
          `Revisar ${boxes.length} cajas`,
        );
        review.type = 'button';
        review.addEventListener('click', () => scrollToBox(first.code));
        body.append(review);
      } else {
        const transition = nextBoxTransition(first);
        if (transition) {
          body.append(
            node(
              'p',
              'import-smart-action-copy',
              `Las ${boxes.length} cajas están en “${labels[first.stateCode]}”. Puedes avanzarlas juntas porque comparten el mismo estado.`,
            ),
          );
          const bulk = node(
            'button',
            'button button-primary button-full',
            `Avanzar ${boxes.length} cajas a ${transition.name}`,
          );
          bulk.type = 'button';
          bulk.addEventListener('click', () => createBulkDialog(data, boxes, transition));
          const individual = node(
            'button',
            'button button-secondary button-full',
            'Gestionar individualmente',
          );
          individual.type = 'button';
          individual.addEventListener('click', () => scrollToBox(first.code));
          body.append(bulk, individual);
        }
      }
    } else {
      const target = priorityBox(boxes);
      body.append(
        node(
          'p',
          'import-smart-action-copy',
          'Las cajas están en etapas diferentes. Continúa con la caja que requiere atención; el resumen se actualizará automáticamente.',
        ),
      );
      const review = node(
        'button',
        'button button-primary button-full',
        'Revisar cajas pendientes',
      );
      review.type = 'button';
      review.addEventListener('click', () => target && scrollToBox(target.code));
      body.append(review);
    }
  }

  const originalCancel = findOriginalButton(panel, 'Cancelar importación');
  if (originalCancel && data.stateCode !== 'CANCELLED' && data.stateCode !== 'STOCKED') {
    const cancel = node('button', 'button button-danger button-full', 'Cancelar importación');
    cancel.type = 'button';
    cancel.addEventListener('click', () => originalCancel.click());
    body.append(cancel);
  }
  panel.append(body);
}

function renderBoxGuidance(data: ImportDetail) {
  data.boxes.forEach((box) => {
    const card = boxCard(box.code);
    if (!card) return;
    card.dataset.importBoxId = box.id;
    card.querySelector('.import-box-next-step')?.remove();
    const footer = card.querySelector<HTMLElement>('.import-box-actions');
    if (!footer) return;

    if (box.stateCode !== 'STOCKED' && box.stateCode !== 'CANCELLED') {
      const guide = node('div', 'import-box-next-step');
      guide.append(
        node('strong', '', 'Siguiente paso'),
        node('span', '', boxActionHelp[box.stateCode] ?? 'Revisa la acción disponible.'),
      );
      footer.before(guide);
    }

    const receive = [...footer.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Recibir e ingresar'),
    );
    if (receive) receive.textContent = 'Revisar cantidades e ingresar a stock';

    const advance = [...footer.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Avanzar a'),
    );
    const label = boxActionLabels[box.stateCode];
    if (advance && label) advance.textContent = label;
  });
}

async function renderSmartWorkflow() {
  const importId = currentImportId();
  if (!importId || rendering) return;
  if (!document.querySelector('.import-detail-page')) return;
  rendering = true;
  try {
    const data = await getImport(importId);
    updateHeaderBadge(data);
    renderTimeline(data);
    renderActionPanel(data);
    renderBoxGuidance(data);
    void synchronizeParent(data);
  } catch {
    // La página React conserva su interfaz original si no se puede cargar el resumen mejorado.
  } finally {
    rendering = false;
  }
}

function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    void renderSmartWorkflow();
  }, 180);
}

export function installImportSmartWorkflow() {
  if (document.documentElement.dataset.importSmartWorkflow === 'true') return;
  document.documentElement.dataset.importSmartWorkflow = 'true';
  new MutationObserver(scheduleRender).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', scheduleRender);
  scheduleRender();
}
