import { getClients } from '../features/clients/clients-api';
import { getDeliveries } from '../features/deliveries/deliveries-api';
import { getFinanceTransactions, getBankReconciliation } from '../features/finance/finance-api';
import { getImports } from '../features/imports/imports-api';
import {
  downloadBusinessPdf,
  downloadXlsx,
  type BusinessPdfReport,
  type WorkbookSheet,
} from '../features/insights/file-export';
import { getDashboard, getReports, registerReportExport } from '../features/insights/insights-api';
import { getInventory, getProduct } from '../features/products/products-api';

type DailyValue = {
  date: string;
  primary: number;
  secondary: number;
  count?: number;
};

type ChartPeriod = 'TODAY' | '7D' | 'MONTH' | 'TOTAL';

type FinanceTransaction = Awaited<ReturnType<typeof getFinanceTransactions>>['items'][number];
type ImportItem = Awaited<ReturnType<typeof getImports>>['items'][number];
type DeliveryItem = Awaited<ReturnType<typeof getDeliveries>>['items'][number];
type ClientItem = Awaited<ReturnType<typeof getClients>>['items'][number];

const moneyFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
});

function money(value: number) {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0);
}

function inputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFrom(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

function shiftDays(value: string, days: number) {
  const date = dateFrom(value);
  date.setDate(date.getDate() + days);
  return inputDate(date);
}

function firstDayOfMonth(value: string) {
  const date = dateFrom(value);
  return inputDate(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

function longDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dateFrom(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' }).format(
    dateFrom(value),
  );
}

function clearChildren(element: Element) {
  while (element.firstChild) element.firstChild.remove();
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setActivePeriod(container: HTMLElement, selected: ChartPeriod) {
  container.querySelectorAll<HTMLButtonElement>('button[data-runtime-period]').forEach((button) => {
    const active = button.dataset.runtimePeriod === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function weekGroups(values: DailyValue[], startDate: string, endDate: string): DailyValue[] {
  const groups: DailyValue[] = [];
  let cursor = startDate;
  let index = 1;
  while (cursor <= endDate) {
    const groupEnd = shiftDays(cursor, 6) > endDate ? endDate : shiftDays(cursor, 6);
    const selected = values.filter((item) => item.date >= cursor && item.date <= groupEnd);
    groups.push({
      date: `Semana ${index}`,
      primary: selected.reduce((sum, item) => sum + item.primary, 0),
      secondary: selected.reduce((sum, item) => sum + item.secondary, 0),
      count: selected.reduce((sum, item) => sum + (item.count ?? 0), 0),
    });
    cursor = shiftDays(groupEnd, 1);
    index += 1;
  }
  return groups.slice(0, 5);
}

function fivePeriodGroups(values: DailyValue[]): DailyValue[] {
  const meaningful = values.filter((item) => item.primary !== 0 || item.secondary !== 0);
  const source = meaningful.length > 0 ? meaningful : values;
  if (source.length === 0)
    return Array.from({ length: 5 }, (_, index) => ({
      date: `Periodo ${index + 1}`,
      primary: 0,
      secondary: 0,
      count: 0,
    }));
  const first = dateFrom(source[0]!.date);
  const last = dateFrom(source[source.length - 1]!.date);
  const totalDays = Math.max(1, Math.floor((last.getTime() - first.getTime()) / 86400000) + 1);
  const daysPerPeriod = Math.max(1, Math.ceil(totalDays / 5));
  return Array.from({ length: 5 }, (_, index) => {
    const start = new Date(first);
    start.setDate(start.getDate() + index * daysPerPeriod);
    const end = new Date(start);
    end.setDate(end.getDate() + daysPerPeriod - 1);
    if (end > last || index === 4) end.setTime(last.getTime());
    const startKey = inputDate(start);
    const endKey = inputDate(end);
    const selected = source.filter((item) => item.date >= startKey && item.date <= endKey);
    return {
      date: `Periodo ${index + 1}`,
      primary: selected.reduce((sum, item) => sum + item.primary, 0),
      secondary: selected.reduce((sum, item) => sum + item.secondary, 0),
      count: selected.reduce((sum, item) => sum + (item.count ?? 0), 0),
    };
  });
}

function chartTooltip(primaryLabel: string, secondaryLabel: string, value: DailyValue) {
  const tooltip = element('span', 'chart-tooltip runtime-chart-tooltip');
  tooltip.setAttribute('role', 'tooltip');
  const first = element('span', 'runtime-tooltip-line');
  first.append(
    element('strong', '', `${primaryLabel}: `),
    document.createTextNode(money(value.primary)),
  );
  const second = element('span', 'runtime-tooltip-line');
  second.append(
    element('strong', '', `${secondaryLabel}: `),
    document.createTextNode(money(value.secondary)),
  );
  tooltip.append(first, second);
  return tooltip;
}

function renderDashboardBars(chart: HTMLElement, values: DailyValue[]) {
  clearChildren(chart);
  chart.style.gridTemplateColumns = `repeat(${Math.max(values.length, 1)}, minmax(42px, 1fr))`;
  const maximum = Math.max(1, ...values.flatMap((item) => [item.primary, item.secondary]));
  values.forEach((value) => {
    const column = element('div', 'bar-column');
    column.append(chartTooltip('Ventas', 'Cobros', value));
    const button = element('button', 'bar-track dual-bar-track chart-bar-button');
    button.type = 'button';
    button.setAttribute(
      'aria-label',
      `Ventas ${money(value.primary)}. Cobros ${money(value.secondary)}.`,
    );
    const sales = element('span', 'sales-bar');
    sales.style.height = `${Math.max(value.primary > 0 ? 5 : 0, (value.primary / maximum) * 100)}%`;
    const collections = element('span', 'collections-bar');
    collections.style.height = `${Math.max(value.secondary > 0 ? 5 : 0, (value.secondary / maximum) * 100)}%`;
    button.append(sales, collections);
    column.append(
      button,
      element('small', '', value.date.startsWith('20') ? shortDate(value.date) : value.date),
    );
    chart.append(column);
  });
}

function updatePanelHeading(panel: HTMLElement, title: string, subtitle: string) {
  const heading = panel.querySelector<HTMLElement>('.panel-heading');
  const titleElement = heading?.querySelector<HTMLElement>('h2');
  const subtitleElement = heading?.querySelector<HTMLElement>('p');
  if (titleElement) titleElement.textContent = title;
  if (subtitleElement) subtitleElement.textContent = subtitle;
}

let dashboardPromise: ReturnType<typeof getDashboard> | null = null;

async function renderDashboardPeriod(panel: HTMLElement, period: ChartPeriod) {
  const chart = panel.querySelector<HTMLElement>('.dashboard-real-chart');
  if (!chart) return;
  panel.dataset.runtimeChartLoading = 'true';
  try {
    dashboardPromise ??= getDashboard();
    const dashboard = await dashboardPromise;
    const endDate = dashboard.businessDate.slice(0, 10);
    const startDate =
      period === 'TODAY'
        ? endDate
        : period === '7D'
          ? shiftDays(endDate, -6)
          : period === 'MONTH'
            ? firstDayOfMonth(endDate)
            : '2000-01-01';
    const report = await getReports({ startDate, endDate });
    const daily = report.daily.map((item) => ({
      date: item.date.slice(0, 10),
      primary: item.salesAmount,
      secondary: item.collectionsAmount,
      count: item.salesCount,
    }));
    const chartValues =
      period === 'MONTH'
        ? weekGroups(daily, startDate, endDate)
        : period === 'TOTAL'
          ? fivePeriodGroups(daily)
          : daily;
    renderDashboardBars(chart, chartValues);
    const title =
      period === 'TODAY'
        ? 'Rendimiento de hoy'
        : period === '7D'
          ? 'Rendimiento de los últimos 7 días'
          : period === 'MONTH'
            ? 'Rendimiento del último mes por semanas'
            : 'Rendimiento total en 5 periodos';
    updatePanelHeading(panel, title, `${longDate(startDate)} — ${longDate(endDate)}`);
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
    if (total) total.textContent = money(daily.reduce((sum, item) => sum + item.primary, 0));
  } catch {
    chart.replaceChildren(element('div', 'empty-state', 'No se pudo actualizar el gráfico.'));
  } finally {
    panel.dataset.runtimeChartLoading = 'false';
  }
}

function enhanceDashboard() {
  if (location.pathname !== '/') return;
  const chart = document.querySelector<HTMLElement>('.dashboard-real-chart');
  const panel = chart?.closest<HTMLElement>('.panel');
  const periods = panel?.querySelector<HTMLElement>('.chart-periods');
  if (!chart || !panel || !periods) return;

  const buttons = [...periods.querySelectorAll<HTMLButtonElement>('button')];
  buttons.forEach((button) => {
    const label = button.textContent?.trim();
    if (label === 'Personalizado') button.hidden = true;
    if (label === 'Mes') button.textContent = '1 mes';
    const code: ChartPeriod | null =
      label === 'Hoy' ? 'TODAY' : label === '7 días' ? '7D' : label === 'Mes' ? 'MONTH' : null;
    if (!code) return;
    button.dataset.runtimePeriod = code;
    if (button.dataset.runtimeBound === 'true') return;
    button.dataset.runtimeBound = 'true';
    button.addEventListener(
      'click',
      (event) => {
        panel.dataset.runtimeSelectedPeriod = code;
        if (code === 'MONTH') {
          event.preventDefault();
          event.stopPropagation();
          setActivePeriod(periods, code);
          void renderDashboardPeriod(panel, code);
        } else {
          window.setTimeout(() => void renderDashboardPeriod(panel, code), 120);
        }
      },
      { capture: true },
    );
  });

  let totalButton = periods.querySelector<HTMLButtonElement>('button[data-runtime-period="TOTAL"]');
  if (!totalButton) {
    totalButton = element('button', 'chart-period-button', 'Total');
    totalButton.type = 'button';
    totalButton.dataset.runtimePeriod = 'TOTAL';
    totalButton.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        panel.dataset.runtimeSelectedPeriod = 'TOTAL';
        setActivePeriod(periods, 'TOTAL');
        void renderDashboardPeriod(panel, 'TOTAL');
      },
      { capture: true },
    );
    periods.append(totalButton);
  }

  panel.querySelector<HTMLElement>('.chart-custom-range')?.remove();
  if (!panel.dataset.runtimeSelectedPeriod) panel.dataset.runtimeSelectedPeriod = '7D';
  if (panel.dataset.runtimeDashboardInitialized !== 'true') {
    panel.dataset.runtimeDashboardInitialized = 'true';
    void renderDashboardPeriod(panel, '7D');
  }
}

let financeTransactionsPromise: Promise<FinanceTransaction[]> | null = null;

async function allFinanceTransactions() {
  financeTransactionsPromise ??= (async () => {
    const first = await getFinanceTransactions({ type: 'ALL', page: 1, pageSize: 100 });
    const rows = [...first.items];
    const pages = Math.ceil(first.total / first.pageSize);
    for (let page = 2; page <= pages; page += 1) {
      const response = await getFinanceTransactions({ type: 'ALL', page, pageSize: 100 });
      rows.push(...response.items);
    }
    return rows;
  })();
  return financeTransactionsPromise;
}

function financeDaily(
  rows: FinanceTransaction[],
  startDate: string,
  endDate: string,
): DailyValue[] {
  const map = new Map<string, DailyValue>();
  const incoming = new Set(['INCOME', 'LOAN_RECEIVED', 'LOAN_COLLECTION']);
  rows.forEach((item) => {
    const date = item.occurredAt.slice(0, 10);
    if (date < startDate || date > endDate || item.stateCode === 'REVERSED') return;
    if (['TRANSFER', 'REVERSAL'].includes(item.transactionTypeCode)) return;
    const current = map.get(date) ?? { date, primary: 0, secondary: 0, count: 0 };
    if (incoming.has(item.transactionTypeCode)) current.primary += item.totalAmount;
    else current.secondary += item.totalAmount;
    current.count = (current.count ?? 0) + 1;
    map.set(date, current);
  });
  const values: DailyValue[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = shiftDays(cursor, 1))
    values.push(map.get(cursor) ?? { date: cursor, primary: 0, secondary: 0, count: 0 });
  return values;
}

function renderFinanceBars(chart: HTMLElement, values: DailyValue[]) {
  clearChildren(chart);
  chart.classList.add('runtime-finance-chart');
  const maximum = Math.max(1, ...values.flatMap((item) => [item.primary, item.secondary]));
  values.forEach((value) => {
    const column = element('div', 'dual-column');
    const barArea = element('div', 'runtime-finance-bar-area');
    barArea.append(chartTooltip('Ingresos', 'Gastos', value));
    const income = element('span', 'income-bar');
    income.style.height = `${Math.max(value.primary > 0 ? 4 : 0, (value.primary / maximum) * 100)}%`;
    const expense = element('span', 'expense-bar');
    expense.style.height = `${Math.max(value.secondary > 0 ? 4 : 0, (value.secondary / maximum) * 100)}%`;
    barArea.append(income, expense);
    column.append(
      barArea,
      element('small', '', value.date.startsWith('20') ? shortDate(value.date) : value.date),
    );
    chart.append(column);
  });
}

async function renderFinancePeriod(panel: HTMLElement, period: ChartPeriod) {
  const chart = panel.querySelector<HTMLElement>('.dual-bar-chart');
  if (!chart || panel.dataset.runtimeFinanceLoading === 'true') return;
  panel.dataset.runtimeFinanceLoading = 'true';
  try {
    const rows = await allFinanceTransactions();
    const availableDates = rows.map((item) => item.occurredAt.slice(0, 10)).sort();
    const endDate = inputDate(new Date());
    const startDate =
      period === 'TODAY'
        ? endDate
        : period === '7D'
          ? shiftDays(endDate, -6)
          : period === 'MONTH'
            ? firstDayOfMonth(endDate)
            : (availableDates[0] ?? endDate);
    const daily = financeDaily(rows, startDate, endDate);
    const values =
      period === 'MONTH'
        ? weekGroups(daily, startDate, endDate)
        : period === 'TOTAL'
          ? fivePeriodGroups(daily)
          : daily;
    renderFinanceBars(chart, values);
    updatePanelHeading(
      panel,
      'Ingresos y gastos',
      period === 'MONTH'
        ? 'Último mes agrupado por semanas'
        : period === 'TOTAL'
          ? 'Histórico dividido en 5 periodos'
          : `${longDate(startDate)} — ${longDate(endDate)}`,
    );
    const summaryValues = panel.querySelectorAll<HTMLElement>('.chart-summary > div');
    const income = daily.reduce((sum, item) => sum + item.primary, 0);
    const expense = daily.reduce((sum, item) => sum + item.secondary, 0);
    const periodLabel =
      period === 'TODAY'
        ? 'de hoy'
        : period === '7D'
          ? 'de 7 días'
          : period === 'MONTH'
            ? 'del mes'
            : 'total';
    if (summaryValues[0]) {
      summaryValues[0].querySelector('span')!.textContent = `Ingresos ${periodLabel}`;
      summaryValues[0].querySelector('strong')!.textContent = money(income);
    }
    if (summaryValues[1]) {
      summaryValues[1].querySelector('span')!.textContent = `Gastos ${periodLabel}`;
      summaryValues[1].querySelector('strong')!.textContent = money(expense);
    }
    if (summaryValues[2]) {
      summaryValues[2].querySelector('span')!.textContent = `Resultado ${periodLabel}`;
      summaryValues[2].querySelector('strong')!.textContent = money(income - expense);
    }
  } catch {
    chart.replaceChildren(
      element('div', 'empty-state', 'No se pudo actualizar el gráfico financiero.'),
    );
  } finally {
    panel.dataset.runtimeFinanceLoading = 'false';
  }
}

function enhanceFinanceChart() {
  if (location.pathname !== '/finanzas') return;
  const panels = [...document.querySelectorAll<HTMLElement>('.panel')];
  const panel = panels.find((candidate) =>
    candidate.querySelector('h2')?.textContent?.includes('Ingresos y gastos'),
  );
  const summary = panel?.querySelector<HTMLElement>('.chart-summary');
  if (!panel || !summary) return;
  let periods = panel.querySelector<HTMLElement>('.runtime-finance-periods');
  if (!periods) {
    periods = element('div', 'chart-periods runtime-finance-periods');
    const options: Array<[ChartPeriod, string]> = [
      ['TODAY', 'Hoy'],
      ['7D', '7 días'],
      ['MONTH', '1 mes'],
      ['TOTAL', 'Total'],
    ];
    options.forEach(([code, label]) => {
      const button = element('button', 'chart-period-button', label);
      button.type = 'button';
      button.dataset.runtimePeriod = code;
      button.addEventListener('click', () => {
        setActivePeriod(periods!, code);
        void renderFinancePeriod(panel, code);
      });
      periods!.append(button);
    });
    summary.before(periods);
    setActivePeriod(periods, '7D');
  }
  if (panel.dataset.runtimeFinanceInitialized !== 'true') {
    panel.dataset.runtimeFinanceInitialized = 'true';
    void renderFinancePeriod(panel, '7D');
  }
}

function closeRuntimeModal() {
  document.querySelector('.runtime-help-backdrop')?.remove();
}

function showBankFormatHelp() {
  closeRuntimeModal();
  const backdrop = element('div', 'runtime-help-backdrop');
  const card = element('section', 'runtime-help-card');
  const header = element('header', 'runtime-help-header');
  const titleGroup = element('div');
  titleGroup.append(
    element('span', 'eyebrow', 'Formato admitido'),
    element('h2', '', 'Cómo preparar el extracto bancario'),
    element(
      'p',
      '',
      'La primera fila debe contener los nombres de las columnas. Se admiten archivos CSV y XLSX.',
    ),
  );
  const close = element('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar ayuda');
  close.addEventListener('click', closeRuntimeModal);
  header.append(titleGroup, close);
  const table = element('table', 'runtime-format-table');
  const head = element('thead');
  const headRow = element('tr');
  ['Fecha', 'Descripción', 'Referencia', 'Abono', 'Cargo', 'Saldo'].forEach((value) =>
    headRow.append(element('th', '', value)),
  );
  head.append(headRow);
  const body = element('tbody');
  [
    ['2026-07-29', 'YAPE CLIENTE PRUEBA', '11101', '40.00', '', '40.00'],
    ['2026-07-29', 'COMPRA DE EMBALAJE', 'TEST-GASTO', '', '12.50', '27.50'],
  ].forEach((values) => {
    const row = element('tr');
    values.forEach((value) => row.append(element('td', '', value)));
    body.append(row);
  });
  table.append(head, body);
  const notes = element('div', 'runtime-format-notes');
  notes.append(
    element('strong', '', 'También se acepta:'),
    element(
      'p',
      '',
      'Una sola columna llamada Monto o Importe. Los ingresos deben ser positivos y los egresos negativos.',
    ),
    element(
      'p',
      '',
      'Fecha y Descripción son obligatorias. Referencia y Saldo son opcionales. No combines Abono y Cargo en la misma fila.',
    ),
  );
  card.append(header, table, notes);
  backdrop.append(card);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeRuntimeModal();
  });
  document.body.append(backdrop);
}

function enhanceReconciliation() {
  if (location.pathname !== '/bancos/conciliacion') return;
  const main = document.querySelector<HTMLElement>('main.page');
  const controls = main?.querySelector<HTMLElement>('.reconciliation-controls');
  if (!main || !controls) return;
  const labels = [...controls.querySelectorAll<HTMLLabelElement>('label.field')];
  const fileLabel = labels.find((label) =>
    label.querySelector('span')?.textContent?.includes('Archivo'),
  );
  const select = fileLabel?.querySelector<HTMLSelectElement>('select');
  if (fileLabel && select && !fileLabel.querySelector('.reconciliation-clear-button')) {
    fileLabel.classList.add('reconciliation-file-field');
    const clear = element('button', 'reconciliation-clear-button', '×');
    clear.type = 'button';
    clear.title = 'Quitar archivo seleccionado';
    clear.setAttribute('aria-label', 'Quitar archivo seleccionado');
    clear.addEventListener('click', () => {
      main.classList.add('reconciliation-cleared');
      if (!select.querySelector('option[value=""]'))
        select.prepend(new Option('Sin archivo seleccionado', ''));
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      let empty = main.querySelector<HTMLElement>('.runtime-reconciliation-empty');
      if (!empty) {
        empty = element(
          'div',
          'empty-state runtime-reconciliation-empty',
          'No hay un archivo seleccionado. Puedes elegir otro lote o importar un nuevo Excel.',
        );
        controls.after(empty);
      }
    });
    select.addEventListener('change', () => {
      if (select.value) {
        main.classList.remove('reconciliation-cleared');
        main.querySelector('.runtime-reconciliation-empty')?.remove();
      }
    });
    fileLabel.append(clear);
  }

  const info = main.querySelector<HTMLElement>('.alert.alert-info');
  if (info && !info.querySelector('.runtime-format-help-button')) {
    const button = element('button', 'runtime-format-help-button', 'ⓘ Ver ejemplo del formato');
    button.type = 'button';
    button.addEventListener('click', showBankFormatHelp);
    info.append(button);
  }
}

function enhanceProductExport() {
  if (location.pathname !== '/productos') return;
  document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    if (!button.textContent?.includes('Exportar CSV')) return;
    [...button.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes('Exportar CSV'))
        node.textContent = node.textContent.replace('Exportar CSV', 'Exportar Excel');
    });
    button.title = 'Descarga un Excel organizado, filtrable y listo para revisar.';
  });
  document.querySelectorAll<HTMLElement>('.toast, .app-toast, [role="status"]').forEach((node) => {
    if (node.textContent?.includes('yukimi-productos-') && node.textContent.includes('.csv'))
      node.textContent = node.textContent.replaceAll('.csv', '.xlsx');
  });
}

function definitionRow(label: string, value: string) {
  const row = element('div', 'runtime-detail-row');
  row.append(element('span', '', label), element('strong', '', value));
  return row;
}

async function enhanceProductDetail() {
  const match = location.pathname.match(/^\/productos\/([0-9a-f-]+)$/i);
  if (!match) return;
  const main = document.querySelector<HTMLElement>('main.page');
  if (!main || main.querySelector('.runtime-product-profit-panel')) return;
  const productId = match[1]!;
  try {
    const [product, inventory] = await Promise.all([
      getProduct(productId),
      getInventory({ search: product.code, includeVirtual: false }),
    ]);
    if (main.querySelector('.runtime-product-profit-panel')) return;
    const panel = element('section', 'panel runtime-product-profit-panel');
    const heading = element('div', 'panel-heading');
    const headingText = element('div');
    headingText.append(
      element('h2', '', 'Costos, stock y rentabilidad'),
      element(
        'p',
        '',
        'Costo promedio actual por almacén y ganancia estimada según el precio de venta.',
      ),
    );
    heading.append(headingText);
    const cards = element('div', 'runtime-profit-grid');
    product.variants.forEach((variant) => {
      const rows = inventory.items.filter((item) => item.variantId === variant.id);
      const costRows = rows.filter((item) => item.currentUnitCostPen != null);
      const costWeight = costRows.reduce(
        (sum, item) => sum + Math.max(item.availableQuantity, 1),
        0,
      );
      const averageCost =
        costRows.length === 0
          ? null
          : costRows.reduce(
              (sum, item) =>
                sum + (item.currentUnitCostPen ?? 0) * Math.max(item.availableQuantity, 1),
              0,
            ) / Math.max(costWeight, 1);
      const profit = averageCost == null ? null : variant.salePrice - averageCost;
      const margin =
        profit == null || variant.salePrice <= 0 ? null : (profit / variant.salePrice) * 100;
      const card = element('article', 'runtime-profit-card');
      const cardHeader = element('header');
      const names = element('div');
      names.append(element('strong', '', variant.variantName), element('small', '', variant.sku));
      cardHeader.append(
        names,
        element('span', 'status-badge status-success', variant.isActive ? 'Activa' : 'Inactiva'),
      );
      const metrics = element('div', 'runtime-profit-metrics');
      metrics.append(
        definitionRow('Precio de venta', money(variant.salePrice)),
        definitionRow(
          'Costo promedio',
          averageCost == null ? 'Sin costo registrado' : money(averageCost),
        ),
        definitionRow('Ganancia estimada', profit == null ? '—' : money(profit)),
        definitionRow('Margen estimado', margin == null ? '—' : `${margin.toFixed(1)}%`),
        definitionRow('Código de barras', variant.barcode ?? 'No indicado'),
        definitionRow(
          'Peso',
          variant.weightGrams == null ? 'No indicado' : `${variant.weightGrams} g`,
        ),
      );
      const dimensions = Object.entries(variant.dimensions ?? {});
      if (dimensions.length > 0) {
        const attributes = element('div', 'runtime-attribute-list');
        dimensions.forEach(([key, value]) => attributes.append(definitionRow(key, String(value))));
        metrics.append(attributes);
      }
      const warehouseTable = element('table', 'runtime-warehouse-table');
      const header = element('tr');
      ['Almacén', 'Disponible', 'Reservado', 'Tránsito', 'Costo'].forEach((value) =>
        header.append(element('th', '', value)),
      );
      const thead = element('thead');
      thead.append(header);
      const tbody = element('tbody');
      rows.forEach((row) => {
        const tr = element('tr');
        [
          row.warehouseName,
          String(row.availableQuantity),
          String(row.reservedQuantity),
          String(row.inTransitQuantity),
          row.currentUnitCostPen == null ? '—' : money(row.currentUnitCostPen),
        ].forEach((value) => tr.append(element('td', '', value)));
        tbody.append(tr);
      });
      if (rows.length === 0) {
        const tr = element('tr');
        const td = element('td', '', 'Sin existencias registradas por almacén.');
        td.colSpan = 5;
        tr.append(td);
        tbody.append(tr);
      }
      warehouseTable.append(thead, tbody);
      card.append(cardHeader, metrics, warehouseTable);
      cards.append(card);
    });
    panel.append(heading, cards);
    const qrPanel = [...main.querySelectorAll<HTMLElement>('.panel')].find((candidate) =>
      candidate.querySelector('h2')?.textContent?.includes('Etiqueta QR'),
    );
    if (qrPanel) main.insertBefore(panel, qrPanel);
    else main.append(panel);
  } catch {
    // El detalle principal sigue disponible aunque el resumen complementario no pueda cargarse.
  }
}

async function fetchAllImports(): Promise<ImportItem[]> {
  const first = await getImports({ filter: 'ALL', page: 1, pageSize: 100 });
  const items = [...first.items];
  const pages = Math.ceil(first.total / first.pageSize);
  for (let page = 2; page <= pages; page += 1)
    items.push(...(await getImports({ filter: 'ALL', page, pageSize: 100 })).items);
  return items;
}

async function fetchAllDeliveries(): Promise<DeliveryItem[]> {
  const first = await getDeliveries({ filter: 'ALL', page: 1, pageSize: 100 });
  const items = [...first.items];
  const pages = Math.ceil(first.total / first.pageSize);
  for (let page = 2; page <= pages; page += 1)
    items.push(...(await getDeliveries({ filter: 'ALL', page, pageSize: 100 })).items);
  return items;
}

async function fetchAllClients(): Promise<ClientItem[]> {
  const first = await getClients({ filter: 'ALL', page: 1, pageSize: 100 });
  const items = [...first.items];
  const pages = Math.ceil(first.total / first.pageSize);
  for (let page = 2; page <= pages; page += 1)
    items.push(...(await getClients({ filter: 'ALL', page, pageSize: 100 })).items);
  return items;
}

function rowsInPeriod<T>(
  items: T[],
  dateOf: (item: T) => string | null,
  start: string,
  end: string,
) {
  return items.filter((item) => {
    const value = dateOf(item)?.slice(0, 10);
    return Boolean(value && value >= start && value <= end);
  });
}

function reportWorkbook(
  report: Awaited<ReturnType<typeof getReports>>,
  finance: FinanceTransaction[],
  imports: ImportItem[],
  deliveries: DeliveryItem[],
  clients: ClientItem[],
  startDate: string,
  endDate: string,
  warehouseName: string,
): WorkbookSheet[] {
  const expenses = finance.filter(
    (item) =>
      !['INCOME', 'LOAN_RECEIVED', 'LOAN_COLLECTION', 'TRANSFER', 'REVERSAL'].includes(
        item.transactionTypeCode,
      ) && item.stateCode !== 'REVERSED',
  );
  return [
    {
      name: 'Resumen general',
      rows: [
        ['YUKIMI GESTIÓN — REPORTE GENERAL'],
        ['Periodo', startDate, endDate],
        ['Almacén', warehouseName],
        [
          'Generado',
          new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short' }).format(
            new Date(),
          ),
        ],
        [],
        ['INDICADORES PRINCIPALES'],
        ['Indicador', 'Resultado'],
        ['Ventas netas', report.summary.netSales],
        ['Cobrado', report.summary.collected],
        ['Costo estimado', report.summary.estimatedCost],
        ['Ganancia estimada', report.summary.estimatedProfit],
        ['Ticket promedio', report.summary.averageTicket],
        ['Saldo por cobrar', report.summary.outstandingBalance],
        ['Ventas registradas', report.summary.salesCount],
        ['Unidades vendidas', report.summary.unitsSold],
      ],
      freezeRows: 6,
      autoFilterRow: 7,
      columnWidths: [28, 22, 22, 22],
    },
    {
      name: 'Ventas y cobros',
      rows: [
        ['VENTAS Y COBROS POR DÍA'],
        ['Fecha', 'Ventas', 'Cobros', 'Cantidad de ventas'],
        ...report.daily.map((item) => [
          item.date.slice(0, 10),
          item.salesAmount,
          item.collectionsAmount,
          item.salesCount,
        ]),
      ],
      freezeRows: 2,
      autoFilterRow: 2,
    },
    {
      name: 'Productos',
      rows: [
        ['PRODUCTOS MÁS VENDIDOS'],
        [
          'SKU',
          'Producto',
          'Variante',
          'Unidades',
          'Ventas',
          'Costo estimado',
          'Ganancia estimada',
        ],
        ...report.topProducts.map((item) => [
          item.sku,
          item.productName,
          item.variantName,
          item.units,
          item.revenue,
          item.cost,
          item.profit,
        ]),
      ],
      freezeRows: 2,
      autoFilterRow: 2,
    },
    {
      name: 'Clientes',
      rows: [
        ['CLIENTES Y SALDOS'],
        [
          'Código',
          'Cliente',
          'Documento',
          'Teléfono',
          'VIP',
          'Comprado',
          'Saldo',
          'Vencidas',
          'Última compra',
        ],
        ...clients.map((item) => [
          item.code,
          item.fullName,
          [item.documentType, item.documentNumber].filter(Boolean).join(' '),
          item.phone ?? '',
          item.isVip ? 'Sí' : 'No',
          item.totalPurchased,
          item.balanceAmount,
          item.overdueSales,
          item.lastPurchaseAt?.slice(0, 10) ?? '',
        ]),
      ],
      freezeRows: 2,
      autoFilterRow: 2,
    },
    {
      name: 'Inventario',
      rows: [
        ['INVENTARIO Y STOCK BAJO'],
        ['Indicador', 'Resultado'],
        ['Unidades disponibles', report.inventory.availableUnits],
        ['Unidades comprometidas', report.inventory.reservedUnits],
        ['Variantes con stock bajo', report.inventory.lowStockVariants],
        ['Valorización estimada', report.inventory.valuationPen],
        [],
        ['DETALLE DE STOCK BAJO'],
        ['SKU', 'Producto', 'Variante', 'Disponible', 'Mínimo'],
        ...report.lowStock.map((item) => [
          item.sku,
          item.productName,
          item.variantName,
          item.available,
          item.minimum,
        ]),
      ],
      freezeRows: 2,
    },
    {
      name: 'Gastos',
      rows: [
        ['GASTOS DEL PERIODO'],
        [
          'Fecha',
          'Código',
          'Descripción',
          'Categoría',
          'Cuenta',
          'Importe',
          'Estado',
          'Registrado por',
        ],
        ...expenses.map((item) => [
          item.occurredAt.slice(0, 10),
          item.code,
          item.description,
          item.categoryName ?? '',
          item.accountNames,
          item.totalAmount,
          item.stateCode,
          item.createdByName ?? 'Sistema',
        ]),
      ],
      freezeRows: 2,
      autoFilterRow: 2,
    },
    {
      name: 'Movimientos financieros',
      rows: [
        ['MOVIMIENTOS FINANCIEROS'],
        [
          'Fecha',
          'Código',
          'Tipo',
          'Descripción',
          'Categoría',
          'Cuenta',
          'Importe',
          'Moneda',
          'Estado',
        ],
        ...finance.map((item) => [
          item.occurredAt.slice(0, 10),
          item.code,
          item.transactionTypeCode,
          item.description,
          item.categoryName ?? '',
          item.accountNames,
          item.totalAmount,
          item.currencyCode,
          item.stateCode,
        ]),
      ],
      freezeRows: 2,
      autoFilterRow: 2,
    },
    {
      name: 'Compras e importaciones',
      rows: [
        ['COMPRAS E IMPORTACIONES'],
        [
          'Código',
          'Proveedor',
          'Compra',
          'Llegada estimada',
          'Estado',
          'Cajas',
          'Esperado',
          'Recibido',
          'Costo PEN',
          'Incidentes',
        ],
        ...imports.map((item) => [
          item.code,
          item.supplierName ?? '',
          item.purchaseDate ?? '',
          item.estimatedArrivalDate ?? '',
          item.stateCode,
          item.boxCount,
          item.totalExpectedUnits,
          item.totalReceivedUnits,
          item.totalCostPen,
          item.openIncidents,
        ]),
      ],
      freezeRows: 2,
      autoFilterRow: 2,
    },
    {
      name: 'Entregas',
      rows: [
        ['ENTREGAS'],
        [
          'Código',
          'Venta',
          'Cliente',
          'Método',
          'Estado',
          'Operador',
          'Tracking',
          'Fecha planificada',
          'Unidades',
          'Costo de envío',
        ],
        ...deliveries.map((item) => [
          item.code,
          item.saleCode,
          item.clientName,
          item.deliveryMethod,
          item.stateCode,
          item.operatorName ?? '',
          item.trackingNumber ?? '',
          item.plannedDispatchDate ?? '',
          item.totalUnits,
          item.shippingCost,
        ]),
      ],
      freezeRows: 2,
      autoFilterRow: 2,
    },
  ];
}

function reportPdf(
  report: Awaited<ReturnType<typeof getReports>>,
  finance: FinanceTransaction[],
  imports: ImportItem[],
  deliveries: DeliveryItem[],
  startDate: string,
  endDate: string,
  warehouseName: string,
): BusinessPdfReport {
  const income = finance
    .filter((item) =>
      ['INCOME', 'LOAN_RECEIVED', 'LOAN_COLLECTION'].includes(item.transactionTypeCode),
    )
    .reduce((sum, item) => sum + item.totalAmount, 0);
  const expense = finance
    .filter(
      (item) =>
        !['INCOME', 'LOAN_RECEIVED', 'LOAN_COLLECTION', 'TRANSFER', 'REVERSAL'].includes(
          item.transactionTypeCode,
        ) && item.stateCode !== 'REVERSED',
    )
    .reduce((sum, item) => sum + item.totalAmount, 0);
  return {
    title: 'Yukimi Gestión — Reporte ejecutivo',
    subtitle: `${longDate(startDate)} — ${longDate(endDate)}`,
    metadata: [`Almacén: ${warehouseName}`, `Generado: ${new Date().toLocaleString('es-PE')}`],
    sections: [
      {
        title: 'Resumen del negocio',
        columns: ['Indicador', 'Resultado'],
        rows: [
          ['Ventas netas', money(report.summary.netSales)],
          ['Cobrado', money(report.summary.collected)],
          ['Ganancia estimada', money(report.summary.estimatedProfit)],
          ['Saldo por cobrar', money(report.summary.outstandingBalance)],
          ['Ingresos financieros', money(income)],
          ['Gastos financieros', money(expense)],
          ['Resultado financiero', money(income - expense)],
        ],
      },
      {
        title: 'Productos principales',
        columns: ['Producto', 'Unidades', 'Ventas', 'Ganancia'],
        rows: report.topProducts
          .slice(0, 10)
          .map((item) => [
            item.productName,
            String(item.units),
            money(item.revenue),
            money(item.profit),
          ]),
      },
      {
        title: 'Clientes principales',
        columns: ['Cliente', 'Ventas', 'Comprado', 'Saldo'],
        rows: report.topClients
          .slice(0, 10)
          .map((item) => [
            item.clientName,
            String(item.salesCount),
            money(item.purchased),
            money(item.outstanding),
          ]),
      },
      {
        title: 'Inventario',
        columns: ['Indicador', 'Resultado'],
        rows: [
          ['Disponibles', String(report.inventory.availableUnits)],
          ['Comprometidas', String(report.inventory.reservedUnits)],
          ['Stock bajo', String(report.inventory.lowStockVariants)],
          ['Valorización', money(report.inventory.valuationPen)],
        ],
      },
      {
        title: 'Importaciones',
        columns: ['Código', 'Estado', 'Esperado', 'Recibido', 'Costo'],
        rows: imports
          .slice(0, 12)
          .map((item) => [
            item.code,
            item.stateCode,
            String(item.totalExpectedUnits),
            String(item.totalReceivedUnits),
            money(item.totalCostPen),
          ]),
      },
      {
        title: 'Entregas',
        columns: ['Código', 'Cliente', 'Estado', 'Unidades', 'Costo'],
        rows: deliveries
          .slice(0, 12)
          .map((item) => [
            item.code,
            item.clientName,
            item.stateCode,
            String(item.totalUnits),
            money(item.shippingCost),
          ]),
      },
    ],
  };
}

function runtimeNotice(message: string, tone: 'success' | 'error' = 'success') {
  document.querySelector('.runtime-export-notice')?.remove();
  const notice = element('div', `runtime-export-notice ${tone}`, message);
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 5000);
}

async function runEnhancedReportExport(format: 'XLSX' | 'PDF') {
  const main = document.querySelector<HTMLElement>('main.reports-page');
  if (!main || main.dataset.runtimeExporting === 'true') return;
  main.dataset.runtimeExporting = 'true';
  try {
    const dates = [...main.querySelectorAll<HTMLInputElement>('input[type="date"]')];
    const startDate = dates[0]?.value;
    const endDate = dates[1]?.value;
    const warehouseSelect = main.querySelector<HTMLSelectElement>('select');
    const warehouseId = warehouseSelect?.value ?? '';
    if (!startDate || !endDate) throw new Error('Selecciona el periodo del reporte.');
    runtimeNotice('Preparando el reporte completo…');
    const [report, financeAll, importsAll, deliveriesAll, clients] = await Promise.all([
      getReports({ startDate, endDate, warehouseId: warehouseId || undefined }),
      allFinanceTransactions(),
      fetchAllImports(),
      fetchAllDeliveries(),
      fetchAllClients(),
    ]);
    const finance = rowsInPeriod(financeAll, (item) => item.occurredAt, startDate, endDate);
    const imports = rowsInPeriod(
      importsAll,
      (item) => item.purchaseDate ?? item.createdAt,
      startDate,
      endDate,
    );
    const deliveries = rowsInPeriod(deliveriesAll, (item) => item.createdAt, startDate, endDate);
    const warehouseName =
      report.warehouses.find((item) => item.id === warehouseId)?.name ?? 'Todos los almacenes';
    const filename = `yukimi-reporte-${startDate}-${endDate}.${format === 'XLSX' ? 'xlsx' : 'pdf'}`;
    if (format === 'XLSX')
      downloadXlsx(
        filename,
        reportWorkbook(
          report,
          finance,
          imports,
          deliveries,
          clients,
          startDate,
          endDate,
          warehouseName,
        ),
      );
    else
      downloadBusinessPdf(
        filename,
        reportPdf(report, finance, imports, deliveries, startDate, endDate, warehouseName),
      );
    try {
      await registerReportExport({
        reportType: 'GENERAL',
        format,
        startDate,
        endDate,
        filename,
        filters: { warehouseId: warehouseId || null, enhancedSections: true },
      });
    } catch {
      // La descarga no se bloquea si falla únicamente el registro de auditoría.
    }
    runtimeNotice(
      format === 'XLSX'
        ? 'Excel completo descargado con hojas separadas.'
        : 'PDF ejecutivo descargado correctamente.',
    );
  } catch (error) {
    runtimeNotice(
      error instanceof Error ? error.message : 'No se pudo preparar el reporte.',
      'error',
    );
  } finally {
    main.dataset.runtimeExporting = 'false';
  }
}

function enhanceReports() {
  if (location.pathname !== '/reportes') return;
  const main = document.querySelector<HTMLElement>('main.reports-page');
  if (!main) return;
  main.querySelectorAll<HTMLButtonElement>('.page-header button').forEach((button) => {
    const label = button.textContent?.trim();
    const format = label?.includes('Excel') ? 'XLSX' : label?.includes('PDF') ? 'PDF' : null;
    if (!format || button.dataset.runtimeReportBound === 'true') return;
    button.dataset.runtimeReportBound = 'true';
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        void runEnhancedReportExport(format);
      },
      { capture: true },
    );
  });
}

function enhanceDraftNavigation() {
  if (document.documentElement.dataset.runtimeDraftListener === 'true') return;
  document.documentElement.dataset.runtimeDraftListener = 'true';
  window.addEventListener('yukimi:sale-draft-saved', () => {
    window.setTimeout(() => {
      window.location.assign('/ventas');
    }, 450);
  });
}

function runEnhancements() {
  enhanceDashboard();
  enhanceFinanceChart();
  enhanceReconciliation();
  enhanceProductExport();
  void enhanceProductDetail();
  enhanceReports();
}

export function installRuntimeUxEnhancements() {
  if (document.documentElement.dataset.runtimeUxInstalled === 'true') return;
  document.documentElement.dataset.runtimeUxInstalled = 'true';
  enhanceDraftNavigation();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      runEnhancements();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();

  void getBankReconciliation;
}
