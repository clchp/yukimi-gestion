function findControls() {
  const payerField = [...document.querySelectorAll<HTMLElement>('.field')].find((field) => {
    const title = field.querySelector(':scope > span')?.textContent?.trim() ?? '';
    return title === 'Quién asume el costo' || title === 'Responsable del costo';
  });
  const costField = [...document.querySelectorAll<HTMLElement>('label.field')].find((field) => {
    const title = field.querySelector(':scope > span')?.textContent?.trim() ?? '';
    return title === 'Costo de envío' || title === 'Costo asumido por Yukimi';
  });
  return {
    payerField,
    payerTitle: payerField?.querySelector<HTMLElement>(':scope > span'),
    payer: payerField?.querySelector<HTMLSelectElement>('select'),
    costField,
    costTitle: costField?.querySelector<HTMLElement>(':scope > span'),
    cost: costField?.querySelector<HTMLInputElement>('input[type="number"]'),
  };
}

function applyDeliveryCostRules() {
  if (!/^\/entregas\/(nueva|[0-9a-f-]+\/editar)$/i.test(location.pathname)) return;
  const controls = findControls();
  if (!controls.payerField || !controls.payer || !controls.costField || !controls.cost) return;
  if (controls.payerTitle) controls.payerTitle.textContent = 'Responsable del costo';
  if (controls.costTitle) controls.costTitle.textContent = 'Costo asumido por Yukimi';
  const labels: Record<string, string> = {
    CLIENT: 'Cliente — paga directamente al operador',
    BUSINESS: 'Yukimi',
    SHARED: 'Compartido',
    NOT_APPLICABLE: 'No aplica',
  };
  [...controls.payer.options].forEach((option) => {
    const expected = labels[option.value];
    if (expected && option.textContent !== expected) option.textContent = expected;
  });
  controls.payerField.parentElement
    ?.querySelector<HTMLElement>('.pending-delivery-cost-note')
    ?.setAttribute('hidden', 'true');
  const update = () => {
    const hidden = controls.payer!.value === 'CLIENT' || controls.payer!.value === 'NOT_APPLICABLE';
    controls.costField!.hidden = hidden;
    controls.cost!.disabled = hidden;
    if (hidden) controls.cost!.value = '0';
  };
  if (controls.payer.dataset.finalCostLocked !== 'true') {
    controls.payer.dataset.finalCostLocked = 'true';
    controls.payer.addEventListener('change', update);
  }
  update();
}

export function installDeliveryCostLock() {
  if (document.documentElement.dataset.deliveryCostLock === 'true') return;
  document.documentElement.dataset.deliveryCostLock = 'true';
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyDeliveryCostRules();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
