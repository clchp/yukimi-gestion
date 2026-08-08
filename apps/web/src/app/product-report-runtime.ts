import { apiRequest } from './api-client';
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
  const modal = [
    ...document.querySelectorAll<HTMLElement>('[role="dialog"], .app-modal-card'),
  ].find((candidate) => candidate.textContent?.includes('Convertir en cliente VIP'));
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
      node(
        'p',
        '',
        'Costo promedio actual por almacén y ganancia estimada según el precio de venta.',
      ),
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
        detailRow(
          'Costo promedio',
          averageCost == null ? 'Sin costo registrado' : money(averageCost),
        ),
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
    const [product, support] = await Promise.all([
      getProduct(productId),
      attributeSupport(productId),
    ]);
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
          select.append(
            new Option('Sin indicar', ''),
            new Option('Sí', 'true'),
            new Option('No', 'false'),
          );
          select.value = saved?.value_boolean == null ? '' : String(saved.value_boolean);
          control = select;
        } else {
          const input = node('input');
          input.type =
            definition.dataType === 'NUMBER'
              ? 'number'
              : definition.dataType === 'DATE'
                ? 'date'
                : 'text';
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
      card.querySelector('.form-grid')?.after(section);
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
    const controls = [
      ...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        `[data-final-variant-id="${CSS.escape(id)}"][data-final-attribute-id]`,
      ),
    ];
    if (controls.length === 0) return;
    const attributes: Array<Record<string, unknown>> = [];
    controls.forEach((control) => {
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
  if (variant.minimumStock > 0 && variant.availableQuantity <= variant.minimumStock)
    return 'Stock bajo';
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
    const profit =
      item.currentUnitCostPen == null ? null : item.salePrice - item.currentUnitCostPen;
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
  const generated = [
    'Generado',
    new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date()),
  ];
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
          showNotice(
            error instanceof Error ? error.message : 'No se pudo exportar el catálogo.',
            'error',
          ),
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
  document
    .querySelector<HTMLElement>('form[aria-labelledby="inventory-movement-title"]')
    ?.classList.add('final-inventory-movement-modal');
}

function patchProductRequests() {
  if (window.fetch.toString().includes('productReportRuntimeFetch')) return;
  const original = window.fetch.bind(window);
  const patched = async function productReportRuntimeFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const originalUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(originalUrl, location.origin);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    if (
      method === 'PATCH' &&
      /\/products\/[0-9a-f-]+$/i.test(url.pathname) &&
      typeof init?.body === 'string'
    ) {
      const payload = JSON.parse(init.body) as Record<string, unknown>;
      enrichProductPayload(payload);
      const nextUrl = new URL(url.href);
      nextUrl.pathname = `${nextUrl.pathname}/bundle-v2`;
      return original(nextUrl.href, { ...init, body: JSON.stringify(payload) });
    }
    return original(input, init);
  };
  window.fetch = patched;
}

function runProductReportRuntime() {
  removeRedundantExports();
  enhanceVipModal();
  enhanceProductDetail();
  void enhanceProductEditAttributes();
  enhanceReportsCatalog();
  enhanceInventoryModal();
}

export function installProductReportRuntime() {
  if (document.documentElement.dataset.productReportRuntime === 'true') return;
  document.documentElement.dataset.productReportRuntime = 'true';
  patchProductRequests();
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      runProductReportRuntime();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
