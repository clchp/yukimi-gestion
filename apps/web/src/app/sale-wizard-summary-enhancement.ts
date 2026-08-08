function longDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12));
}

function draftStorageKey() {
  const match = location.pathname.match(/^\/ventas\/borradores\/([0-9a-f-]+)/i);
  return match ? `yukimi:vip-deposit-due:${match[1]}` : 'yukimi:vip-deposit-due:new';
}

function parseMoney(value: string) {
  const normalized = value.replace(/[^0-9,.-]/g, '').replace(',', '.');
  return Number(normalized) || 0;
}

function enhanceSaleSummary() {
  if (!/^\/ventas\/(nueva|borradores\/)/.test(location.pathname)) return;
  const rows = [
    ...document.querySelectorAll<HTMLElement>('.review-grid > div, .summary-list > div'),
  ];
  const minimumRow = rows.find((row) => row.textContent?.includes('Adelanto mínimo acordado'));
  const minimumText = minimumRow?.querySelector('strong')?.textContent ?? '';
  const minimum = parseMoney(minimumText);
  const deadline = localStorage.getItem(draftStorageKey()) ?? '';
  if (
    minimumRow &&
    minimum > 0 &&
    deadline &&
    !minimumRow.parentElement?.querySelector('.pending-deposit-review-row')
  ) {
    const row = document.createElement('div');
    row.className = 'pending-deposit-review-row';
    const label = document.createElement('span');
    label.textContent = 'Fecha límite del adelanto';
    const value = document.createElement('strong');
    value.textContent = longDate(deadline);
    row.append(label, value);
    minimumRow.after(row);
  }

  const deliveryRow = rows.find(
    (row) => row.querySelector('span')?.textContent?.trim() === 'Entrega',
  );
  const deliveryValue = deliveryRow?.querySelector('strong')?.textContent ?? '';
  const summaryPanel = [...document.querySelectorAll<HTMLElement>('.panel')].find(
    (panel) => panel.querySelector('h2')?.textContent?.trim() === 'Resumen',
  );
  const subtitle = summaryPanel?.querySelector<HTMLElement>('.panel-heading p');
  if (subtitle && deliveryValue) {
    subtitle.textContent = deliveryValue.includes('Acumula')
      ? 'Stock reservado para acumular compras'
      : 'Stock reservado para próxima entrega';
  }
}

export function installSaleWizardSummaryEnhancement() {
  if (document.documentElement.dataset.saleSummaryEnhancement === 'true') return;
  document.documentElement.dataset.saleSummaryEnhancement = 'true';
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enhanceSaleSummary();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
