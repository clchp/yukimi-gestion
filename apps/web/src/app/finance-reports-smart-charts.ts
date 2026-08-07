import { getFinanceTransactions } from '../features/finance/finance-api';
import { getReports } from '../features/insights/insights-api';

type FinancePeriod = 'TODAY' | '7D' | 'MONTH' | 'TOTAL';
type FinanceTransaction = Awaited<ReturnType<typeof getFinanceTransactions>>['items'][number];
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
  return (
    Math.floor((dateFrom(endDate).getTime() - dateFrom(startDate).getTime()) / 86_400_000) + 1
  );
}

function longDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(dateFrom(value));
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

function groupIntoPeriods(
  values: SeriesValue[],
  startDate: string,
  endDate: string,
  maxPoints = 10,
): PeriodValue[] {
  const totalDays = Math.max(1, daysBetween(startDate, endDate));
  const groupCount = smartGroupCount(totalDays, maxPoints);
  return Array.from({ length: groupCount }, (_, index) => {
    const startOffset = Math.floor((index * totalDays) / groupCount);
    const nextOffset = Math.floor(((index + 1) * totalDays) / groupCount);
    const groupStart = shiftDays(startDate, startOffset);
    const groupEnd = shiftDays(startDate, Math.max(startOffset, nextOffset - 1));
    const selected = values.filter((item) => item.date >= groupStart && item.date <= groupEnd);
    return {
      startDate: groupStart,
      endDate: groupEnd,
      label: totalDays === 1 ? 'Hoy' : rangeLabel(groupStart, groupEnd),
      primary: selected.reduce((sum, item) => sum + item.primary, 0),
      secondary: selected.reduce((sum, item) => sum + item.secondary, 0),
    };
  });
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
  salesLine.setAttribute(
    'points',
    points.map((item) => `${item.x},${item.primaryY}`).join(' '),
  );
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
    const tooltip = `${item.label} · Ventas ${money(item.primary)} · Cobros ${money(item.secondary)}`;
    hit.dataset.tooltip = tooltip;
    hit.setAttribute('aria-label', tooltip);
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
  chart.style.gridTemplateColumns = `repeat(${Math.max(periods.length, 1)}, minmax(52px, 1fr))`;
  periods.forEach((item) => {
    const column = element('div', 'smart-finance-column');
    const tooltip = element('span', 'smart-finance-tooltip');
    tooltip.append(
      element('strong', '', item.label),
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

async function allFinanceTransactions() {
  const first = await getFinanceTransactions({ type: 'ALL', page: 1, pageSize: 100 });
  const rows = [...first.items];
  const pages = Math.ceil(first.total / first.pageSize);
  for (let page = 2; page <= pages; page += 1) {
    rows.push(...(await getFinanceTransactions({ type: 'ALL', page, pageSize: 100 })).items);
  }
  return rows;
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
  if (period === 'MONTH') return { startDate: `${endDate.slice(0, 8)}01`, endDate };
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
  if (period === 'MONTH') return 'del mes';
  return 'del histórico';
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
    const periods = groupIntoPeriods(series, startDate, endDate, 8);
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
      summaryValues[2].querySelector('strong')!.classList.toggle('text-danger', income - expense < 0);
      summaryValues[2].querySelector('strong')!.classList.toggle('text-success', income - expense >= 0);
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

  const successNotice = document.querySelector<HTMLElement>('.alert.alert-success')?.textContent?.trim();
  if (successNotice && panel.dataset.smartFinanceNotice !== successNotice) {
    panel.dataset.smartFinanceNotice = successNotice;
    panel.dataset.smartFinanceKey = '';
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
      metric('Ventas registradas', String(data.summary.salesCount), `${data.summary.unitsSold} unidades`),
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
    shell.replaceChildren(element('div', 'empty-state', 'No se pudo actualizar el gráfico del reporte.'));
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

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(() => {
    scheduled = false;
    enhanceFinanceChart();
    enhanceReportChart();
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
  window.addEventListener('popstate', schedule);
  schedule();
}
