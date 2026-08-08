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

function normalizePayerOptions(payerField: HTMLElement, payer: HTMLSelectElement) {
  payer.querySelector('option[value="NOT_APPLICABLE"]')?.remove();
  if (payer.value === 'NOT_APPLICABLE') {
    payer.value = 'CLIENT';
    payer.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const labels: Record<string, string> = {
    CLIENT: 'Cliente',
    BUSINESS: 'Yukimi',
    SHARED: 'Compartido',
  };
  [...payer.options].forEach((option) => {
    const expected = labels[option.value];
    if (expected && option.textContent !== expected) option.textContent = expected;
  });

  payerField.querySelectorAll<HTMLButtonElement>('[role="option"]').forEach((button) => {
    const label = button.querySelector<HTMLElement>('span');
    const current = label?.textContent?.trim() ?? button.textContent?.trim() ?? '';
    if (current === 'No aplica') {
      button.remove();
      return;
    }
    const replacement = current.startsWith('Cliente')
      ? 'Cliente'
      : current.startsWith('Yukimi')
        ? 'Yukimi'
        : current.startsWith('Compartido')
          ? 'Compartido'
          : null;
    if (replacement && label) label.textContent = replacement;
  });
}

function setCostVisibility(field: HTMLElement, input: HTMLInputElement, visible: boolean) {
  field.hidden = !visible;
  input.disabled = !visible;
  if (visible) field.style.removeProperty('display');
  else field.style.setProperty('display', 'none', 'important');
  if (!visible) input.value = '0';
}

function applyDeliveryCostRules() {
  if (!/^\/entregas\/(nueva|[0-9a-f-]+\/editar)$/i.test(location.pathname)) return;
  const controls = findControls();
  if (!controls.payerField || !controls.payer || !controls.costField || !controls.cost) return;

  if (controls.payerTitle) controls.payerTitle.textContent = 'Responsable del costo';
  if (controls.costTitle) controls.costTitle.textContent = 'Costo asumido por Yukimi';
  normalizePayerOptions(controls.payerField, controls.payer);

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
    normalizePayerOptions(controls.payerField!, controls.payer!);
    const clientPays = controls.payer!.value === 'CLIENT';
    const yukimiPays = controls.payer!.value === 'BUSINESS';
    const shared = controls.payer!.value === 'SHARED';
    setCostVisibility(controls.costField!, controls.cost!, yukimiPays || shared);

    note!.textContent = clientPays
      ? 'El cliente paga directamente a la agencia o motorizado. No genera deuda, ingreso ni gasto para Yukimi.'
      : yukimiPays
        ? 'Indica únicamente lo que Yukimi pagará al operador. El gasto se registra en Finanzas cuando se pague.'
        : 'Indica únicamente la parte que asumirá Yukimi. La parte pagada directamente por el cliente no se registra.';

    const summary = [
      ...document.querySelectorAll<HTMLElement>('.delivery-summary-list > div'),
    ].find((row) => row.querySelector('span')?.textContent?.trim() === 'Costo');
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
