import type { DeliveryDetail, FinanceCategory, FinanceSupportData } from '@yukimi/shared';
import { getDelivery } from '../features/deliveries/deliveries-api';
import {
  createManualFinanceTransaction,
  getFinanceSupport,
  getFinanceTransactions,
} from '../features/finance/finance-api';
import { uploadFinanceProof } from '../features/finance/upload-finance-file';

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

const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

function nowLocalInput() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function deliveryIdFromPath() {
  return location.pathname.match(/^\/entregas\/([0-9a-f-]+)$/i)?.[1] ?? null;
}

function showNotice(message: string, tone: 'success' | 'error' | 'warning' = 'success') {
  document.querySelector('.delivery-expense-runtime-notice')?.remove();
  const notice = node(
    'div',
    `final-runtime-notice delivery-expense-runtime-notice ${tone === 'error' ? 'error' : ''}`,
    message,
  );
  notice.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  if (tone === 'warning') notice.classList.add('warning');
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 6200);
}

function expenseCategories(support: FinanceSupportData) {
  return support.categories.filter(
    (category) => category.isActive && ['EXPENSE', 'BOTH'].includes(category.nature),
  );
}

function preferredCategory(categories: FinanceCategory[]) {
  const terms = ['envío', 'envio', 'delivery', 'flete', 'transporte', 'reparto', 'logística', 'logistica'];
  return (
    categories.find((category) => {
      const value = `${category.name} ${category.description ?? ''}`.toLocaleLowerCase('es-PE');
      return terms.some((term) => value.includes(term));
    }) ?? categories[0]
  );
}

function field(labelText: string, control: HTMLElement, className = '') {
  const label = node('label', `field ${className}`.trim());
  label.append(node('span', '', labelText), control);
  return label;
}

function closeExpenseModal() {
  document.querySelector('.delivery-expense-modal-backdrop')?.remove();
}

async function openExpenseModal(delivery: DeliveryDetail, onSaved: () => void) {
  closeExpenseModal();
  let support: FinanceSupportData;
  try {
    support = await getFinanceSupport();
  } catch (error) {
    showNotice(
      error instanceof Error ? error.message : 'No se pudieron cargar las cuentas de Finanzas.',
      'error',
    );
    return;
  }

  const categories = expenseCategories(support);
  const selectedCategory = preferredCategory(categories);
  const accounts = support.accounts.filter((account) => account.currencyCode === 'PEN');

  const backdrop = node('div', 'app-modal-backdrop delivery-expense-modal-backdrop');
  const form = node('form', 'app-modal-card modal-card-wide delivery-expense-modal');
  const header = node('header', 'app-modal-header');
  const heading = node('div');
  heading.append(
    node('span', 'eyebrow', 'Finanzas · gasto de envío'),
    node('h2', '', `Registrar gasto de ${delivery.code}`),
    node(
      'p',
      '',
      'Los datos de la entrega ya están colocados. Revisa la cuenta, la categoría y el importe antes de confirmar.',
    ),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  close.addEventListener('click', closeExpenseModal);
  header.append(heading, close);

  const errorBox = node('div', 'alert alert-error delivery-expense-error');
  errorBox.hidden = true;
  const summary = node('div', 'delivery-expense-prefill-summary');
  summary.append(
    node('div', '', `Entrega: ${delivery.code}`),
    node('div', '', `Venta: ${delivery.saleCode}`),
    node('div', '', `Operador: ${delivery.operatorName ?? 'Sin operador'}`),
    node('div', '', `Importe asumido: ${money(delivery.shippingCost)}`),
  );

  const grid = node('div', 'form-grid form-grid-2');
  const account = node('select');
  account.name = 'accountId';
  account.required = true;
  account.append(new Option('Selecciona la cuenta desde la que se pagó', ''));
  accounts.forEach((item) => account.append(new Option(`${item.name} · ${item.code}`, item.id)));
  if (accounts[0]) account.value = accounts[0].id;

  const category = node('select');
  category.name = 'categoryId';
  category.required = true;
  category.append(new Option('Selecciona la categoría', ''));
  categories.forEach((item) => category.append(new Option(item.name, item.id)));
  if (selectedCategory) category.value = selectedCategory.id;

  const amount = node('input');
  amount.name = 'amount';
  amount.type = 'number';
  amount.min = '0.01';
  amount.step = '0.01';
  amount.required = true;
  amount.value = String(delivery.shippingCost);

  const occurredAt = node('input');
  occurredAt.name = 'occurredAt';
  occurredAt.type = 'datetime-local';
  occurredAt.required = true;
  occurredAt.value = nowLocalInput();

  const description = node('input');
  description.name = 'description';
  description.required = true;
  description.minLength = 3;
  description.maxLength = 300;
  description.value = `Gasto de envío ${delivery.code}${delivery.operatorName ? ` · ${delivery.operatorName}` : ''}`;

  const reference = node('input');
  reference.name = 'reference';
  reference.maxLength = 150;
  reference.value = delivery.code;

  const notes = node('textarea');
  notes.name = 'notes';
  notes.rows = 3;
  notes.maxLength = 1000;
  notes.value = `Costo asumido por Yukimi en la entrega ${delivery.code} de la venta ${delivery.saleCode}.`;

  const proof = node('input');
  proof.name = 'proof';
  proof.type = 'file';
  proof.accept = 'image/jpeg,image/png,image/webp,application/pdf';

  grid.append(
    field('Cuenta de pago *', account),
    field('Categoría de gasto *', category),
    field('Importe pagado *', amount),
    field('Fecha y hora del pago *', occurredAt),
    field('Descripción *', description, 'field-span-2'),
    field('Referencia', reference),
    field('Constancia opcional', proof),
    field('Notas', notes, 'field-span-2'),
  );

  if (!selectedCategory) {
    const warning = node(
      'div',
      'alert alert-warning delivery-expense-category-warning',
      'No se encontró una categoría de envíos. Selecciona una categoría de gasto antes de confirmar.',
    );
    form.append(header, errorBox, summary, warning, grid);
  } else {
    form.append(header, errorBox, summary, grid);
  }

  const footer = node('footer', 'app-modal-actions');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  cancel.addEventListener('click', closeExpenseModal);
  const confirm = node('button', 'button button-primary', 'Confirmar gasto');
  confirm.type = 'submit';
  footer.append(cancel, confirm);
  form.append(footer);
  backdrop.append(form);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeExpenseModal();
  });

  const idempotencyKey = crypto.randomUUID();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const amountValue = Number(amount.value);
    if (!account.value || !category.value || !Number.isFinite(amountValue) || amountValue <= 0) {
      errorBox.hidden = false;
      errorBox.textContent = 'Selecciona cuenta y categoría e ingresa un importe mayor que cero.';
      return;
    }
    confirm.disabled = true;
    confirm.textContent = 'Registrando…';
    void getFinanceTransactions({ search: delivery.code, type: 'EXPENSE', page: 1, pageSize: 100 })
      .then((transactions) => {
        const duplicate = transactions.items.some(
          (transaction) =>
            transaction.stateCode !== 'REVERSED' &&
            transaction.description.toLocaleLowerCase('es-PE').includes(delivery.code.toLocaleLowerCase('es-PE')),
        );
        if (duplicate) throw new Error('Esta entrega ya tiene un gasto registrado en Finanzas.');
        return createManualFinanceTransaction(
          {
            transactionTypeCode: 'EXPENSE',
            accountId: account.value,
            categoryId: category.value,
            amount: amountValue,
            occurredAt: new Date(occurredAt.value).toISOString(),
            description: description.value.trim(),
            reference: reference.value.trim() || null,
            notes: notes.value.trim() || null,
            reason: `Registro del gasto de envío ${delivery.code}`,
          },
          idempotencyKey,
        );
      })
      .then(async (result) => {
        const file = proof.files?.[0];
        if (file) {
          try {
            await uploadFinanceProof(result.id, file);
          } catch (uploadError) {
            showNotice(
              `El gasto ${result.code ?? ''} fue registrado, pero la constancia no pudo subirse: ${uploadError instanceof Error ? uploadError.message : 'error desconocido'}`,
              'warning',
            );
          }
        }
        closeExpenseModal();
        showNotice(`Gasto ${result.code ?? ''} registrado en Finanzas.`);
        onSaved();
      })
      .catch((requestError: unknown) => {
        errorBox.hidden = false;
        errorBox.textContent =
          requestError instanceof Error ? requestError.message : 'No se pudo registrar el gasto.';
        confirm.disabled = false;
        confirm.textContent = 'Confirmar gasto';
      });
  });

  document.body.append(backdrop);
}

function renderExpensePanel(
  sidebar: HTMLElement,
  delivery: DeliveryDetail,
  expense: Awaited<ReturnType<typeof getFinanceTransactions>>['items'][number] | undefined,
) {
  sidebar.querySelector('.delivery-expense-panel')?.remove();
  const panel = node('section', 'panel delivery-expense-panel');
  panel.dataset.deliveryId = delivery.id;
  panel.dataset.loaded = 'true';
  const heading = node('div', 'panel-heading');
  const headingText = node('div');
  headingText.append(
    node('h2', '', 'Gasto de envío'),
    node('p', '', 'Control del costo asumido por Yukimi en esta entrega.'),
  );
  heading.append(headingText);
  const body = node('div', 'delivery-expense-panel-body');

  if (expense) {
    const status = node('div', 'delivery-expense-status delivery-expense-status-success');
    status.append(
      node('strong', '', 'Gasto registrado'),
      node('span', '', `${expense.code} · ${money(expense.totalAmount)}`),
      node('small', '', expense.description),
    );
    const openFinance = node('button', 'button button-secondary button-full', 'Abrir Finanzas');
    openFinance.type = 'button';
    openFinance.addEventListener('click', () => {
      location.href = '/finanzas';
    });
    body.append(status, openFinance);
  } else {
    const status = node('div', 'delivery-expense-status delivery-expense-status-warning');
    status.append(
      node('strong', '', 'Falta registrar el gasto'),
      node(
        'span',
        '',
        `Yukimi asumió ${money(delivery.shippingCost)}${delivery.operatorName ? ` con ${delivery.operatorName}` : ''}.`,
      ),
      node('small', '', 'Regístralo cuando el pago al operador se haya realizado.'),
    );
    const register = node('button', 'button button-primary button-full', 'Registrar gasto de envío');
    register.type = 'button';
    register.addEventListener('click', () => {
      void openExpenseModal(delivery, () => {
        panel.remove();
        queueDeliveryExpense();
      });
    });
    body.append(status, register);
  }

  panel.append(heading, body);
  const nextAction = [...sidebar.querySelectorAll<HTMLElement>(':scope > .panel')].find(
    (candidate) => candidate.querySelector('h2')?.textContent?.trim() === 'Siguiente acción',
  );
  sidebar.insertBefore(panel, nextAction ?? null);
}

let loadingDeliveryId: string | null = null;
async function enhanceDeliveryExpense() {
  const deliveryId = deliveryIdFromPath();
  if (!deliveryId) return;
  const sidebar = document.querySelector<HTMLElement>('.delivery-detail-page .sale-detail-sidebar');
  if (!sidebar) return;
  const current = sidebar.querySelector<HTMLElement>('.delivery-expense-panel');
  if (current?.dataset.deliveryId === deliveryId && current.dataset.loaded === 'true') return;
  if (loadingDeliveryId === deliveryId) return;
  loadingDeliveryId = deliveryId;
  try {
    const delivery = await getDelivery(deliveryId);
    const shouldRegisterExpense =
      delivery.stateCode !== 'CANCELLED' &&
      delivery.shippingCost > 0 &&
      ['BUSINESS', 'SHARED'].includes(delivery.costPayer);
    if (!shouldRegisterExpense) {
      current?.remove();
      return;
    }
    const transactions = await getFinanceTransactions({
      search: delivery.code,
      type: 'EXPENSE',
      page: 1,
      pageSize: 100,
    });
    const expense = transactions.items.find(
      (transaction) =>
        transaction.stateCode !== 'REVERSED' &&
        transaction.description.toLocaleLowerCase('es-PE').includes(delivery.code.toLocaleLowerCase('es-PE')),
    );
    renderExpensePanel(sidebar, delivery, expense);
  } catch (error) {
    current?.remove();
    const panel = node('section', 'panel delivery-expense-panel');
    panel.dataset.deliveryId = deliveryId;
    panel.dataset.loaded = 'true';
    const heading = node('div', 'panel-heading');
    const text = node('div');
    text.append(node('h2', '', 'Gasto de envío'), node('p', '', 'No se pudo verificar Finanzas.'));
    heading.append(text);
    panel.append(
      heading,
      node(
        'div',
        'alert alert-error',
        error instanceof Error ? error.message : 'No se pudo verificar el gasto de esta entrega.',
      ),
    );
    sidebar.append(panel);
  } finally {
    loadingDeliveryId = null;
  }
}

let scheduled = false;
function queueDeliveryExpense() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    void enhanceDeliveryExpense();
  });
}

export function installDeliveryExpenseRuntime() {
  if (document.documentElement.dataset.deliveryExpenseRuntime === 'true') return;
  document.documentElement.dataset.deliveryExpenseRuntime = 'true';
  new MutationObserver(queueDeliveryExpense).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', queueDeliveryExpense);
  queueDeliveryExpense();
}
