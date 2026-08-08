import type { DeliveryPartner, DeliveryPartnerType } from '@yukimi/shared';
import { getDeliveryPartners } from '../features/deliveries/deliveries-api';

let cached: DeliveryPartner[] = [];
let loading: Promise<DeliveryPartner[]> | null = null;
let loadedAt = 0;

function partners(force = false) {
  if (!force && cached.length > 0 && Date.now() - loadedAt < 30_000) {
    return Promise.resolve(cached);
  }
  loading ??= getDeliveryPartners()
    .then((response) => {
      cached = response.items.filter((item) => item.isActive);
      loadedAt = Date.now();
      return cached;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

function fieldLabel(field: HTMLElement | undefined) {
  return field?.querySelector<HTMLElement>(':scope > span, .final-operator-field-title > span');
}

function partnerField() {
  return [...document.querySelectorAll<HTMLElement>('.field')].find((candidate) => {
    const text = fieldLabel(candidate)?.textContent?.trim() ?? '';
    return text.startsWith('Agencia') || text.startsWith('Courier o motorizado');
  });
}

function applyPartners(items: DeliveryPartner[]) {
  if (!/^\/entregas\/(nueva|[0-9a-f-]+\/editar)$/i.test(location.pathname)) return;
  const field = partnerField();
  const label = fieldLabel(field);
  const hiddenSelect = field?.querySelector<HTMLSelectElement>('select.searchable-native-hidden');
  const wrapper = field?.querySelector<HTMLElement>('.searchable-native-select');
  if (!field || !label || !hiddenSelect || !wrapper) return;
  const type: DeliveryPartnerType = label.textContent?.startsWith('Agencia') ? 'AGENCY' : 'COURIER';
  const matching = items.filter((item) => item.partnerTypeCode === type);

  matching.forEach((partner) => {
    if (!hiddenSelect.querySelector(`option[value="${partner.id}"]`)) {
      const option = new Option(partner.name, partner.id);
      option.dataset.finalDeliveryPartner = 'true';
      hiddenSelect.append(option);
    }
  });

  const selected = matching.find((item) => item.id === hiddenSelect.value);
  const triggerText = wrapper.querySelector<HTMLElement>('.searchable-native-trigger span');
  if (selected && triggerText) {
    triggerText.textContent = selected.name;
    triggerText.classList.remove('placeholder');
  }

  const optionList = wrapper.querySelector<HTMLElement>('.searchable-native-options');
  if (!optionList) return;
  matching.forEach((partner) => {
    const exists = [...optionList.querySelectorAll<HTMLButtonElement>('button')].some(
      (button) =>
        button.dataset.finalDeliveryPartnerId === partner.id ||
        button.textContent?.trim() === partner.name,
    );
    if (exists) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.finalDeliveryPartnerId = partner.id;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(partner.id === hiddenSelect.value));
    const text = document.createElement('span');
    text.textContent = partner.name;
    button.append(text);
    button.addEventListener('click', () => {
      hiddenSelect.value = partner.id;
      hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
      const currentText = wrapper.querySelector<HTMLElement>('.searchable-native-trigger span');
      if (currentText) {
        currentText.textContent = partner.name;
        currentText.classList.remove('placeholder');
      }
      wrapper.querySelector<HTMLButtonElement>('.searchable-native-trigger')?.click();
    });
    optionList.append(button);
  });
}

function refresh(force = false) {
  const selectedId = partnerField()?.querySelector<HTMLSelectElement>(
    'select.searchable-native-hidden',
  )?.value;
  const mustReload = Boolean(selectedId && !cached.some((partner) => partner.id === selectedId));
  void partners(force || mustReload)
    .then(applyPartners)
    .catch(() => undefined);
}

function watchPartnerMutations() {
  if (window.fetch.toString().includes('deliveryPartnerOptionsFetch')) return;
  const original = window.fetch.bind(window);
  const patched = async function deliveryPartnerOptionsFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await original(input, init);
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl, location.origin);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (
      response.ok &&
      ['POST', 'PATCH'].includes(method) &&
      /\/deliveries\/partners(?:\/[0-9a-f-]+)?$/i.test(url.pathname)
    ) {
      cached = [];
      loadedAt = 0;
      window.dispatchEvent(new Event('yukimi:delivery-partners-updated'));
    }
    return response;
  };
  window.fetch = patched;
}

export function installDeliveryPartnerOptions() {
  if (document.documentElement.dataset.deliveryPartnerOptions === 'true') return;
  document.documentElement.dataset.deliveryPartnerOptions = 'true';
  watchPartnerMutations();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refresh();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  window.addEventListener('yukimi:delivery-partners-updated', () => refresh(true));
  schedule();
}
