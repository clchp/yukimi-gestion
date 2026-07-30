import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createObligationSchema,
  createSaleSchema,
  globalSearchResponseSchema,
  inventoryResponseSchema,
  saleReleaseQuoteSchema,
} from '@yukimi/shared';

const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

test('release quote preserves the per-line maximum-single penalty rule', () => {
  const quote = saleReleaseQuoteSchema.parse({
    saleId: id,
    saleItemId: secondId,
    productName: 'Peluche',
    variantName: 'Grande',
    categoryCode: 'PLUSH',
    categoryName: 'Peluches',
    currencyCode: 'PEN',
    withinGracePeriod: false,
    graceHours: 24,
    elapsedHours: 72,
    categoryPenaltyAmount: 5,
    suggestedReleasePenaltyAmount: 5,
    activeLatePenaltyAmount: 3,
    effectivePenaltyAmount: 5,
    depositBasisAmount: 30,
    retainedAmount: 5,
    refundableAmount: 25,
    uncoveredPenaltyAmount: 0,
    rule: {
      scope: 'SALE_LINE',
      selectionMode: 'MAX_SINGLE',
      deductFromDeposit: true,
      depositAllocationMode: 'PRO_RATA_LINE_TOTAL',
    },
  });

  assert.equal(quote.effectivePenaltyAmount, 5);
  assert.equal(quote.refundableAmount, 25);
});

test('sale creation requires a reason for negotiated VIP deposit terms', () => {
  const base = {
    clientId: id,
    salesChannelCode: 'STORE',
    negotiatedMinimumDepositAmount: 20,
    items: [{
      variantId: secondId,
      warehouseId: id,
      quantity: 1,
      originalUnitPrice: 80,
      finalUnitPrice: 80,
    }],
  };

  assert.equal(createSaleSchema.safeParse(base).success, false);
  assert.equal(createSaleSchema.safeParse({
    ...base,
    negotiatedMinimumDepositReason: 'Acuerdo según el margen de esta figura.',
  }).success, true);
});

test('credit-card obligations require operational card data', () => {
  const base = {
    obligationType: 'CREDIT_CARD' as const,
    title: 'Importación Japón',
    amount: 620,
    currencyCode: 'PEN',
    dueDate: '2026-08-30',
    alertDaysBefore: 15,
  };

  assert.equal(createObligationSchema.safeParse(base).success, false);
  assert.equal(createObligationSchema.safeParse({
    ...base,
    cardBankName: 'Banco',
    cardAlias: 'Tarjeta importaciones',
    cardLastFour: '1234',
    statementClosingDate: '2026-08-05',
    installmentCount: 3,
    installmentNumber: 1,
  }).success, true);
});

test('inventory exposes landed cost for below-cost discount warnings', () => {
  const inventory = inventoryResponseSchema.parse({
    items: [{
      variantId: id,
      productId: secondId,
      productCode: 'PRD-001',
      sku: 'SKU-001',
      productName: 'Figura',
      variantName: 'Estándar',
      categoryName: 'Figuras',
      franchiseName: null,
      warehouseId: id,
      warehouseCode: 'MAIN',
      warehouseName: 'Principal',
      availableQuantity: 2,
      reservedQuantity: 0,
      accumulatedQuantity: 0,
      damagedQuantity: 0,
      lostQuantity: 0,
      inTransitQuantity: 0,
      preorderExpectedQuantity: 0,
      minimumStock: 1,
      salePrice: 80,
      currentUnitCostPen: 62,
      currencyCode: 'PEN',
      isActive: true,
    }],
    totals: {
      available: 2,
      reserved: 0,
      accumulated: 0,
      damaged: 0,
      lost: 0,
      inTransit: 0,
      preorderExpected: 0,
    },
  });

  assert.equal(inventory.items[0]?.currentUnitCostPen, 62);
});

test('global search only accepts internal application routes', () => {
  const valid = globalSearchResponseSchema.safeParse({
    query: 'Andrea',
    items: [{
      entityType: 'CLIENT',
      id,
      label: 'Andrea',
      secondary: 'CLI-001',
      route: `/clientes/${id}`,
    }],
  });
  const invalid = globalSearchResponseSchema.safeParse({
    query: 'Andrea',
    items: [{
      entityType: 'CLIENT',
      id,
      label: 'Andrea',
      secondary: 'CLI-001',
      route: 'https://example.com',
    }],
  });

  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});
