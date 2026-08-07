import { getFinanceTransactions } from '../features/finance/finance-api';
import { getReports } from '../features/insights/insights-api';
import { getSales } from '../features/sales/sales-api';

type FinancePeriod = 'TODAY' | '7D' | 'MONTH' | 'TOTAL';
type DashboardPeriod = 'TODAY' | '7D' | 'MONTH' | 'TOTAL';
type FinanceTransaction = Awaited<ReturnType<typeof getFinanceTransactions>>['items'][number];
type SaleRow = Awaited<ReturnType<typeof getSales>>['items'][number];
type SeriesValue = {
  date: string;
  primary: number;
  secondary: number;
};
type PeriodValue = {
  startDate: string;
  endDate: string;
  label: string;
  primary: number;
  secondary: number;
};

const moneyFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
});

function money(value: number) {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function svgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
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

function daysBetween(startDate: string, endDate: string) {
  return Math.floor((dateFrom(endDate).getTime() - dateFrom(startDate).getTime()) / 86_400_000) + 1;
}

function longDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dateFrom(value));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' })
    .format(dateFrom(value))
    .replace('.', '');
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat('es-PE', { month: 'short' })
    .format(dateFrom(value))
    .replace('.', '');
}

function rangeLabel(startDate: string, endDate: string) {
  const start = dateFrom(startDate);
  const end = dateFrom(endDate);
  const startDay = String(start.getDate()).padStart(2, '0');
  const endDay = String(end.getDate()).padStart(2, '0');
  if (startDate === endDate) return `${startDay} ${monthLabel(startDate)}`;
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${startDay}–${endDay} ${monthLabel(endDate)}`;
  }
  return `${startDay} ${monthLabel(startDate)}–${endDay} ${monthLabel(endDate)}`;
}

function smartGroupCount(totalDays: number, maxPoints: number) {
  if (totalDays <= 1) return 1;
  const desired = totalDays <= 7 ? 3 : totalDays <= 31 ? 6 : totalDays <= 90 ? 8 : maxPoints;
  return Math.max(1, Math.min(maxPoints, desired, Math.floor(totalDays / 2)));
}

function groupFixedCount(
  values: SeriesValue[],
  startDate: string,
  endDate: string,
  requestedCount: number,
): PeriodValue[] {
  const totalDays = Math.max(1, daysBetween(startDate, endDate));
  const count = Math.max(1, Math.min(requestedCount, totalDays));
  return Array.from({ length: count }, (_, index) => {
    const startOffset = Math.floor((index * totalDays) / count);
    const nextOffset = Math.floor(((index + 1) * totalDays) / count);
    const groupStart = shiftDays(startDate, startOffset);
    const groupEnd = shiftDays(startDate, Math.max(startOffset, nextOffset - 1));
    const selected = values.filter((item) => item.date >= groupStart && item.date <= groupEnd);
    return {
      startDate: groupStart,
      endDate: groupEnd,
      label: rangeLabel(groupStart, groupEnd),
      primary: selected.reduce((sum, item) => sum + item.primary, 0),
      secondary: selected.reduce((sum, item) => sum + item.secondary, 0),
    };
  });
}

function groupIntoPeriods(
  values: SeriesValue[],
  startDate: string,
  endDate: string,
  maxPoints = 10,
): PeriodValue[] {
  const totalDays = Math.max(1, daysBetween(startDate, endDate));
  return groupFixedCount(values, startDate, endDate, smartGroupCount(totalDays, maxPoints));
}

function dailyPeriods(values: SeriesValue[], startDate: string, endDate: string): PeriodValue[] {
  const byDate = new Map(values.map((item) => [item.date, item]));
  const periods: PeriodValue[] = [];
  for (let date = startDate; date <= endDate; date = shiftDays(date, 1)) {
    const current = byDate.get(date);
    periods.push({
      startDate: date,
      endDate: date,
      label: shortDate(date),
      primary: current?.primary ?? 0,
      secondary: current?.secondary ?? 0,
    });
  }
  return periods;
}

function metric(label: string, value: string, detail?: string) {
  const card = element('div', 'smart-chart-metric');
  card.append(element('span', '', label), element('strong', '', value));
  if (detail) card.append(element('small', '', detail));
  return card;
}

function legend(primaryLabel: string, secondaryLabel: string) {
  const result = element('div', 'smart-chart-legend');
  const primary = element('span');
  primary.append(element('i', 'smart-legend-dot smart-legend-primary'), primaryLabel);
  const secondary = element('span');
  secondary.append(element('i', 'smart-legend-dot smart-legend-secondary'), secondaryLabel);
  result.append(primary, secondary);
  return result;
}

function lineChart(periods: PeriodValue[]) {
  const stage = element('div', 'smart-line-stage');
  const svg = svgElement('svg');
  svg.classList.add('smart-line-svg');
  svg.setAttribute('viewBox', '0 0 1000 270');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  [24, 78, 132, 186, 240].forEach((y) => {
    const line = svgElement('line');
    line.classList.add('smart-line-grid');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', '1000');
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    svg.append(line);
  });

  const maximum = Math.max(
    1,
    ...periods.flatMap((item) => [Math.max(0, item.primary), Math.max(0, item.secondary)]),
  );
  const points = periods.map((item, index) => {
    const x = ((index + 0.5) / Math.max(periods.length, 1)) * 1000;
    return {
      ...item,
      x,
      primaryY: 240 - (Math.max(0, item.primary) / maximum) * 205,
      secondaryY: 240 - (Math.max(0, item.secondary) / maximum) * 205,
    };
  });

  const salesLine = svgElement('polyline');
  salesLine.classList.add('smart-line-path', 'smart-line-path-primary');
  salesLine.setAttribute('points', points.map((item) => `${item.x},${item.primaryY}`).join(' '));
  const collectionsLine = svgElement('polyline');
  collectionsLine.classList.add('smart-line-path', 'smart-line-path-secondary');
  collectionsLine.setAttribute(
    'points',
    points.map((item) => `${item.x},${item.secondaryY}`).join(' '),
  );
  svg.append(salesLine, collectionsLine);

  points.forEach((item) => {
    const primaryPoint = svgElement('circle');
    primaryPoint.classList.add('smart-line-point', 'smart-line-point-primary');
    primaryPoint.setAttribute('cx', String(item.x));
    primaryPoint.setAttribute('cy', String(item.primaryY));
    primaryPoint.setAttribute('r', '7');
    const secondaryPoint = svgElement('circle');
    secondaryPoint.classList.add('smart-line-point', 'smart-line-point-secondary');
    secondaryPoint.setAttribute('cx', String(item.x));
    secondaryPoint.setAttribute('cy', String(item.secondaryY));
    secondaryPoint.setAttribute('r', '7');
    svg.append(primaryPoint, secondaryPoint);

    const hit = element('button', 'smart-line-hit');
    hit.type = 'button';
    hit.style.left = `${(item.x / 1000) * 100}%`;
    const tooltip = `Fecha: ${item.label}\nVentas: ${money(item.primary)}\nCobros: ${money(item.secondary)}`;
    hit.dataset.tooltip = tooltip;
    hit.setAttribute(
      'aria-label',
      `Fecha ${item.label}. Ventas ${money(item.primary)}. Cobros ${money(item.secondary)}.`,
    );
    stage.append(hit);
  });

  stage.prepend(svg);
  const labels = element('div', 'smart-line-labels');
  labels.style.gridTemplateColumns = `repeat(${Math.max(periods.length, 1)}, minmax(0, 1fr))`;
  periods.forEach((item) => labels.append(element('small', '', item.label)));
  const wrapper = element('div', 'smart-line-chart');
  wrapper.append(stage, labels);
  return wrapper;
}

function financeBars(periods: PeriodValue[]) {
  const maximum = Math.max(
    1,
    ...periods.flatMap((item) => [Math.max(0, item.primary), Math.max(0, item.secondary)]),
  );
  const chart = element('div', 'smart-finance-bars');
  chart.dataset.columns = String(periods.length);
  chart.style.gridTemplateColumns = `repeat(${Math.max(periods.length, 1)}, minmax(52px, 1fr))`;
  periods.forEach((item) => {
    const column = element('div', 'smart-finance-column');
    const tooltip = element('span', 'smart-finance-tooltip');
    tooltip.append(
      element(
        'strong',
        '',
        `${item.startDate === item.endDate ? 'Fecha' : 'Intervalo'}: ${item.label}`,
      ),
      element('span', '', `Ingresos: ${money(item.primary)}`),
      element('span', '', `Gastos: ${money(item.secondary)}`),
    );
    const bars = element('div', 'smart-finance-bar-area');
    const income = element('span', 'smart-finance-income');
    income.style.height = `${Math.max(item.primary > 0 ? 4 : 0, (item.primary / maximum) * 100)}%`;
    const expense = element('span', 'smart-finance-expense');
    expense.style.height = `${Math.max(item.secondary > 0 ? 4 : 0, (item.secondary / maximum) * 100)}%`;
    bars.append(income, expense);
    column.append(tooltip, bars, element('small', '', item.label));
    chart.append(column);
  });
  return chart;
}

function updatePanelHeading(panel: HTMLElement, title: string, subtitle: string) {
  const heading = panel.querySelector<HTMLElement>('.panel-heading');
  const headingTitle = heading?.querySelector<HTMLElement>('h2');
  const headingSubtitle = heading?.querySelector<HTMLElement>('p');
  if (headingTitle) headingTitle.textContent = title;
  if (headingSubtitle) headingSubtitle.textContent = subtitle;
}

let financeTransactionsPromise: Promise<FinanceTransaction[]> | null = null;
let salesRowsPromise: Promise<SaleRow[]> | null = null;

async function allFinanceTransactions() {
  financeTransactionsPromise ??= (async () => {
    const first = await getFinanceTransactions({ type: 'ALL', page: 1, pageSize: 100 });
    const rows = [...first.items];
    const pages = Math.ceil(first.total / first.pageSize);
    for (let page = 2; page <= pages; page += 1) {
      rows.push(...(await getFinanceTransactions({ type: 'ALL', page, pageSize: 100 })).items);
    }
    return rows;
  })();
  return financeTransactionsPromise;
}

async function allSalesRows() {
  salesRowsPromise ??= (async () => {
    const first = await getSales({ filter: 'ALL', page: 1, pageSize: 100 });
    const rows = [...first.items];
    const pages = Math.ceil(first.total / first.pageSize);
    for (let page = 2; page <= pages; page += 1) {
      rows.push(...(await getSales({ filter: 'ALL', page, pageSize: 100 })).items);
    }
    return rows;
  })();
  return salesRowsPromise;
}

function financeSeries(rows: FinanceTransaction[], startDate: string, endDate: string) {
  const incoming = new Set(['INCOME', 'LOAN_RECEIVED', 'LOAN_COLLECTION']);
  const map = new Map<string, SeriesValue>();
  rows.forEach((item) => {
    const date = item.occurredAt.slice(0, 10);
    if (date < startDate || date > endDate || item.stateCode === 'REVERSED') return;
    if (['TRANSFER', 'REVERSAL'].includes(item.transactionTypeCode)) return;
    const current = map.get(date) ?? { date, primary: 0, secondary: 0 };
    if (incoming.has(item.transactionTypeCode)) current.primary += item.totalAmount;
    else current.secondary += item.totalAmount;
    map.set(date, current);
  });
  return [...map.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function financeDateRange(rows: FinanceTransaction[], period: FinancePeriod) {
  const endDate = inputDate(new Date());
  if (period === 'TODAY') return { startDate: endDate, endDate };
  if (period === '7D') return { startDate: shiftDays(endDate, -6), endDate };
  if (period === 'MONTH') return { startDate: shiftDays(endDate, -29), endDate };
  const dates = rows
    .filter(
      (item) =>
        item.stateCode !== 'REVERSED' &&
        !['TRANSFER', 'REVERSAL'].includes(item.transactionTypeCode),
    )
    .map((item) => item.occurredAt.slice(0, 10))
    .sort();
  return { startDate: dates[0] ?? endDate, endDate };
}

function financePeriodLabel(period: FinancePeriod) {
  if (period === 'TODAY') return 'de hoy';
  if (period === '7D') return 'de 7 días';
  if (period === 'MONTH') return 'de 1 mes';
  return 'del histórico';
}

function financePeriods(
  series: SeriesValue[],
  startDate: string,
  endDate: string,
  period: FinancePeriod,
) {
  if (period === 'TODAY' || period === '7D') return dailyPeriods(series, startDate, endDate);
  if (period === 'MONTH') return groupFixedCount(series, startDate, endDate, 5);
  return groupFixedCount(series, startDate, endDate, Math.min(8, daysBetween(startDate, endDate)));
}

async function renderFinanceChart(panel: HTMLElement, period: FinancePeriod) {
  if (panel.dataset.smartFinanceLoading === 'true') return;
  panel.dataset.smartFinanceLoading = 'true';
  const chart = panel.querySelector<HTMLElement>('.dual-bar-chart');
  if (!chart) {
    panel.dataset.smartFinanceLoading = 'false';
    return;
  }
  try {
    const rows = await allFinanceTransactions();
    const { startDate, endDate } = financeDateRange(rows, period);
    const series = financeSeries(rows, startDate, endDate);
    const periods = financePeriods(series, startDate, endDate, period);
    chart.replaceChildren(financeBars(periods));
    chart.classList.add('smart-finance-chart-host');
    const subtitle =
      period === 'TODAY' ? longDate(endDate) : `${longDate(startDate)} — ${longDate(endDate)}`;
    updatePanelHeading(panel, 'Ingresos y gastos', subtitle);

    const income = series.reduce((sum, item) => sum + item.primary, 0);
    const expense = series.reduce((sum, item) => sum + item.secondary, 0);
    const summaryValues = panel.querySelectorAll<HTMLElement>('.chart-summary > div');
    const label = financePeriodLabel(period);
    if (summaryValues[0]) {
      summaryValues[0].querySelector('span')!.textContent = `Ingresos ${label}`;
      summaryValues[0].querySelector('strong')!.textContent = money(income);
    }
    if (summaryValues[1]) {
      summaryValues[1].querySelector('span')!.textContent = `Gastos ${label}`;
      summaryValues[1].querySelector('strong')!.textContent = money(expense);
    }
    if (summaryValues[2]) {
      summaryValues[2].querySelector('span')!.textContent = `Resultado ${label}`;
      summaryValues[2].querySelector('strong')!.textContent = money(income - expense);
      summaryValues[2]
        .querySelector('strong')!
        .classList.toggle('text-danger', income - expense < 0);
      summaryValues[2]
        .querySelector('strong')!
        .classList.toggle('text-success', income - expense >= 0);
    }

    let chartLegend = panel.querySelector<HTMLElement>('.smart-finance-legend');
    if (!chartLegend) {
      chartLegend = legend('Ingresos', 'Gastos');
      chartLegend.classList.add('smart-finance-legend');
      chart.before(chartLegend);
    }
    panel.dataset.smartFinanceKey = period;
  } catch {
    chart.replaceChildren(
      element('div', 'empty-state', 'No se pudo actualizar el gráfico financiero.'),
    );
  } finally {
    panel.dataset.smartFinanceLoading = 'false';
  }
}

function enhanceFinanceChart() {
  if (location.pathname !== '/finanzas') return;
  const panel = [...document.querySelectorAll<HTMLElement>('.panel')].find((candidate) =>
    candidate.querySelector('h2')?.textContent?.includes('Ingresos y gastos'),
  );
  const summary = panel?.querySelector<HTMLElement>('.chart-summary');
  const chart = panel?.querySelector<HTMLElement>('.dual-bar-chart');
  if (!panel || !summary || !chart) return;

  panel.classList.add('smart-analytics-panel');
  panel.dataset.runtimeFinanceInitialized = 'true';
  const legacyPeriods = panel.querySelector<HTMLElement>('.runtime-finance-periods');
  if (legacyPeriods) {
    legacyPeriods.hidden = true;
    legacyPeriods.classList.add('smart-legacy-periods-hidden');
  }

  let periods = panel.querySelector<HTMLElement>('.smart-finance-periods');
  if (!periods) {
    periods = element('div', 'chart-periods smart-finance-periods');
    const options: Array<[FinancePeriod, string]> = [
      ['TODAY', 'Hoy'],
      ['7D', '7 días'],
      ['MONTH', '1 mes'],
      ['TOTAL', 'Total'],
    ];
    options.forEach(([code, label]) => {
      const button = element('button', 'chart-period-button', label);
      button.type = 'button';
      button.dataset.smartFinancePeriod = code;
      button.addEventListener('click', () => {
        periods!.querySelectorAll('button').forEach((candidate) => {
          candidate.classList.toggle('active', candidate === button);
          candidate.setAttribute('aria-pressed', String(candidate === button));
        });
        void renderFinanceChart(panel, code);
      });
      periods!.append(button);
    });
    summary.before(periods);
    const initial = periods.querySelector<HTMLButtonElement>('[data-smart-finance-period="7D"]');
    initial?.classList.add('active');
    initial?.setAttribute('aria-pressed', 'true');
  }

  const successNotice = document
    .querySelector<HTMLElement>('.alert.alert-success')
    ?.textContent?.trim();
  if (successNotice && panel.dataset.smartFinanceNotice !== successNotice) {
    panel.dataset.smartFinanceNotice = successNotice;
    panel.dataset.smartFinanceKey = '';
    financeTransactionsPromise = null;
  }
  const currentPeriod =
    (periods.querySelector<HTMLButtonElement>('.active')?.dataset.smartFinancePeriod as
      | FinancePeriod
      | undefined) ?? '7D';
  const rendered = chart.querySelector('.smart-finance-bars');
  if (panel.dataset.smartFinanceKey !== currentPeriod || !rendered) {
    void renderFinanceChart(panel, currentPeriod);
  }
}

let reportRequest = 0;

function reportFilterValues() {
  const filters = document.querySelector<HTMLElement>('.report-filters');
  const dates = filters?.querySelectorAll<HTMLInputElement>('input[type="date"]');
  const warehouse = filters?.querySelector<HTMLSelectElement>('select');
  return {
    startDate: dates?.[0]?.value ?? '',
    endDate: dates?.[1]?.value ?? '',
    warehouseId: warehouse?.value ?? '',
  };
}

async function renderReportChart(panel: HTMLElement) {
  const { startDate, endDate, warehouseId } = reportFilterValues();
  if (!startDate || !endDate || startDate > endDate) return;
  const key = `${startDate}|${endDate}|${warehouseId}`;
  const existing = panel.querySelector<HTMLElement>('.smart-report-chart-shell');
  if (panel.dataset.smartReportKey === key && existing) return;
  const request = ++reportRequest;
  panel.dataset.smartReportLoading = key;
  try {
    const data = await getReports({
      startDate,
      endDate,
      warehouseId: warehouseId || undefined,
    });
    if (request !== reportRequest) return;
    const current = reportFilterValues();
    if (`${current.startDate}|${current.endDate}|${current.warehouseId}` !== key) return;

    const series: SeriesValue[] = data.daily.map((item) => ({
      date: item.date.slice(0, 10),
      primary: item.salesAmount,
      secondary: item.collectionsAmount,
    }));
    const periods = groupIntoPeriods(series, startDate, endDate, 10);
    const shell = existing ?? element('div', 'smart-report-chart-shell');
    shell.replaceChildren();

    const summary = element('div', 'smart-chart-summary');
    summary.append(
      metric('Ventas del periodo', money(data.summary.netSales)),
      metric('Cobros del periodo', money(data.summary.collected)),
      metric(
        'Ventas registradas',
        String(data.summary.salesCount),
        `${data.summary.unitsSold} unidades`,
      ),
    );
    const top = element('div', 'smart-report-chart-top');
    top.append(summary, legend('Ventas', 'Cobros'));
    const note = element(
      'small',
      'smart-chart-period-note',
      periods.length === 1
        ? 'El periodo seleccionado se muestra como un único bloque.'
        : `El periodo se agrupó automáticamente en ${periods.length} tramos para mantener el gráfico legible.`,
    );
    shell.append(top, lineChart(periods), note);

    const originalChart = panel.querySelector<HTMLElement>('.report-daily-chart');
    if (originalChart) {
      originalChart.hidden = true;
      originalChart.classList.add('smart-original-chart-hidden');
      if (!shell.isConnected) originalChart.after(shell);
    }
    const originalLegend = [...panel.children].find((child) =>
      child.classList.contains('chart-legend'),
    ) as HTMLElement | undefined;
    if (originalLegend) originalLegend.hidden = true;
    panel.classList.add('smart-analytics-panel');
    updatePanelHeading(
      panel,
      'Ventas y cobros',
      startDate === endDate ? longDate(startDate) : `${longDate(startDate)} — ${longDate(endDate)}`,
    );
    panel.dataset.smartReportKey = key;
  } catch {
    const originalChart = panel.querySelector<HTMLElement>('.report-daily-chart');
    let shell = panel.querySelector<HTMLElement>('.smart-report-chart-shell');
    if (!shell) {
      shell = element('div', 'smart-report-chart-shell');
      originalChart?.after(shell);
    }
    shell.replaceChildren(
      element('div', 'empty-state', 'No se pudo actualizar el gráfico del reporte.'),
    );
  } finally {
    delete panel.dataset.smartReportLoading;
  }
}

function enhanceReportChart() {
  if (location.pathname !== '/reportes') return;
  const panel = [...document.querySelectorAll<HTMLElement>('.panel')].find(
    (candidate) => candidate.querySelector('h2')?.textContent?.trim() === 'Ventas y cobros',
  );
  if (!panel) return;
  void renderReportChart(panel);
}

function validDashboardSale(row: SaleRow) {
  return !['CANCELLED', 'ANNULLED'].includes(row.commercialStateCode);
}

function validDashboardCollection(row: FinanceTransaction) {
  if (row.stateCode === 'REVERSED' || row.transactionTypeCode !== 'INCOME') return false;
  const description = row.description.toLocaleLowerCase('es');
  const category = row.categoryName?.toLocaleLowerCase('es') ?? '';
  return category.includes('venta') || description.includes('pago') || description.includes('venta');
}

async function dashboardRange(period: DashboardPeriod) {
  const endDate = inputDate(new Date());
  if (period === 'TODAY') return { startDate: endDate, endDate };
  if (period === '7D') return { startDate: shiftDays(endDate, -6), endDate };
  if (period === 'MONTH') return { startDate: shiftDays(endDate, -29), endDate };
  const [sales, finance] = await Promise.all([allSalesRows(), allFinanceTransactions()]);
  const dates = [
    ...sales.filter(validDashboardSale).map((item) => item.createdAt.slice(0, 10)),
    ...finance.filter(validDashboardCollection).map((item) => item.occurredAt.slice(0, 10)),
  ].sort();
  return { startDate: dates[0] ?? endDate, endDate };
}

function dashboardPeriods(
  series: SeriesValue[],
  startDate: string,
  endDate: string,
  period: DashboardPeriod,
) {
  if (period === 'TODAY' || period === '7D') return dailyPeriods(series, startDate, endDate);
  if (period === 'MONTH') return groupFixedCount(series, startDate, endDate, 5);
  return groupFixedCount(series, startDate, endDate, Math.min(5, daysBetween(startDate, endDate)));
}

function renderDashboardBars(chart: HTMLElement, periods: PeriodValue[]) {
  chart.replaceChildren();
  chart.style.gridTemplateColumns = `repeat(${Math.max(periods.length, 1)}, minmax(48px, 1fr))`;
  const maximum = Math.max(
    1,
    ...periods.flatMap((value) => [Math.max(0, value.primary), Math.max(0, value.secondary)]),
  );
  periods.forEach((value) => {
    const column = element('div', 'bar-column smart-dashboard-column');
    const tooltip = element('span', 'chart-tooltip smart-dashboard-tooltip');
    tooltip.append(
      element(
        'strong',
        '',
        `${value.startDate === value.endDate ? 'Fecha' : 'Intervalo'}: ${value.label}`,
      ),
      element('span', '', `Ventas: ${money(value.primary)}`),
      element('span', '', `Cobros: ${money(value.secondary)}`),
    );
    const button = element('button', 'bar-track dual-bar-track chart-bar-button');
    button.type = 'button';
    button.setAttribute(
      'aria-label',
      `${value.label}. Ventas ${money(value.primary)}. Cobros ${money(value.secondary)}.`,
    );
    const sales = element('span', 'sales-bar');
    sales.style.height = `${Math.max(value.primary > 0 ? 5 : 0, (value.primary / maximum) * 100)}%`;
    const collections = element('span', 'collections-bar');
    collections.style.height = `${Math.max(
      value.secondary > 0 ? 5 : 0,
      (value.secondary / maximum) * 100,
    )}%`;
    button.append(sales, collections);
    column.append(tooltip, button, element('small', '', value.label));
    chart.append(column);
  });
}

let dashboardRequest = 0;

async function renderDashboardChart(panel: HTMLElement, period: DashboardPeriod) {
  const chart = panel.querySelector<HTMLElement>('.dashboard-real-chart');
  if (!chart) return;
  const request = ++dashboardRequest;
  panel.dataset.smartDashboardLoading = period;
  try {
    const { startDate, endDate } = await dashboardRange(period);
    const report = await getReports({ startDate, endDate });
    if (request !== dashboardRequest || location.pathname !== '/') return;
    const series: SeriesValue[] = report.daily.map((item) => ({
      date: item.date.slice(0, 10),
      primary: item.salesAmount,
      secondary: item.collectionsAmount,
    }));
    const periods = dashboardPeriods(series, startDate, endDate, period);
    renderDashboardBars(chart, periods);
    const title =
      period === 'TODAY'
        ? 'Rendimiento de hoy'
        : period === '7D'
          ? 'Rendimiento de los últimos 7 días'
          : period === 'MONTH'
            ? 'Rendimiento de 1 mes en 5 intervalos'
            : 'Rendimiento histórico en 5 intervalos';
    updatePanelHeading(
      panel,
      title,
      startDate === endDate ? longDate(startDate) : `${longDate(startDate)} — ${longDate(endDate)}`,
    );
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
              ? 'Total de 1 mes'
              : 'Total histórico';
    if (total) total.textContent = money(series.reduce((sum, item) => sum + item.primary, 0));
    panel.dataset.smartDashboardKey = period;
  } catch {
    if (request !== dashboardRequest) return;
    chart.replaceChildren(element('div', 'empty-state', 'No se pudo actualizar el gráfico.'));
  } finally {
    delete panel.dataset.smartDashboardLoading;
  }
}

function dashboardPeriodFromButton(button: HTMLButtonElement): DashboardPeriod | null {
  const label = button.textContent?.trim();
  if (label === 'Hoy') return 'TODAY';
  if (label === '7 días') return '7D';
  if (label === 'Mes' || label === '1 mes') return 'MONTH';
  if (label === 'Total') return 'TOTAL';
  return null;
}

function enhanceDashboardChart() {
  if (location.pathname !== '/') return;
  const chart = document.querySelector<HTMLElement>('.dashboard-real-chart');
  const panel = chart?.closest<HTMLElement>('.panel');
  const periods = panel?.querySelector<HTMLElement>('.chart-periods');
  if (!chart || !panel || !periods) return;

  panel.dataset.pendingDashboardInitialized = 'true';
  panel.classList.add('smart-dashboard-panel');
  periods.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    if (button.textContent?.trim() === 'Personalizado') button.hidden = true;
    if (button.textContent?.trim() === 'Mes') button.textContent = '1 mes';
    const code = dashboardPeriodFromButton(button);
    if (code) button.dataset.smartDashboardPeriod = code;
  });
  let totalButton = periods.querySelector<HTMLButtonElement>('[data-smart-dashboard-period="TOTAL"]');
  if (!totalButton) {
    totalButton = element('button', 'chart-period-button', 'Total');
    totalButton.type = 'button';
    totalButton.dataset.smartDashboardPeriod = 'TOTAL';
    periods.append(totalButton);
  }

  let active = periods.querySelector<HTMLButtonElement>('[data-smart-dashboard-period].active');
  if (!active) {
    active = periods.querySelector<HTMLButtonElement>('[data-smart-dashboard-period="7D"]');
    active?.classList.add('active');
    active?.setAttribute('aria-pressed', 'true');
  }
  const currentPeriod =
    (active?.dataset.smartDashboardPeriod as DashboardPeriod | undefined) ?? '7D';
  if (
    panel.dataset.smartDashboardKey !== currentPeriod ||
    !chart.querySelector('.smart-dashboard-column')
  ) {
    void renderDashboardChart(panel, currentPeriod);
  }
}

function enhanceDashboardErrorDelay() {
  if (location.pathname !== '/') return;
  const alert = document.querySelector<HTMLElement>('.dashboard-page > .alert.alert-error');
  if (!alert || alert.dataset.smartDelayed === 'true') return;
  alert.dataset.smartDelayed = 'true';
  alert.classList.add('smart-dashboard-transient-error');
  window.setTimeout(() => {
    if (alert.isConnected) alert.classList.remove('smart-dashboard-transient-error');
  }, 1200);
}

function enhanceInventoryTable() {
  if (location.pathname !== '/inventario') return;
  const table = [...document.querySelectorAll<HTMLTableElement>('.table-panel table.data-table')].find(
    (candidate) => candidate.querySelector('th')?.textContent?.trim() === 'Producto',
  );
  table?.classList.add('smart-inventory-table');
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    enhanceFinanceChart();
    enhanceReportChart();
    enhanceDashboardChart();
    enhanceDashboardErrorDelay();
    enhanceInventoryTable();
  });
}

export function installFinanceReportsSmartCharts() {
  if (document.documentElement.dataset.financeReportsSmartCharts === 'true') return;
  document.documentElement.dataset.financeReportsSmartCharts = 'true';
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  document.addEventListener(
    'change',
    (event) => {
      const target = event.target as HTMLElement;
      if (location.pathname === '/reportes' && target.closest('.report-filters')) schedule();
    },
    true,
  );
  document.addEventListener(
    'click',
    (event) => {
      if (location.pathname !== '/') return;
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>(
        '.dashboard-page .chart-periods button[data-smart-dashboard-period]',
      );
      if (!button) return;
      const panel = button.closest<HTMLElement>('.panel');
      const periods = button.closest<HTMLElement>('.chart-periods');
      if (!panel || !periods) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      periods.querySelectorAll('button').forEach((candidate) => {
        candidate.classList.toggle('active', candidate === button);
        candidate.setAttribute('aria-pressed', String(candidate === button));
      });
      const period = button.dataset.smartDashboardPeriod as DashboardPeriod;
      void renderDashboardChart(panel, period);
    },
    true,
  );
  window.addEventListener('popstate', schedule);
  schedule();
}
