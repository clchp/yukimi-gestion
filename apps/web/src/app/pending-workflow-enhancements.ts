import { getFinanceTransactions } from '../features/finance/finance-api';
import { getInventory } from '../features/products/products-api';
import { getSale, getSales } from '../features/sales/sales-api';

type Period = 'TODAY' | '7D' | 'MONTH' | 'TOTAL';
type ChartValue = { label: string; sales: number; collections: number };
type SaleRow = Awaited<ReturnType<typeof getSales>>['items'][number];
type FinanceRow = Awaited<ReturnType<typeof getFinanceTransactions>>['items'][number];

const moneyFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
});

function money(value: number) {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0);
}

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

function dateAtNoon(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

function shiftDays(value: string, amount: number) {
  const date = dateAtNoon(value);
  date.setDate(date.getDate() + amount);
  return inputDate(date);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' }).format(
    dateAtNoon(value),
  );
}

function longDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dateAtNoon(value));
}

let allSalesPromise: Promise<SaleRow[]> | null = null;
let allFinancePromise: Promise<FinanceRow[]> | null = null;
let inventoryPromise: ReturnType<typeof getInventory> | null = null;

async function allSales() {
  allSalesPromise ??= (async () => {
    const first = await getSales({ filter: 'ALL', page: 1, pageSize: 100 });
    const rows = [...first.items];
    const pages = Math.ceil(first.total / first.pageSize);
    for (let page = 2; page <= pages; page += 1) {
      rows.push(...(await getSales({ filter: 'ALL', page, pageSize: 100 })).items);
    }
    return rows;
  })();
  return allSalesPromise;
}

async function allFinance() {
  allFinancePromise ??= (async () => {
    const first = await getFinanceTransactions({ type: 'ALL', page: 1, pageSize: 100 });
    const rows = [...first.items];
    const pages = Math.ceil(first.total / first.pageSize);
    for (let page = 2; page <= pages; page += 1) {
      rows.push(...(await getFinanceTransactions({ type: 'ALL', page, pageSize: 100 })).items);
    }
    return rows;
  })();
  return allFinancePromise;
}

function validSale(row: SaleRow) {
  return !['CANCELLED', 'ANNULLED'].includes(row.commercialStateCode);
}

function validCollection(row: FinanceRow) {
  if (row.stateCode === 'REVERSED' || row.transactionTypeCode !== 'INCOME') return false;
  const description = row.description.toLocaleLowerCase('es');
  const category = row.categoryName?.toLocaleLowerCase('es') ?? '';
  return (
    category.includes('venta') || description.includes('pago') || description.includes('venta')
  );
}

function chartDaily(sales: SaleRow[], finance: FinanceRow[], start: string, end: string) {
  const values = new Map<string, { sales: number; collections: number }>();
  for (let date = start; date <= end; date = shiftDays(date, 1)) {
    values.set(date, { sales: 0, collections: 0 });
  }
  sales.filter(validSale).forEach((sale) => {
    const date = sale.createdAt.slice(0, 10);
    const current = values.get(date);
    if (current) current.sales += sale.totalAmount;
  });
  finance.filter(validCollection).forEach((transaction) => {
    const date = transaction.occurredAt.slice(0, 10);
    const current = values.get(date);
    if (current) current.collections += transaction.totalAmount;
  });
  return values;
}

function monthGroups(
  values: Map<string, { sales: number; collections: number }>,
  monthStart: string,
  monthEnd: string,
): ChartValue[] {
  return Array.from({ length: 5 }, (_, index) => {
    const startDay = index * 7 + 1;
    const start = dateAtNoon(monthStart);
    start.setDate(startDay);
    const end = new Date(start);
    end.setDate(index === 4 ? dateAtNoon(monthEnd).getDate() : startDay + 6);
    if (end > dateAtNoon(monthEnd)) end.setTime(dateAtNoon(monthEnd).getTime());
    let sales = 0;
    let collections = 0;
    for (let date = inputDate(start); date <= inputDate(end); date = shiftDays(date, 1)) {
      const current = values.get(date);
      sales += current?.sales ?? 0;
      collections += current?.collections ?? 0;
    }
    return { label: `Semana ${index + 1}`, sales, collections };
  });
}

function totalGroups(
  values: Map<string, { sales: number; collections: number }>,
  start: string,
  end: string,
): ChartValue[] {
  const totalDays = Math.max(
    1,
    Math.floor((dateAtNoon(end).getTime() - dateAtNoon(start).getTime()) / 86_400_000) + 1,
  );
  const daysPerPeriod = Math.max(1, Math.ceil(totalDays / 5));
  return Array.from({ length: 5 }, (_, index) => {
    const groupStart = shiftDays(start, index * daysPerPeriod);
    const groupEnd = index === 4 ? end : [shiftDays(groupStart, daysPerPeriod - 1), end].sort()[0]!;
    let sales = 0;
    let collections = 0;
    if (groupStart <= end) {
      for (let date = groupStart; date <= groupEnd; date = shiftDays(date, 1)) {
        const current = values.get(date);
        sales += current?.sales ?? 0;
        collections += current?.collections ?? 0;
      }
    }
    return { label: `Periodo ${index + 1}`, sales, collections };
  });
}

function renderDashboardBars(chart: HTMLElement, values: ChartValue[]) {
  chart.replaceChildren();
  chart.style.gridTemplateColumns = `repeat(${values.length}, minmax(48px, 1fr))`;
  const maximum = Math.max(1, ...values.flatMap((value) => [value.sales, value.collections]));
  values.forEach((value) => {
    const column = node('div', 'bar-column pending-bar-column');
    const tooltip = node('span', 'chart-tooltip pending-chart-tooltip');
    tooltip.append(
      node('span', 'pending-tooltip-line', `Ventas: ${money(value.sales)}`),
      node('span', 'pending-tooltip-line', `Cobros: ${money(value.collections)}`),
    );
    const button = node('button', 'bar-track dual-bar-track chart-bar-button');
    button.type = 'button';
    button.setAttribute(
      'aria-label',
      `Ventas ${money(value.sales)}. Cobros ${money(value.collections)}.`,
    );
    const salesBar = node('span', 'sales-bar');
    const collectionsBar = node('span', 'collections-bar');
    salesBar.style.height = `${Math.max(value.sales > 0 ? 5 : 0, (value.sales / maximum) * 100)}%`;
    collectionsBar.style.height = `${Math.max(
      value.collections > 0 ? 5 : 0,
      (value.collections / maximum) * 100,
    )}%`;
    button.append(salesBar, collectionsBar);
    column.append(tooltip, button, node('small', '', value.label));
    chart.append(column);
  });
}

async function renderDashboardPeriod(panel: HTMLElement, period: Period) {
  if (panel.dataset.pendingDashboardLoading === 'true') return;
  panel.dataset.pendingDashboardLoading = 'true';
  try {
    const [sales, finance] = await Promise.all([allSales(), allFinance()]);
    const today = inputDate(new Date());
    const firstDates = [
      ...sales.filter(validSale).map((item) => item.createdAt.slice(0, 10)),
      ...finance.filter(validCollection).map((item) => item.occurredAt.slice(0, 10)),
    ].sort();
    const start =
      period === 'TODAY'
        ? today
        : period === '7D'
          ? shiftDays(today, -6)
          : period === 'MONTH'
            ? `${today.slice(0, 8)}01`
            : (firstDates[0] ?? today);
    const monthLast = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0, 12);
    const rangeEnd = period === 'MONTH' ? inputDate(monthLast) : today;
    const daily = chartDaily(sales, finance, start, rangeEnd);
    let values: ChartValue[];
    if (period === 'MONTH') values = monthGroups(daily, start, rangeEnd);
    else if (period === 'TOTAL') values = totalGroups(daily, start, today);
    else {
      values = [...daily.entries()].map(([date, value]) => ({
        label: period === 'TODAY' ? 'Hoy' : shortDate(date),
        ...value,
      }));
    }

    const chart = panel.querySelector<HTMLElement>('.dashboard-real-chart');
    if (!chart) return;
    renderDashboardBars(chart, values);
    const title = panel.querySelector<HTMLElement>('.panel-heading h2');
    const subtitle = panel.querySelector<HTMLElement>('.panel-heading p');
    if (title)
      title.textContent =
        period === 'TODAY'
          ? 'Rendimiento de hoy'
          : period === '7D'
            ? 'Rendimiento de los últimos 7 días'
            : period === 'MONTH'
              ? 'Rendimiento del mes por semanas'
              : 'Rendimiento histórico en 5 periodos';
    if (subtitle)
      subtitle.textContent =
        period === 'MONTH'
          ? `${longDate(start)} — ${longDate(rangeEnd)}`
          : `${longDate(start)} — ${longDate(today)}`;
    const summary = panel.querySelector<HTMLElement>('.chart-summary');
    const label = summary?.querySelector<HTMLElement>('span');
    const total = summary?.querySelector<HTMLElement>('strong');
    if (label)
      label.textContent =
        period === 'TODAY'
          ? 'Total de hoy'
          : period === '7D'
            ? 'Total de 7 días'
            : period === 'MONTH'
              ? 'Total del mes'
              : 'Total histórico';
    if (total) total.textContent = money(values.reduce((sum, value) => sum + value.sales, 0));
  } catch {
    panel
      .querySelector<HTMLElement>('.dashboard-real-chart')
      ?.replaceChildren(node('div', 'empty-state', 'No se pudo actualizar el gráfico.'));
  } finally {
    panel.dataset.pendingDashboardLoading = 'false';
  }
}

function enhanceDashboard() {
  if (location.pathname !== '/') return;
  const chart = document.querySelector<HTMLElement>('.dashboard-real-chart');
  const panel = chart?.closest<HTMLElement>('.panel');
  const periods = panel?.querySelector<HTMLElement>('.chart-periods');
  if (!chart || !panel || !periods) return;
  panel.classList.add('pending-dashboard-panel');
  chart.classList.add('pending-dashboard-chart');

  const mapping = new Map<string, Period>([
    ['Hoy', 'TODAY'],
    ['7 días', '7D'],
    ['Mes', 'MONTH'],
    ['1 mes', 'MONTH'],
    ['Total', 'TOTAL'],
  ]);
  [...periods.querySelectorAll<HTMLButtonElement>('button')].forEach((button) => {
    const label = button.textContent?.trim() ?? '';
    if (label === 'Personalizado') button.remove();
    if (label === 'Mes') button.textContent = '1 mes';
    const code = mapping.get(label);
    if (code) button.dataset.pendingPeriod = code;
  });
  if (!periods.querySelector('[data-pending-period="TOTAL"]')) {
    const total = node('button', 'chart-period-button', 'Total');
    total.type = 'button';
    total.dataset.pendingPeriod = 'TOTAL';
    periods.append(total);
  }
  if (periods.dataset.pendingBound !== 'true') {
    periods.dataset.pendingBound = 'true';
    periods.addEventListener(
      'click',
      (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
          'button[data-pending-period]',
        );
        if (!button) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const period = button.dataset.pendingPeriod as Period;
        periods.querySelectorAll('button').forEach((candidate) => {
          candidate.classList.toggle('active', candidate === button);
          candidate.setAttribute('aria-pressed', String(candidate === button));
        });
        void renderDashboardPeriod(panel, period);
      },
      true,
    );
  }
  if (panel.dataset.pendingDashboardInitialized !== 'true') {
    panel.dataset.pendingDashboardInitialized = 'true';
    const selected = periods.querySelector<HTMLButtonElement>('[data-pending-period="7D"]');
    selected?.classList.add('active');
    void renderDashboardPeriod(panel, '7D');
  }
}

async function enhanceProductAccumulated() {
  if (location.pathname !== '/productos') return;
  const table = document.querySelector<HTMLTableElement>('table.product-table');
  if (!table) return;
  inventoryPromise ??= getInventory({ includeVirtual: false });
  let inventory: Awaited<ReturnType<typeof getInventory>>;
  try {
    inventory = await inventoryPromise;
  } catch {
    return;
  }
  const totals = new Map<string, number>();
  inventory.items.forEach((item) => {
    totals.set(item.productCode, (totals.get(item.productCode) ?? 0) + item.accumulatedQuantity);
  });
  const headerRow = table.tHead?.rows[0];
  if (headerRow && !headerRow.querySelector('[data-accumulated-column]')) {
    const header = node('th', '', 'Acumulado');
    header.dataset.accumulatedColumn = 'true';
    headerRow.insertBefore(header, headerRow.cells[5] ?? null);
  }
  [...(table.tBodies[0]?.rows ?? [])].forEach((row) => {
    if (row.querySelector('.empty-state')) {
      const cell = row.cells[0];
      if (cell) cell.colSpan = 10;
      return;
    }
    if (row.querySelector('[data-accumulated-column]')) return;
    const productCode = row.textContent?.match(/PRD-\d+/)?.[0];
    const cell = node(
      'td',
      'numeric-cell',
      String(productCode ? (totals.get(productCode) ?? 0) : 0),
    );
    cell.dataset.accumulatedColumn = 'true';
    row.insertBefore(cell, row.cells[5] ?? null);
  });
}

function enhanceInventoryHeaders() {
  if (location.pathname !== '/inventario') return;
  const tables = [...document.querySelectorAll<HTMLTableElement>('table.data-table')];
  const table = tables.find((candidate) =>
    [...candidate.querySelectorAll('th')].some((header) =>
      header.textContent?.toLocaleLowerCase('es').includes('costo actual'),
    ),
  );
  if (!table) return;
  table.classList.add('pending-inventory-table');
  const replacements = new Map<string, string[]>([
    ['EN TRÁNSITO', ['En', 'tránsito']],
    ['COSTO ACTUAL', ['Costo', 'actual']],
    ['STOCK MÍNIMO', ['Stock', 'mínimo']],
  ]);
  table.querySelectorAll<HTMLTableCellElement>('th').forEach((header) => {
    const key = header.textContent?.trim().toLocaleUpperCase('es') ?? '';
    const parts = replacements.get(key);
    if (!parts || header.dataset.pendingWrapped === 'true') return;
    header.dataset.pendingWrapped = 'true';
    header.replaceChildren(
      document.createTextNode(parts[0]!),
      document.createElement('br'),
      document.createTextNode(parts[1]!),
    );
  });
}

function saleDraftKey() {
  const match = location.pathname.match(/^\/ventas\/borradores\/([0-9a-f-]+)/i);
  return match ? `yukimi:vip-deposit-due:${match[1]}` : 'yukimi:vip-deposit-due:new';
}

function currentDepositDeadline() {
  const input = document.querySelector<HTMLInputElement>('.pending-vip-deposit-due input');
  return input?.value || localStorage.getItem(saleDraftKey()) || '';
}

function enhanceSaleWizard() {
  if (!/^\/ventas\/(nueva|borradores\/)/.test(location.pathname)) return;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (element.children.length === 0 && element.textContent?.trim() === 'Pendiente de definir') {
      element.textContent = 'Entrega pendiente';
    }
  });

  const minimumLabel = [...document.querySelectorAll<HTMLLabelElement>('label.field')].find(
    (label) => label.textContent?.includes('Adelanto mínimo negociado'),
  );
  const minimumInput = minimumLabel?.querySelector<HTMLInputElement>('input[type="number"]');
  const grid = minimumLabel?.parentElement;
  if (minimumInput && grid && !grid.querySelector('.pending-vip-deposit-due')) {
    const label = node('label', 'field pending-vip-deposit-due');
    label.append(node('span', '', 'Fecha límite del adelanto *'));
    const input = node('input');
    input.type = 'date';
    input.min = inputDate(new Date());
    input.value = localStorage.getItem(saleDraftKey()) ?? '';
    const help = node(
      'small',
      '',
      'Solo se solicita cuando el adelanto acordado es mayor que S/ 0.',
    );
    label.append(input, help);
    grid.append(label);
    const sync = () => {
      const required = Number(minimumInput.value || 0) > 0;
      label.hidden = !required;
      input.required = required;
      if (!required) {
        input.value = '';
        localStorage.removeItem(saleDraftKey());
      }
    };
    minimumInput.addEventListener('input', sync);
    input.addEventListener('change', () => {
      if (input.value) localStorage.setItem(saleDraftKey(), input.value);
      else localStorage.removeItem(saleDraftKey());
    });
    sync();
  }

  const reviewRows = [
    ...document.querySelectorAll<HTMLElement>('.review-grid > div, .summary-list > div'),
  ];
  const minimumRow = reviewRows.find((row) =>
    row.textContent?.includes('Adelanto mínimo acordado'),
  );
  const amount = Number(minimumInput?.value || 0);
  const deadline = currentDepositDeadline();
  if (
    minimumRow &&
    amount > 0 &&
    deadline &&
    !minimumRow.parentElement?.querySelector('.pending-deposit-review-row')
  ) {
    const row = node('div', 'pending-deposit-review-row');
    row.append(
      node('span', '', 'Fecha límite del adelanto'),
      node('strong', '', longDate(deadline)),
    );
    minimumRow.after(row);
  }

  const nextStep = [...document.querySelectorAll<HTMLElement>('.alert.alert-info')].find((alert) =>
    alert.textContent?.includes('Después de reservar podrás registrar'),
  );
  if (nextStep && nextStep.dataset.pendingStyled !== 'true') {
    nextStep.dataset.pendingStyled = 'true';
    nextStep.classList.add('pending-next-step-card');
    nextStep.replaceChildren(
      node('strong', '', 'Siguiente paso'),
      node(
        'span',
        '',
        'Al confirmar, el stock quedará reservado. Después podrás registrar uno o varios pagos y emitir el comprobante desde el detalle de la venta.',
      ),
    );
  }

  const summaryPanel = [...document.querySelectorAll<HTMLElement>('.panel')].find(
    (panel) => panel.querySelector('h2')?.textContent?.trim() === 'Resumen',
  );
  const subtitle = summaryPanel?.querySelector<HTMLElement>('.panel-heading p');
  const selectedMode = document.querySelector<HTMLInputElement>(
    'input[name="deliveryMode"]:checked',
  )?.value;
  if (subtitle) {
    subtitle.textContent =
      selectedMode === 'ACCUMULATED'
        ? 'Stock reservado para acumular compras'
        : 'Stock reservado para próxima entrega';
  }
}

async function enhanceSaleVipStatus() {
  const match = location.pathname.match(/^\/ventas\/([0-9a-f-]+)$/i);
  if (!match) return;
  const main = document.querySelector<HTMLElement>('main.page');
  if (!main || main.querySelector('.pending-vip-status')) return;
  try {
    const sale = await getSale(match[1]!);
    const minimum = sale.negotiatedMinimumDepositAmount ?? 0;
    const snapshot = sale.negotiatedTermsSnapshot as Record<string, unknown>;
    const dueAt = typeof snapshot.depositDueAt === 'string' ? snapshot.depositDueAt : null;
    if (minimum <= 0 || !dueAt) return;
    const paid = Math.min(Math.max(sale.paidTotal, 0), minimum);
    const pending = Math.max(minimum - paid, 0);
    const overdue = pending > 0 && new Date(dueAt).getTime() < Date.now();
    const card = node('div', 'detail-note pending-vip-status');
    const heading = node('div', 'pending-vip-status-heading');
    heading.append(
      node('strong', '', 'Condición VIP · Adelanto'),
      node(
        'span',
        `status-badge ${pending === 0 ? 'status-success' : overdue ? 'status-danger' : 'status-warning'}`,
        pending === 0 ? 'Cumplido' : overdue ? 'Vencido' : 'Pendiente',
      ),
    );
    const metrics = node('div', 'pending-vip-status-grid');
    [
      ['Requerido', money(minimum)],
      ['Fecha límite', longDate(dueAt.slice(0, 10))],
      ['Pagado', money(paid)],
      ['Falta', money(pending)],
    ].forEach(([label, value]) => {
      const metric = node('div');
      metric.append(node('span', '', label), node('strong', '', value));
      metrics.append(metric);
    });
    card.append(heading, metrics);
    const agreement = [...main.querySelectorAll<HTMLElement>('.detail-note')].find((item) =>
      item.textContent?.includes('Acuerdo VIP'),
    );
    if (agreement) agreement.after(card);
    else main.querySelector('.sale-detail-main .panel')?.append(card);
  } catch {
    // El detalle principal sigue disponible aunque falle este resumen complementario.
  }
}

function enhancePaymentFeedback() {
  if (!/^\/ventas\/[0-9a-f-]+$/i.test(location.pathname)) return;
  document.querySelectorAll<HTMLElement>('.alert.alert-warning').forEach((alert) => {
    const match = alert.textContent?.match(/PAG-\d+/);
    if (match) {
      const payment = [...document.querySelectorAll<HTMLElement>('article')].find((article) =>
        article.textContent?.includes(match[0]),
      );
      const confirmed = payment?.textContent?.toLocaleUpperCase('es').includes('CONFIRMED');
      const hasFile = Boolean(payment?.querySelector('a.file-link'));
      if (confirmed && hasFile) {
        alert.remove();
        return;
      }
    }
    if (!alert.querySelector('.pending-alert-close')) {
      const close = node('button', 'pending-alert-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', 'Cerrar aviso');
      close.addEventListener('click', () => alert.remove());
      alert.append(close);
    }
  });

  const form = document.querySelector<HTMLFormElement>('.receipt-form');
  if (form && !form.querySelector('.pending-receipt-info')) {
    const seriesLabel = [...form.querySelectorAll<HTMLLabelElement>('label.field')].find(
      (label) => label.querySelector('span')?.textContent?.trim() === 'Serie',
    );
    const labelText = seriesLabel?.querySelector<HTMLElement>('span');
    if (labelText) {
      const info = node('button', 'pending-receipt-info', 'ⓘ');
      info.type = 'button';
      info.title =
        'Copia exactamente la numeración de la boleta emitida en SUNAT. Ejemplo: B001-00000010. Serie: B001 · Número: 00000010.';
      info.setAttribute('aria-label', info.title);
      labelText.append(' ', info);
    }
    const fileLabel = [...form.querySelectorAll<HTMLLabelElement>('label.field')].find((label) =>
      label.textContent?.includes('Archivo de la boleta'),
    );
    if (fileLabel && !fileLabel.querySelector('.pending-receipt-file-help')) {
      fileLabel.append(
        node(
          'small',
          'pending-receipt-file-help',
          'Opcional: adjunta el PDF o una imagen para consultarla desde Yukimi. No sustituye la emisión en SUNAT.',
        ),
      );
    }
  }
}

function enhanceDeliveryCostHelp() {
  if (!/^\/entregas\/(nueva|[0-9a-f-]+\/editar)/i.test(location.pathname)) return;
  const payerLabel = [...document.querySelectorAll<HTMLElement>('label.field')].find((label) =>
    label.textContent?.includes('Quién asume el costo'),
  );
  const select = payerLabel?.querySelector<HTMLSelectElement>('select');
  if (!payerLabel || !select) return;
  const labels: Record<string, string> = {
    CLIENT: 'Cliente — paga directo al operador',
    BUSINESS: 'Yukimi — registrar como gasto',
    SHARED: 'Compartido — detallar en notas',
    NOT_APPLICABLE: 'No aplica',
  };
  [...select.options].forEach((option) => {
    option.textContent = labels[option.value] ?? option.textContent;
  });
  let note = payerLabel.parentElement?.querySelector<HTMLElement>('.pending-delivery-cost-note');
  if (!note) {
    note = node('div', 'pending-delivery-cost-note field-span-2');
    payerLabel.parentElement?.append(note);
  }
  const update = () => {
    note!.textContent =
      select.value === 'CLIENT'
        ? 'El cliente paga directamente a la agencia o motorizado. No aumenta la deuda ni las cuentas de Yukimi.'
        : select.value === 'BUSINESS'
          ? 'Yukimi asume el envío. No se suma al saldo del cliente; registra el pago como gasto en Finanzas cuando se realice.'
          : select.value === 'SHARED'
            ? 'Indica en Notas cuánto paga directamente el cliente y cuánto asume Yukimi. Solo la parte de Yukimi se registra como gasto.'
            : 'No existe costo de envío para esta operación.';
  };
  if (select.dataset.pendingCostBound !== 'true') {
    select.dataset.pendingCostBound = 'true';
    select.addEventListener('change', update);
  }
  update();

  const methodGrid = document.querySelector<HTMLElement>('.delivery-method-grid');
  if (
    methodGrid &&
    !methodGrid.previousElementSibling?.classList.contains('pending-delivery-decision-note')
  ) {
    const decision = node(
      'div',
      'pending-delivery-decision-note',
      'Esta sección prepara una entrega física. Si la venta estaba en “Acumula almacén”, las unidades elegidas dejan de esperar y pasan al flujo de despacho.',
    );
    methodGrid.before(decision);
  }
}

function patchSaleRequests() {
  if (window.fetch.toString().includes('pendingVipDeadlinePatched')) return;
  const original = window.fetch.bind(window);
  const patched = async function pendingVipDeadlinePatched(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.origin,
    );
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const isSaleCreate = method === 'POST' && /\/sales$/.test(url.pathname);
    const isDraftSave = method === 'POST' && /\/sales\/drafts$/.test(url.pathname);
    let nextInit = init;
    let deadline = '';
    if ((isSaleCreate || isDraftSave) && typeof init?.body === 'string') {
      const payload = JSON.parse(init.body) as Record<string, unknown>;
      const commercial = (isDraftSave ? payload.input : payload) as
        Record<string, unknown> | undefined;
      const minimum = Number(commercial?.negotiatedMinimumDepositAmount ?? 0);
      deadline = currentDepositDeadline();
      if (minimum > 0 && !deadline) {
        throw new Error('Indica la fecha límite para pagar el adelanto mínimo.');
      }
      if (commercial) {
        commercial.negotiatedMinimumDepositDueAt =
          minimum > 0 ? `${deadline}T23:59:59-05:00` : null;
      }
      nextInit = { ...init, body: JSON.stringify(payload) };
    }
    const response = await original(input, nextInit);
    if (isDraftSave && response.ok && deadline) {
      void response
        .clone()
        .json()
        .then((body: { data?: { id?: string } }) => {
          const id = body.data?.id;
          if (id) localStorage.setItem(`yukimi:vip-deposit-due:${id}`, deadline);
        })
        .catch(() => undefined);
    }
    return response;
  };
  window.fetch = patched;
}

function runPendingEnhancements() {
  // El dashboard queda bajo control exclusivo de React.
  void enhanceProductAccumulated();
  enhanceInventoryHeaders();
  enhanceSaleWizard();
  // El estado VIP se representa desde el flujo seguro de pagos; evitar tarjetas DOM duplicadas.
  enhancePaymentFeedback();
  enhanceDeliveryCostHelp();
}

export function installPendingWorkflowEnhancements() {
  if (document.documentElement.dataset.pendingWorkflowInstalled === 'true') return;
  document.documentElement.dataset.pendingWorkflowInstalled = 'true';
  patchSaleRequests();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      runPendingEnhancements();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
