import type { DeliveryPartner, DeliveryPartnerType } from '@yukimi/shared';
import { apiRequest } from './api-client';
import {
  createDeliveryPartner,
  getDeliveryPartners,
  updateDeliveryPartner,
} from '../features/deliveries/deliveries-api';
import { downloadCsv } from '../features/insights/csv-export';
import { downloadXlsx, type WorkbookSheet } from '../features/insights/file-export';
import { getInventory, getProduct, getProducts } from '../features/products/products-api';

type AttributeDefinition = { id: string; code: string; name: string; dataType: string };
type AttributeValue = {
  variant_id: string;
  attribute_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
};
type AttributeSupport = { definitions: AttributeDefinition[]; items: AttributeValue[] };

type PartnerCallback = (partner: DeliveryPartner) => void;

const quickPartners = new Map<string, DeliveryPartner>();
const productDetailBusy = new Set<string>();
const productAttributeCache = new Map<string, Promise<AttributeSupport>>();

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

function money(value: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

function showNotice(message: string, tone: 'success' | 'error' = 'success') {
  document.querySelector('.final-runtime-notice')?.remove();
  const notice = node('div', `final-runtime-notice ${tone}`, message);
  notice.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  document.body.append(notice);
  window.setTimeout(() => notice.remove(), 5200);
}

function removeRedundantExports() {
  if (!['/clientes', '/productos'].includes(location.pathname)) return;
  const main = document.querySelector<HTMLElement>('main.page');
  main?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    if (button.textContent?.trim().startsWith('Exportar')) button.remove();
  });
}

function enhanceVipModal() {
  if (!/^\/clientes\/[0-9a-f-]+$/i.test(location.pathname)) return;
  const modal = [...document.querySelectorAll<HTMLElement>('[role="dialog"], .app-modal-card')].find(
    (candidate) => candidate.textContent?.includes('Convertir en cliente VIP'),
  );
  if (!modal) return;
  modal.querySelectorAll<HTMLElement>('.alert.alert-info').forEach((alert) => {
    if (alert.textContent?.includes('El adelanto mínimo se acuerda en cada venta')) alert.remove();
  });
  const checkbox = [...modal.querySelectorAll<HTMLElement>('.checkbox-field, label')].find((item) =>
    item.textContent?.includes('Puede negociar una separación sin adelanto'),
  );
  if (!checkbox || checkbox.querySelector('.final-info-tip')) return;
  const info = node('button', 'final-info-tip', 'ⓘ');
  info.type = 'button';
  info.title =
    'El adelanto mínimo se acuerda en cada venta. Activa esta opción para permitir que, en una venta VIP, se pueda negociar un adelanto de S/ 0.';
  info.setAttribute('aria-label', info.title);
  info.addEventListener('click', (event) => event.preventDefault());
  checkbox.append(' ', info);
}

function attributeSupport(productId: string) {
  let request = productAttributeCache.get(productId);
  if (!request) {
    request = apiRequest<AttributeSupport>(`/products/${productId}/attributes`);
    productAttributeCache.set(productId, request);
  }
  return request;
}

function attributeDisplay(value: AttributeValue | undefined) {
  if (!value) return '';
  if (value.value_text != null) return value.value_text;
  if (value.value_number != null) return String(value.value_number);
  if (value.value_boolean != null) return value.value_boolean ? 'Sí' : 'No';
  return value.value_date ?? '';
}

function detailRow(label: string, value: string) {
  const row = node('div', 'runtime-detail-row');
  row.append(node('span', '', label), node('strong', '', value));
  return row;
}

async function renderProductProfitPanel(productId: string, panel: HTMLElement) {
  if (productDetailBusy.has(productId) || panel.dataset.finalLoaded === 'true') return;
  productDetailBusy.add(productId);
  try {
    const [product, inventory, attributes] = await Promise.all([
      getProduct(productId),
      getInventory({ includeVirtual: false }),
      attributeSupport(productId).catch(() => ({ definitions: [], items: [] })),
    ]);
    const heading = node('div', 'panel-heading');
    const headingText = node('div');
    headingText.append(
      node('h2', '', 'Costos, stock y rentabilidad'),
      node('p', '', 'Costo promedio actual por almacén y ganancia estimada según el precio de venta.'),
    );
    heading.append(headingText);
    const cards = node('div', 'runtime-profit-grid final-profit-grid');

    product.variants.forEach((variant) => {
      const rows = inventory.items.filter((item) => item.variantId === variant.id);
      const withCost = rows.filter((item) => item.currentUnitCostPen != null);
      const weight = withCost.reduce((sum, item) => sum + Math.max(item.availableQuantity, 1), 0);
      const averageCost =
        withCost.length === 0
          ? null
          : withCost.reduce(
              (sum, item) =>
                sum + (item.currentUnitCostPen ?? 0) * Math.max(item.availableQuantity, 1),
              0,
            ) / Math.max(weight, 1);
      const profit = averageCost == null ? null : variant.salePrice - averageCost;
      const margin =
        profit == null || variant.salePrice <= 0 ? null : (profit / variant.salePrice) * 100;
      const card = node('article', 'runtime-profit-card final-profit-card');
      const header = node('header');
      const names = node('div');
      names.append(node('strong', '', variant.variantName), node('small', '', variant.sku));
      header.append(
        names,
        node(
          'span',
          `status-badge ${variant.isActive ? 'status-success' : 'status-neutral'}`,
          variant.isActive ? 'Activa' : 'Inactiva',
        ),
      );
      const metrics = node('div', 'runtime-profit-metrics');
      metrics.append(
        detailRow('Precio de venta', money(variant.salePrice)),
        detailRow('Costo promedio', averageCost == null ? 'Sin costo registrado' : money(averageCost)),
        detailRow('Ganancia estimada', profit == null ? '—' : money(profit)),
        detailRow('Margen estimado', margin == null ? '—' : `${margin.toFixed(1)}%`),
        detailRow('Código de barras', variant.barcode ?? 'No indicado'),
        detailRow('Peso', variant.weightGrams == null ? 'No indicado' : `${variant.weightGrams} g`),
      );
      const variantAttributes = attributes.definitions
        .map((definition) => ({
          definition,
          value: attributes.items.find(
            (item) => item.variant_id === variant.id && item.attribute_id === definition.id,
          ),
        }))
        .filter((item) => attributeDisplay(item.value));
      if (variantAttributes.length > 0) {
        const list = node('div', 'runtime-attribute-list');
        variantAttributes.forEach(({ definition, value }) =>
          list.append(detailRow(definition.name, attributeDisplay(value))),
        );
        metrics.append(list);
      }
      const wrap = node('div', 'responsive-table-wrap final-warehouse-table-wrap');
      const table = node('table', 'runtime-warehouse-table');
      const thead = node('thead');
      const headerRow = node('tr');
      ['Almacén', 'Disponible', 'Reservado', 'Tránsito', 'Costo'].forEach((label) =>
        headerRow.append(node('th', '', label)),
      );
      thead.append(headerRow);
      const tbody = node('tbody');
      rows.forEach((row) => {
        const tr = node('tr');
        [
          row.warehouseName,
          String(row.availableQuantity),
          String(row.reservedQuantity),
          String(row.inTransitQuantity),
          row.currentUnitCostPen == null ? '—' : money(row.currentUnitCostPen),
        ].forEach((value) => tr.append(node('td', '', value)));
        tbody.append(tr);
      });
      if (rows.length === 0) {
        const tr = node('tr');
        const td = node('td', '', 'Sin existencias registradas por almacén.');
        td.colSpan = 5;
        tr.append(td);
        tbody.append(tr);
      }
      table.append(thead, tbody);
      wrap.append(table);
      card.append(header, metrics, wrap);
      cards.append(card);
    });

    panel.replaceChildren(heading, cards);
    panel.dataset.finalLoaded = 'true';
  } catch (error) {
    panel.replaceChildren(
      node(
        'div',
        'empty-state',
        error instanceof Error ? error.message : 'No se pudo cargar el resumen de costos.',
      ),
    );
  } finally {
    productDetailBusy.delete(productId);
  }
}

function enhanceProductDetail() {
  const match = location.pathname.match(/^\/productos\/([0-9a-f-]+)$/i);
  if (!match) return;
  const main = document.querySelector<HTMLElement>('main.page');
  if (!main) return;
  const qrPanel = [...main.querySelectorAll<HTMLElement>('.panel')].find((candidate) =>
    candidate.querySelector('h2')?.textContent?.includes('Etiqueta QR'),
  );
  if (!qrPanel) return;
  let panel = main.querySelector<HTMLElement>('.runtime-product-profit-panel');
  if (!panel) {
    panel = node('section', 'panel runtime-product-profit-panel final-product-profit-panel');
    const heading = node('div', 'panel-heading');
    const text = node('div');
    text.append(
      node('h2', '', 'Costos, stock y rentabilidad'),
      node('p', '', 'Cargando costos y existencias por almacén…'),
    );
    heading.append(text);
    panel.append(heading, node('div', 'final-product-skeleton', 'Preparando información…'));
  }
  panel.classList.add('final-product-profit-panel');
  if (panel.nextElementSibling !== qrPanel) main.insertBefore(panel, qrPanel);
  void renderProductProfitPanel(match[1]!, panel);
}

async function enhanceProductEditAttributes() {
  const match = location.pathname.match(/^\/productos\/([0-9a-f-]+)\/editar$/i);
  if (!match) return;
  const cards = [...document.querySelectorAll<HTMLElement>('.variant-edit-card')];
  if (cards.length === 0 || cards.every((card) => card.dataset.finalAttributes === 'true')) return;
  const productId = match[1]!;
  try {
    const [product, support] = await Promise.all([getProduct(productId), attributeSupport(productId)]);
    cards.forEach((card, index) => {
      if (card.dataset.finalAttributes === 'true') return;
      const variant = product.variants[index];
      if (!variant) return;
      card.dataset.finalAttributes = 'true';
      card.dataset.variantId = variant.id;
      const section = node('section', 'final-variant-attributes');
      section.append(node('strong', 'final-variant-attributes-title', 'Atributos opcionales'));
      const grid = node('div', 'form-grid two-columns final-attribute-grid');
      support.definitions.forEach((definition) => {
        const saved = support.items.find(
          (item) => item.variant_id === variant.id && item.attribute_id === definition.id,
        );
        const label = node('label', 'field');
        label.append(node('span', '', definition.name));
        let control: HTMLInputElement | HTMLSelectElement;
        if (definition.dataType === 'BOOLEAN') {
          const select = node('select');
          select.append(new Option('Sin indicar', ''), new Option('Sí', 'true'), new Option('No', 'false'));
          select.value = saved?.value_boolean == null ? '' : String(saved.value_boolean);
          control = select;
        } else {
          const input = node('input');
          input.type = definition.dataType === 'NUMBER' ? 'number' : definition.dataType === 'DATE' ? 'date' : 'text';
          input.value = attributeDisplay(saved);
          input.placeholder = `Valor de ${definition.name.toLocaleLowerCase('es-PE')}`;
          control = input;
        }
        control.dataset.finalVariantId = variant.id;
        control.dataset.finalAttributeId = definition.id;
        control.dataset.finalAttributeType = definition.dataType;
        label.append(control);
        grid.append(label);
      });
      section.append(grid);
      const baseGrid = card.querySelector('.form-grid');
      baseGrid?.after(section);
    });
  } catch {
    // La edición base continúa disponible aunque fallen los atributos complementarios.
  }
}

function enrichProductPayload(payload: Record<string, unknown>) {
  const variants = Array.isArray(payload.variants) ? payload.variants : [];
  variants.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const variant = raw as Record<string, unknown>;
    const id = String(variant.id ?? '');
    const attributes: Array<Record<string, unknown>> = [];
    document
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        `[data-final-variant-id="${CSS.escape(id)}"][data-final-attribute-id]`,
      )
      .forEach((control) => {
        const value = control.value.trim();
        if (!value) return;
        const attributeId = control.dataset.finalAttributeId!;
        const type = control.dataset.finalAttributeType;
        if (type === 'NUMBER') attributes.push({ attributeId, valueNumber: Number(value) });
        else if (type === 'BOOLEAN') attributes.push({ attributeId, valueBoolean: value === 'true' });
        else if (type === 'DATE') attributes.push({ attributeId, valueDate: value });
        else attributes.push({ attributeId, valueText: value });
      });
    variant.attributes = attributes;
  });
}

function deliveryCostControls() {
  const payerField = [...document.querySelectorAll<HTMLElement>('.field')].find((field) =>
    field.textContent?.includes('Quién asume el costo'),
  );
  const costField = [...document.querySelectorAll<HTMLElement>('label.field')].find((field) =>
    field.querySelector('span')?.textContent?.trim() === 'Costo de envío' ||
    field.querySelector('span')?.textContent?.trim() === 'Costo asumido por Yukimi',
  );
  return {
    payerField,
    payer: payerField?.querySelector<HTMLSelectElement>('select'),
    costField,
    cost: costField?.querySelector<HTMLInputElement>('input[type="number"]'),
  };
}

function enhanceDeliveryCost() {
  if (!/^\/entregas\/(nueva|[0-9a-f-]+\/editar)$/i.test(location.pathname)) return;
  const { payerField, payer, costField, cost } = deliveryCostControls();
  if (!payerField || !payer || !costField || !cost) return;
  const labels: Record<string, string> = {
    CLIENT: 'Cliente — paga directamente al operador',
    BUSINESS: 'Yukimi',
    SHARED: 'Compartido',
    NOT_APPLICABLE: 'No aplica',
  };
  [...payer.options].forEach((option) => {
    option.textContent = labels[option.value] ?? option.textContent;
  });
  let note = payerField.parentElement?.querySelector<HTMLElement>('.final-delivery-cost-note');
  if (!note) {
    note = node('div', 'final-delivery-cost-note field-span-2');
    payerField.parentElement?.append(note);
  }
  const update = () => {
    const clientPays = payer.value === 'CLIENT';
    const notApplicable = payer.value === 'NOT_APPLICABLE';
    costField.hidden = clientPays || notApplicable;
    cost.disabled = clientPays || notApplicable;
    if (clientPays || notApplicable) cost.value = '0';
    const title = costField.querySelector('span');
    if (title) title.textContent = 'Costo asumido por Yukimi';
    note!.textContent = clientPays
      ? 'El cliente paga directamente a la agencia o motorizado. Este importe no es deuda, ingreso ni gasto de Yukimi.'
      : payer.value === 'BUSINESS'
        ? 'Indica únicamente lo que Yukimi pagará al operador. Registra el gasto en Finanzas cuando el pago se realice.'
        : payer.value === 'SHARED'
          ? 'Indica únicamente la parte que asumirá Yukimi. La parte pagada directamente por el cliente no se registra en el sistema.'
          : 'No existe costo de envío para Yukimi.';
    const summary = [...document.querySelectorAll<HTMLElement>('.delivery-summary-list > div')].find(
      (row) => row.querySelector('span')?.textContent?.trim() === 'Costo',
    );
    const value = summary?.querySelector('strong');
    if (value && clientPays) value.textContent = 'Pago directo al operador';
  };
  if (payer.dataset.finalCostBound !== 'true') {
    payer.dataset.finalCostBound = 'true';
    payer.addEventListener('change', update);
  }
  update();
}

function closePartnerModal() {
  document.querySelector('.final-partner-modal-backdrop')?.remove();
}

function openPartnerModal(
  type: DeliveryPartnerType,
  existing?: DeliveryPartner,
  callback?: PartnerCallback,
) {
  closePartnerModal();
  const backdrop = node('div', 'app-modal-backdrop final-partner-modal-backdrop');
  const form = node('form', 'app-modal-card final-partner-modal');
  const header = node('header', 'app-modal-header');
  const title = node('div');
  title.append(
    node('span', 'eyebrow', existing ? 'Editar operador' : 'Nuevo operador'),
    node('h2', '', type === 'AGENCY' ? 'Agencia de entrega' : 'Courier o motorizado'),
    node('p', '', 'Este registro aparecerá en el selector de las entregas.'),
  );
  const close = node('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Cerrar');
  close.addEventListener('click', closePartnerModal);
  header.append(title, close);
  const grid = node('div', 'form-grid form-grid-2');
  const fields = [
    ['legalName', 'Nombre *', existing?.legalName ?? existing?.name ?? '', 'text'],
    ['tradeName', 'Nombre comercial', existing?.tradeName ?? '', 'text'],
    ['contactName', 'Persona de contacto', existing?.contactName ?? '', 'text'],
    ['phone', 'Teléfono', existing?.phone ?? '', 'tel'],
    ['email', 'Correo', existing?.email ?? '', 'email'],
  ] as const;
  fields.forEach(([name, labelText, value, typeName]) => {
    const label = node('label', 'field');
    label.append(node('span', '', labelText));
    const input = node('input');
    input.name = name;
    input.type = typeName;
    input.value = value;
    label.append(input);
    grid.append(label);
  });
  const notesLabel = node('label', 'field field-span-2');
  notesLabel.append(node('span', '', 'Notas'));
  const notes = node('textarea');
  notes.name = 'notes';
  notes.rows = 3;
  notes.value = existing?.notes ?? '';
  notesLabel.append(notes);
  const reasonLabel = node('label', 'field field-span-2');
  reasonLabel.append(node('span', '', 'Motivo *'));
  const reason = node('textarea');
  reason.name = 'reason';
  reason.rows = 3;
  reason.placeholder = existing ? 'Explica por qué modificas este operador…' : 'Registro de operador de entrega…';
  reasonLabel.append(reason);
  grid.append(notesLabel, reasonLabel);
  const error = node('div', 'alert alert-error final-partner-error');
  error.hidden = true;
  const footer = node('footer', 'app-modal-actions');
  const cancel = node('button', 'button button-secondary', 'Cancelar');
  cancel.type = 'button';
  cancel.addEventListener('click', closePartnerModal);
  const save = node('button', 'button button-primary', existing ? 'Guardar cambios' : 'Crear operador');
  save.type = 'submit';
  footer.append(cancel, save);
  form.append(header, error, grid, footer);
  backdrop.append(form);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closePartnerModal();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const legalName = String(data.get('legalName') ?? '').trim();
    const auditReason = String(data.get('reason') ?? '').trim();
    if (legalName.length < 2 || auditReason.length < 5) {
      error.hidden = false;
      error.textContent = 'Completa el nombre y escribe un motivo de al menos 5 caracteres.';
      return;
    }
    save.disabled = true;
    save.textContent = 'Guardando…';
    const input = {
      id: existing?.id,
      partnerTypeCode: type,
      legalName,
      tradeName: String(data.get('tradeName') ?? '').trim() || null,
      contactName: String(data.get('contactName') ?? '').trim() || null,
      phone: String(data.get('phone') ?? '').trim() || null,
      email: String(data.get('email') ?? '').trim() || null,
      notes: String(data.get('notes') ?? '').trim() || null,
      isActive: existing?.isActive ?? true,
      version: existing?.version,
      reason: auditReason,
    };
    const request = existing
      ? updateDeliveryPartner(existing.id, input)
      : createDeliveryPartner(input);
    void request
      .then((partner) => {
        quickPartners.set(partner.id, partner);
        closePartnerModal();
        showNotice(`${partner.name} quedó disponible para las entregas.`);
        callback?.(partner);
        void renderSettingsPartners();
      })
      .catch((requestError: unknown) => {
        error.hidden = false;
        error.textContent =
          requestError instanceof Error ? requestError.message : 'No se pudo guardar el operador.';
        save.disabled = false;
        save.textContent = existing ? 'Guardar cambios' : 'Crear operador';
      });
  });
  document.body.append(backdrop);
}

function enhanceDeliveryQuickCreate() {
  if (!/^\/entregas\/(nueva|[0-9a-f-]+\/editar)$/i.test(location.pathname)) return;
  const field = [...document.querySelectorAll<HTMLElement>('.field')].find((candidate) => {
    const text = candidate.querySelector(':scope > span')?.textContent?.trim() ?? '';
    return text.startsWith('Agencia') || text.startsWith('Courier o motorizado');
  });
  if (!field) return;
  const select = field.querySelector<HTMLSelectElement>('select');
  const label = field.querySelector<HTMLElement>(':scope > span');
  if (!select || !label) return;
  quickPartners.forEach((partner) => {
    const matches = label.textContent?.startsWith('Agencia')
      ? partner.partnerTypeCode === 'AGENCY'
      : partner.partnerTypeCode === 'COURIER';
    if (matches && !select.querySelector(`option[value="${partner.id}"]`)) {
      select.append(new Option(partner.name, partner.id));
    }
  });
  if (field.querySelector('.final-quick-partner-button')) return;
  const title = node('div', 'delivery-field-title final-operator-field-title');
  label.replaceWith(title);
  title.append(label);
  const add = node('button', 'delivery-add-address-button final-quick-partner-button', '+ Crear');
  add.type = 'button';
  add.addEventListener('click', () => {
    const type: DeliveryPartnerType = label.textContent?.startsWith('Agencia') ? 'AGENCY' : 'COURIER';
    openPartnerModal(type, undefined, (partner) => {
      if (!select.querySelector(`option[value="${partner.id}"]`)) {
        select.append(new Option(partner.name, partner.id));
      }
      select.value = partner.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  title.append(add);
}

let settingsPartnersLoading = false;

async function renderSettingsPartners() {
  const panel = document.querySelector<HTMLElement>('.final-delivery-partners-panel');
  if (!panel || settingsPartnersLoading) return;
  settingsPartnersLoading = true;
  panel.querySelector('.final-partner-list')?.replaceChildren(node('div', 'empty-state', 'Cargando operadores…'));
  try {
    const response = await getDeliveryPartners();
    const list = panel.querySelector<HTMLElement>('.final-partner-list');
    if (!list) return;
    list.replaceChildren();
    response.items.forEach((partner) => {
      const row = node('div', 'catalog-list-row final-partner-row');
      const text = node('div');
      text.append(
        node('strong', '', partner.name),
        node(
          'small',
          '',
          `${partner.code} · ${partner.partnerTypeCode === 'AGENCY' ? 'Agencia' : 'Courier/motorizado'} · ${partner.phone ?? 'Sin teléfono'}`,
        ),
      );
      const badge = node(
        'span',
        `status-badge ${partner.isActive ? 'status-success' : 'status-neutral'}`,
        partner.isActive ? 'Activo' : 'Inactivo',
      );
      const actions = node('div', 'row-actions');
      const edit = node('button', 'button button-secondary button-compact', 'Editar');
      edit.type = 'button';
      edit.addEventListener('click', () => openPartnerModal(partner.partnerTypeCode, partner));
      const toggle = node(
        'button',
        `button button-compact ${partner.isActive ? 'button-danger' : 'button-secondary'}`,
        partner.isActive ? 'Desactivar' : 'Reactivar',
      );
      toggle.type = 'button';
      toggle.addEventListener('click', () => {
        const reason = window.prompt(
          `Motivo para ${partner.isActive ? 'desactivar' : 'reactivar'} ${partner.name}:`,
        )?.trim();
        if (!reason || reason.length < 5) return;
        void updateDeliveryPartner(partner.id, {
          id: partner.id,
          partnerTypeCode: partner.partnerTypeCode,
          legalName: partner.legalName,
          tradeName: partner.tradeName,
          contactName: partner.contactName,
          phone: partner.phone,
          email: partner.email,
          notes: partner.notes,
          isActive: !partner.isActive,
          version: partner.version,
          reason,
        })
          .then(() => {
            showNotice('Estado del operador actualizado.');
            void renderSettingsPartners();
          })
          .catch((error: unknown) =>
            showNotice(error instanceof Error ? error.message : 'No se pudo actualizar.', 'error'),
          );
      });
      actions.append(edit, toggle);
      row.append(text, badge, actions);
      list.append(row);
    });
    if (response.items.length === 0) {
      list.append(node('div', 'empty-state', 'Todavía no hay agencias ni motorizados registrados.'));
    }
  } catch (error) {
    panel
      .querySelector('.final-partner-list')
      ?.replaceChildren(
        node(
          'div',
          'alert alert-error',
          error instanceof Error ? error.message : 'No se pudieron cargar los operadores.',
        ),
      );
  } finally {
    settingsPartnersLoading = false;
  }
}

function enhanceSettingsPartners() {
  if (location.pathname !== '/configuracion') return;
  const main = document.querySelector<HTMLElement>('main.page');
  const nav = main?.querySelector<HTMLElement>('.settings-nav');
  const content = main?.querySelector<HTMLElement>('.settings-content');
  if (!main || !nav || !content) return;
  let panel = content.querySelector<HTMLElement>('.final-delivery-partners-panel');
  if (!panel) {
    panel = node('section', 'panel final-delivery-partners-panel');
    panel.hidden = true;
    const heading = node('div', 'panel-heading');
    const text = node('div');
    text.append(
      node('h2', '', 'Agencias y motorizados'),
      node('p', '', 'Operadores disponibles al preparar una entrega.'),
    );
    const add = node('button', 'button button-primary', '+ Nuevo operador');
    add.type = 'button';
    add.addEventListener('click', () => openPartnerModal('AGENCY'));
    heading.append(text, add);
    panel.append(heading, node('div', 'catalog-list final-partner-list'));
    content.append(panel);
  }
  let button = nav.querySelector<HTMLButtonElement>('[data-final-partners-nav]');
  if (!button) {
    button = node('button', '', '🚚 Agencias y motorizados');
    button.type = 'button';
    button.dataset.finalPartnersNav = 'true';
    button.addEventListener('click', () => {
      main.dataset.finalPartnersActive = 'true';
      nav.querySelectorAll('button').forEach((candidate) => candidate.classList.remove('active'));
      button!.classList.add('active');
      [...content.children].forEach((child) => {
        (child as HTMLElement).hidden = child !== panel;
      });
      panel!.hidden = false;
      void renderSettingsPartners();
    });
    nav.append(button);
    nav.addEventListener(
      'click',
      (event) => {
        const clicked = (event.target as HTMLElement).closest('button');
        if (!clicked || clicked === button) return;
        main.dataset.finalPartnersActive = 'false';
        panel!.hidden = true;
        [...content.children].forEach((child) => {
          if (child !== panel) (child as HTMLElement).hidden = false;
        });
      },
      true,
    );
  }
  if (main.dataset.finalPartnersActive === 'true') {
    [...content.children].forEach((child) => {
      (child as HTMLElement).hidden = child !== panel;
    });
    panel.hidden = false;
  }
}

async function allProducts() {
  const first = await getProducts({ page: 1, pageSize: 100 });
  const items = [...first.items];
  const pages = Math.ceil(first.total / first.pageSize);
  for (let page = 2; page <= pages; page += 1) {
    items.push(...(await getProducts({ page, pageSize: 100 })).items);
  }
  return items;
}

function productStatus(
  product: Awaited<ReturnType<typeof getProducts>>['items'][number],
  variant: Awaited<ReturnType<typeof getProducts>>['items'][number]['variants'][number],
) {
  if (!product.isActive || !variant.isActive) return 'Inactivo';
  if (variant.availableQuantity === 0 && variant.preorderExpectedQuantity > 0) return 'Preventa';
  if (variant.minimumStock > 0 && variant.availableQuantity <= variant.minimumStock) return 'Stock bajo';
  return variant.availableQuantity === 0 ? 'Agotado' : 'Disponible';
}

async function exportProductCatalog(format: 'CSV' | 'XLSX') {
  const [products, inventory] = await Promise.all([
    allProducts(),
    getInventory({ includeVirtual: false }),
  ]);
  const header = [
    'Código',
    'Producto',
    'Categoría',
    'Franquicia',
    'Marca',
    'Línea o colección',
    'SKU',
    'Variante',
    'Disponible',
    'Reservado',
    'Acumulado',
    'En tránsito',
    'Preventa',
    'Precio',
    'Moneda',
    'Estado',
  ];
  const catalogRows: unknown[][] = [];
  products.forEach((product) =>
    product.variants.forEach((variant) =>
      catalogRows.push([
        product.productCode,
        product.productName,
        product.categoryName,
        product.franchiseName ?? '',
        product.brandName ?? '',
        product.productLineName ?? '',
        variant.sku,
        variant.variantName,
        variant.availableQuantity,
        variant.reservedQuantity,
        variant.accumulatedQuantity,
        variant.inTransitQuantity,
        variant.preorderExpectedQuantity,
        variant.salePrice,
        variant.currencyCode,
        productStatus(product, variant),
      ]),
    ),
  );
  if (format === 'CSV') {
    downloadCsv(`yukimi-catalogo-productos-${fileDate()}.csv`, [header, ...catalogRows]);
    return;
  }
  const stockRows = inventory.items.map((item) => [
    item.productCode,
    item.productName,
    item.sku,
    item.variantName,
    item.warehouseName,
    item.availableQuantity,
    item.reservedQuantity,
    item.accumulatedQuantity,
    item.inTransitQuantity,
    item.damagedQuantity,
    item.currentUnitCostPen ?? '',
  ]);
  const profitability = inventory.items.map((item) => {
    const profit = item.currentUnitCostPen == null ? null : item.salePrice - item.currentUnitCostPen;
    return [
      item.productCode,
      item.productName,
      item.sku,
      item.variantName,
      item.warehouseName,
      item.salePrice,
      item.currentUnitCostPen ?? '',
      profit ?? '',
      profit == null || item.salePrice <= 0 ? '' : (profit / item.salePrice) * 100,
    ];
  });
  const lowStock = inventory.items
    .filter((item) => item.minimumStock > 0 && item.availableQuantity <= item.minimumStock)
    .map((item) => [
      item.productCode,
      item.productName,
      item.sku,
      item.variantName,
      item.warehouseName,
      item.availableQuantity,
      item.minimumStock,
      Math.max(item.minimumStock - item.availableQuantity, 0),
    ]);
  const title = ['YUKIMI GESTIÓN — CATÁLOGO DE PRODUCTOS'];
  const generated = ['Generado', new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date())];
  const sheets: WorkbookSheet[] = [
    {
      name: 'Catálogo general',
      rows: [title, generated, [], header, ...catalogRows],
      freezeRows: 4,
      autoFilterRow: 4,
    },
    {
      name: 'Stock por almacén',
      rows: [
        ['YUKIMI GESTIÓN — STOCK POR ALMACÉN'],
        generated,
        [],
        [
          'Código',
          'Producto',
          'SKU',
          'Variante',
          'Almacén',
          'Disponible',
          'Reservado',
          'Acumulado',
          'En tránsito',
          'Dañado',
          'Costo actual',
        ],
        ...stockRows,
      ],
      freezeRows: 4,
      autoFilterRow: 4,
    },
    {
      name: 'Costos y rentabilidad',
      rows: [
        ['YUKIMI GESTIÓN — COSTOS Y RENTABILIDAD'],
        generated,
        [],
        [
          'Código',
          'Producto',
          'SKU',
          'Variante',
          'Almacén',
          'Precio de venta',
          'Costo actual',
          'Ganancia estimada',
          'Margen %',
        ],
        ...profitability,
      ],
      freezeRows: 4,
      autoFilterRow: 4,
    },
    {
      name: 'Stock bajo',
      rows: [
        ['YUKIMI GESTIÓN — STOCK BAJO'],
        generated,
        [],
        ['Código', 'Producto', 'SKU', 'Variante', 'Almacén', 'Disponible', 'Mínimo', 'Faltante'],
        ...lowStock,
      ],
      freezeRows: 4,
      autoFilterRow: 4,
    },
  ];
  downloadXlsx(`yukimi-catalogo-productos-${fileDate()}.xlsx`, sheets);
}

function enhanceReportsCatalog() {
  if (location.pathname !== '/reportes') return;
  const main = document.querySelector<HTMLElement>('main.reports-page, main.page');
  if (!main || main.querySelector('.final-catalog-report-panel')) return;
  const panel = node('section', 'panel final-catalog-report-panel');
  const heading = node('div', 'panel-heading');
  const text = node('div');
  text.append(
    node('h2', '', 'Catálogo de productos'),
    node(
      'p',
      '',
      'Descarga productos, variantes, precios, stock por almacén, costos y alertas de stock bajo.',
    ),
  );
  const actions = node('div', 'row-actions');
  const excel = node('button', 'button button-primary', 'Descargar Excel');
  const csv = node('button', 'button button-secondary', 'Descargar CSV');
  [excel, csv].forEach((button) => {
    button.type = 'button';
    button.addEventListener('click', () => {
      const format = button === excel ? 'XLSX' : 'CSV';
      button.disabled = true;
      const original = button.textContent;
      button.textContent = 'Preparando…';
      void exportProductCatalog(format)
        .then(() => showNotice(`Catálogo ${format} generado correctamente.`))
        .catch((error: unknown) =>
          showNotice(error instanceof Error ? error.message : 'No se pudo exportar el catálogo.', 'error'),
        )
        .finally(() => {
          button.disabled = false;
          button.textContent = original;
        });
    });
  });
  actions.append(excel, csv);
  heading.append(text, actions);
  panel.append(heading);
  const filters = main.querySelector('.report-filters');
  if (filters) filters.after(panel);
  else main.querySelector('.page-header')?.after(panel);
}

function enhanceInventoryModal() {
  if (location.pathname !== '/inventario') return;
  const form = document.querySelector<HTMLElement>(
    'form[aria-labelledby="inventory-movement-title"]',
  );
  form?.classList.add('final-inventory-movement-modal');
}

function patchRequests() {
  if (window.fetch.toString().includes('finalPendingCorrectionsFetch')) return;
  const original = window.fetch.bind(window);
  const patched = async function finalPendingCorrectionsFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const originalUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(originalUrl, location.origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    let nextUrl = url;
    let nextInit = init;

    if (
      method === 'PATCH' &&
      /\/products\/[0-9a-f-]+$/i.test(url.pathname) &&
      typeof init?.body === 'string'
    ) {
      const payload = JSON.parse(init.body) as Record<string, unknown>;
      enrichProductPayload(payload);
      nextUrl = new URL(url.href);
      nextUrl.pathname = `${nextUrl.pathname}/bundle-v2`;
      nextInit = { ...init, body: JSON.stringify(payload) };
    }

    const isDeliveryCreate = method === 'POST' && /\/deliveries$/.test(url.pathname);
    const isDeliveryEdit =
      method === 'PATCH' && /\/deliveries\/[0-9a-f-]+$/i.test(url.pathname);
    if ((isDeliveryCreate || isDeliveryEdit) && typeof nextInit?.body === 'string') {
      const payload = JSON.parse(nextInit.body) as Record<string, unknown>;
      if (payload.costPayer === 'CLIENT' || payload.costPayer === 'NOT_APPLICABLE') {
        payload.shippingCost = 0;
      }
      nextInit = { ...nextInit, body: JSON.stringify(payload) };
    }

    return original(nextUrl.href, nextInit);
  };
  window.fetch = patched;
}

function runFinalCorrections() {
  removeRedundantExports();
  enhanceVipModal();
  enhanceProductDetail();
  void enhanceProductEditAttributes();
  enhanceDeliveryCost();
  enhanceDeliveryQuickCreate();
  enhanceSettingsPartners();
  enhanceReportsCatalog();
  enhanceInventoryModal();
}

export function installFinalPendingCorrections() {
  if (document.documentElement.dataset.finalPendingCorrections === 'true') return;
  document.documentElement.dataset.finalPendingCorrections = 'true';
  patchRequests();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      runFinalCorrections();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
