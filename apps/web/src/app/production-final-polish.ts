import type { QueryClient } from '@tanstack/react-query';
import { getSaleFinancials } from '../features/payments/payments-api';
import { getSale } from '../features/sales/sales-api';

let scheduled = false;
let vipLoading = false;
let lastVipFingerprint = '';

function money(value: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(value);
}

function currentSaleId() {
  return location.pathname.match(/^\/ventas\/([0-9a-f-]{36})$/i)?.[1] ?? null;
}

function cleanSidebar() {
  document.querySelector('.sidebar-support')?.remove();
  document.querySelector('.sidebar-user')?.remove();
  document.querySelector('.sidebar-profile-popover')?.remove();
  document.querySelector('.brand-lockup .sidebar-close')?.remove();

  const homeLink = document.querySelector<HTMLAnchorElement>('.sidebar-nav a[href="/"]');
  if (homeLink && homeLink.dataset.productionHomeNavigation !== 'true') {
    homeLink.dataset.productionHomeNavigation = 'true';
    homeLink.addEventListener('click', (event) => {
      if (location.pathname === '/') return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign('/');
    });
  }
}

function paymentFingerprint() {
  const saleId = currentSaleId();
  if (!saleId) return '';
  const cards = [...document.querySelectorAll<HTMLElement>('.payment-card')];
  return `${saleId}|${cards
    .map((card) => {
      const code = card.querySelector('.payment-card-head strong')?.textContent?.trim() ?? '';
      const state = card.querySelector('.payment-card-head .status-badge')?.textContent?.trim() ?? '';
      const amount = card.querySelector('.payment-card-amount > strong')?.textContent?.trim() ?? '';
      return `${code}:${state}:${amount}`;
    })
    .join('|')}`;
}

function removeVipPaymentDecorations() {
  document.querySelectorAll('[data-vip-deposit-chip]').forEach((item) => item.remove());
  document.querySelectorAll('[data-vip-deposit-helper]').forEach((item) => item.remove());
  document.querySelector('[data-vip-deposit-summary]')?.remove();
}

function paymentPanel() {
  return [...document.querySelectorAll<HTMLElement>('.sale-financial-stack .panel')].find((panel) => {
    const heading = panel.querySelector<HTMLElement>('.panel-header h2, .panel-header h3, h2, h3');
    return heading?.textContent?.trim() === 'Pagos';
  });
}

function statusChip(text: string) {
  const chip = document.createElement('span');
  chip.className = 'status-badge status-info';
  chip.dataset.vipDepositChip = 'true';
  chip.dataset.label = text;
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  dot.setAttribute('aria-hidden', 'true');
  chip.append(dot, document.createTextNode(text));
  return chip;
}

async function annotateVipPayments() {
  const saleId = currentSaleId();
  if (!saleId || vipLoading || !document.querySelector('.sale-financial-stack')) {
    lastVipFingerprint = saleId ? lastVipFingerprint : '';
    return;
  }

  const fingerprint = paymentFingerprint();
  if (fingerprint && fingerprint === lastVipFingerprint) return;
  vipLoading = true;
  try {
    const [sale, financials] = await Promise.all([getSale(saleId), getSaleFinancials(saleId)]);
    const depositAmount = sale.negotiatedMinimumDepositAmount;
    removeVipPaymentDecorations();
    if (depositAmount == null || depositAmount <= 0) {
      lastVipFingerprint = paymentFingerprint();
      return;
    }

    let remaining = depositAmount;
    const contributions = new Map<string, number>();
    const confirmed = [...financials.payments]
      .filter((payment) => payment.stateCode === 'CONFIRMED')
      .sort((left, right) => {
        const leftTime = new Date(left.confirmedAt ?? left.receivedAt).getTime();
        const rightTime = new Date(right.confirmedAt ?? right.receivedAt).getTime();
        return leftTime - rightTime;
      });

    for (const payment of confirmed) {
      if (remaining <= 0) break;
      const contribution = Math.min(remaining, payment.declaredAmount);
      if (contribution > 0) contributions.set(payment.code, contribution);
      remaining = Math.max(0, remaining - contribution);
    }

    for (const card of document.querySelectorAll<HTMLElement>('.payment-card')) {
      const codeElement = card.querySelector<HTMLElement>('.payment-card-head strong');
      const code = codeElement?.textContent?.trim() ?? '';
      const contribution = contributions.get(code);
      if (!codeElement || !contribution) continue;

      const heading = codeElement.parentElement;
      if (heading) heading.insertBefore(statusChip('Adelanto VIP'), codeElement.nextSibling);

      const helper = document.createElement('small');
      helper.dataset.vipDepositHelper = 'true';
      helper.className = 'helper-text';
      helper.textContent = `Aplicado al adelanto VIP: ${money(contribution)}.`;
      const summary = card.querySelector('.payment-part-summary');
      summary?.insertAdjacentElement('afterend', helper);
    }

    const panel = paymentPanel();
    if (panel) {
      const summary = document.createElement('div');
      summary.dataset.vipDepositSummary = 'true';
      summary.className = 'context-note';
      summary.textContent =
        remaining > 0
          ? `Adelanto VIP pendiente: ${money(remaining)} de ${money(depositAmount)}. Los pagos confirmados se aplican primero a este adelanto.`
          : `Adelanto VIP cubierto: ${money(depositAmount)}. Los pagos que lo completaron están identificados abajo.`;
      const body = panel.querySelector<HTMLElement>('.panel-body') ?? panel;
      body.prepend(summary);
    }

    lastVipFingerprint = paymentFingerprint();
  } catch {
    // La pantalla React original sigue disponible si no se puede cargar este detalle visual.
  } finally {
    vipLoading = false;
  }
}

async function refreshCurrentSale(queryClient: QueryClient) {
  const saleId = currentSaleId();
  if (!saleId) return;
  lastVipFingerprint = '';
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ['sale', saleId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: ['sale-financials', saleId], type: 'active' }),
    queryClient.invalidateQueries({ queryKey: ['sales'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
  schedule();
}

function installPaymentRefresh(queryClient: QueryClient) {
  if (document.documentElement.dataset.productionPaymentRefresh === 'true') return;
  document.documentElement.dataset.productionPaymentRefresh = 'true';
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    try {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(rawUrl, location.origin);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (response.ok && method !== 'GET' && url.pathname.includes('/payments/')) {
        window.setTimeout(() => void refreshCurrentSale(queryClient), 80);
      }
    } catch {
      // No alterar el flujo de red original si una URL no se puede interpretar.
    }
    return response;
  };
}

function run() {
  cleanSidebar();
  void annotateVipPayments();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    run();
  }, 120);
}

export function installProductionFinalPolish(queryClient: QueryClient) {
  if (document.documentElement.dataset.productionFinalPolish === 'true') return;
  document.documentElement.dataset.productionFinalPolish = 'true';
  installPaymentRefresh(queryClient);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
