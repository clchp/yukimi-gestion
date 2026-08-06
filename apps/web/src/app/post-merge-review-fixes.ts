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

function inputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function saleDraftKey() {
  const match = location.pathname.match(/^\/ventas\/borradores\/([0-9a-f-]+)/i);
  return match ? `yukimi:vip-deposit-due:${match[1]}` : 'yukimi:vip-deposit-due:new';
}

function removeInventoryContextCard() {
  if (location.pathname !== '/inventario') return;
  const form = document.querySelector<HTMLFormElement>(
    'form[aria-labelledby="inventory-movement-title"]',
  );
  form?.querySelector<HTMLElement>(':scope > .context-note')?.remove();
}

function normalizePartnerLabels() {
  const navigation = document.querySelector<HTMLButtonElement>('[data-final-partners-nav]');
  if (navigation && navigation.dataset.reviewLabelled !== 'true') {
    navigation.dataset.reviewLabelled = 'true';
    const icon = node('span', 'review-settings-nav-icon', '🚚');
    icon.setAttribute('aria-hidden', 'true');
    navigation.replaceChildren(icon, document.createTextNode('Agencias y motorizados'));
  }

  document.querySelectorAll<HTMLButtonElement>('.final-quick-partner-button').forEach((button) => {
    if (button.textContent?.trim() !== '+ Agregar') button.textContent = '+ Agregar';
  });

  document
    .querySelectorAll<HTMLButtonElement>('.settings-partner-create-actions button')
    .forEach((button) => {
      const current = button.textContent?.toLocaleLowerCase('es-PE') ?? '';
      if (current.includes('agencia') && button.textContent !== '+ Agregar agencia') {
        button.textContent = '+ Agregar agencia';
      }
      if (current.includes('motorizado') && button.textContent !== '+ Agregar motorizado') {
        button.textContent = '+ Agregar motorizado';
      }
    });

  document.querySelectorAll<HTMLElement>('.final-partner-modal .eyebrow').forEach((eyebrow) => {
    if (eyebrow.textContent?.trim() === 'Nuevo operador') eyebrow.textContent = 'Agregar operador';
  });
  document
    .querySelectorAll<HTMLButtonElement>('.final-partner-modal button[type="submit"]')
    .forEach((button) => {
      if (button.textContent?.trim() === 'Crear operador') button.textContent = 'Agregar operador';
    });
}

function enhanceVipHelp() {
  if (!/^\/clientes\/[0-9a-f-]+$/i.test(location.pathname)) return;
  const modal = [...document.querySelectorAll<HTMLElement>('.modal-card')].find((candidate) =>
    candidate.textContent?.includes('condición VIP'),
  );
  if (!modal) return;

  modal.querySelectorAll<HTMLElement>('.alert.alert-info').forEach((alert) => {
    if (alert.textContent?.includes('El adelanto mínimo se acuerda en cada venta')) alert.remove();
  });

  const checkbox = [...modal.querySelectorAll<HTMLLabelElement>('label.checkbox-field')].find((label) =>
    label.textContent?.includes('Puede negociarse una separación sin adelanto'),
  );
  if (!checkbox || checkbox.querySelector('.final-info-tip')) return;

  const tip = node('button', 'final-info-tip', 'ⓘ');
  tip.type = 'button';
  tip.title =
    'El adelanto mínimo se acuerda en cada venta. Activa esta opción para permitir que el adelanto negociado pueda ser S/ 0.';
  tip.setAttribute('aria-label', tip.title);
  tip.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  checkbox.append(tip);
}

function enhanceVipDepositDeadline() {
  if (!/^\/ventas\/(nueva|borradores\/)/i.test(location.pathname)) return;
  const minimumLabel = [...document.querySelectorAll<HTMLLabelElement>('label.field')].find((label) =>
    label.querySelector(':scope > span')?.textContent?.includes('Adelanto mínimo acordado'),
  );
  const minimumInput = minimumLabel?.querySelector<HTMLInputElement>('input[type="number"]');
  const grid = minimumLabel?.parentElement;
  if (!minimumLabel || !minimumInput || !grid) return;

  if (minimumInput.dataset.reviewDeadlineBound !== 'true') {
    minimumInput.dataset.reviewDeadlineBound = 'true';
    minimumInput.addEventListener('input', () => queuePostMergeFixes());
    minimumInput.addEventListener('change', () => queuePostMergeFixes());
  }

  const amount = Number(minimumInput.value || 0);
  const existing = grid.querySelector<HTMLLabelElement>('.pending-vip-deposit-due');
  if (!(amount > 0)) {
    existing?.remove();
    localStorage.removeItem(saleDraftKey());
    return;
  }
  if (existing) return;

  const label = node('label', 'field pending-vip-deposit-due');
  label.append(node('span', '', 'Fecha límite del adelanto *'));
  const input = node('input');
  input.type = 'date';
  input.required = true;
  input.min = inputDate(new Date());
  input.value = localStorage.getItem(saleDraftKey()) ?? '';
  input.addEventListener('change', () => {
    if (input.value) localStorage.setItem(saleDraftKey(), input.value);
    else localStorage.removeItem(saleDraftKey());
  });
  label.append(
    input,
    node('small', '', 'Se exige únicamente cuando el adelanto acordado es mayor que S/ 0.'),
  );
  minimumLabel.after(label);
}

function paymentMethodRequiresProof(select: HTMLSelectElement) {
  const option = select.selectedOptions[0];
  return option?.textContent?.toLocaleLowerCase('es-PE').includes('constancia') ?? false;
}

function enhancePaymentProofUx() {
  if (!/^\/ventas\/[0-9a-f-]+$/i.test(location.pathname)) return;
  const form = document.querySelector<HTMLFormElement>('form.payment-form');
  if (form) {
    const methodSelects = [...form.querySelectorAll<HTMLSelectElement>('.payment-part-row select')].filter(
      (select) => select.closest('.field')?.querySelector(':scope > span')?.textContent?.trim() === 'Medio',
    );
    const proofField = [...form.querySelectorAll<HTMLLabelElement>('label.field')].find(
      (label) => label.querySelector(':scope > span')?.textContent?.trim().startsWith('Constancia'),
    );
    const requiresProof = methodSelects.some(paymentMethodRequiresProof);
    if (proofField) {
      proofField.classList.toggle('review-payment-proof-hidden', !requiresProof);
      const title = proofField.querySelector<HTMLElement>(':scope > span');
      if (title) title.textContent = 'Constancia requerida *';
    }
    methodSelects.forEach((select) => {
      if (select.dataset.reviewProofBound === 'true') return;
      select.dataset.reviewProofBound = 'true';
      select.addEventListener('change', () => queuePostMergeFixes());
    });
  }

  document.querySelectorAll<HTMLElement>('.payment-card').forEach((card) => {
    const state = card.querySelector<HTMLElement>('.status-badge')?.textContent?.trim();
    if (state !== 'PENDING') return;
    const confirm = card.querySelector<HTMLButtonElement>('button[title="Confirmar"]');
    const reject = card.querySelector<HTMLButtonElement>('button[title="Rechazar"]');
    if (confirm && !confirm.querySelector('.review-payment-action-label')) {
      confirm.classList.add('review-payment-action-button');
      confirm.append(node('span', 'review-payment-action-label', 'Confirmar'));
    }
    if (reject && !reject.querySelector('.review-payment-action-label')) {
      reject.classList.add('review-payment-action-button');
      reject.append(node('span', 'review-payment-action-label', 'Rechazar'));
    }
  });
}

function runPostMergeFixes() {
  removeInventoryContextCard();
  normalizePartnerLabels();
  enhanceVipHelp();
  enhanceVipDepositDeadline();
  enhancePaymentProofUx();
}

let scheduled = false;
function queuePostMergeFixes() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    runPostMergeFixes();
  });
}

export function installPostMergeReviewFixes() {
  if (document.documentElement.dataset.postMergeReviewFixes === 'true') return;
  document.documentElement.dataset.postMergeReviewFixes = 'true';
  new MutationObserver(queuePostMergeFixes).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('popstate', queuePostMergeFixes);
  queuePostMergeFixes();
}
