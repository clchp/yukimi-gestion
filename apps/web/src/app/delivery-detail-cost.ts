import { getDelivery } from '../features/deliveries/deliveries-api';

async function enhanceDeliveryDetailCost() {
  const match = location.pathname.match(/^\/entregas\/([0-9a-f-]+)$/i);
  if (!match) return;
  const summary = document.querySelector<HTMLElement>('.delivery-detail-page .detail-summary-grid');
  if (!summary || summary.dataset.finalDeliveryCost === 'true') return;
  summary.dataset.finalDeliveryCost = 'loading';
  try {
    const delivery = await getDelivery(match[1]!);
    const costCard = [...summary.children].find((item) =>
      item.querySelector('span')?.textContent?.trim().startsWith('Costo'),
    ) as HTMLElement | undefined;
    if (!costCard) return;
    const title = costCard.querySelector<HTMLElement>('span');
    const value = costCard.querySelector<HTMLElement>('strong');
    const detail = costCard.querySelector<HTMLElement>('small');
    if (delivery.costPayer === 'CLIENT') {
      if (title) title.textContent = 'Costo de entrega';
      if (value) value.textContent = 'Pago directo al operador';
      if (detail) detail.textContent = 'No afecta el saldo ni las cuentas de Yukimi';
    } else if (delivery.costPayer === 'NOT_APPLICABLE') {
      if (title) title.textContent = 'Costo de entrega';
      if (value) value.textContent = 'No aplica';
      if (detail) detail.textContent = 'Sin costo para Yukimi';
    } else {
      if (title) title.textContent = 'Costo asumido por Yukimi';
      if (detail) detail.textContent = delivery.costPayer === 'SHARED' ? 'Parte de Yukimi' : 'Yukimi';
    }
    summary.dataset.finalDeliveryCost = 'true';
  } catch {
    summary.dataset.finalDeliveryCost = 'error';
  }
}

export function installDeliveryDetailCost() {
  if (document.documentElement.dataset.deliveryDetailCost === 'true') return;
  document.documentElement.dataset.deliveryDetailCost = 'true';
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      void enhanceDeliveryDetailCost();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
