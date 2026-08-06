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
  let note = controls.payerField.parentElement?.querySelector<HTMLElement>(
    '.final-delivery-cost-note',
  );
  if (!note) {
    note = node('div', 'final-delivery-cost-note field-span-2');
    controls.payerField.parentElement?.append(note);
  }
  const update = () => {
    const clientPays = controls.payer!.value === 'CLIENT';
    const notApplicable = controls.payer!.value === 'NOT_APPLICABLE';
    const hidden = clientPays || notApplicable;
    controls.costField!.hidden = hidden;
    controls.cost!.disabled = hidden;
    if (hidden) controls.cost!.value = '0';
    note!.textContent = clientPays
      ? 'El cliente paga directamente a la agencia o motorizado. No genera deuda, ingreso ni gasto para Yukimi.'
      : controls.payer!.value === 'BUSINESS'
        ? 'Indica únicamente lo que Yukimi pagará al operador. Registra el gasto en Finanzas cuando se realice.'
        : controls.payer!.value === 'SHARED'
          ? 'Indica únicamente la parte que asumirá Yukimi. La parte pagada directamente por el cliente no se registra.'
          : 'No existe costo de entrega para Yukimi.';
    const summary = [...document.querySelectorAll<HTMLElement>('.delivery-summary-list > div')].find(
      (row) => row.querySelector('span')?.textContent?.trim() === 'Costo',
    );
    const summaryValue = summary?.querySelector<HTMLElement>('strong');
    if (summaryValue && clientPays) summaryValue.textContent = 'Pago directo al operador';
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
