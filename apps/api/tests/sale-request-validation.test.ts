import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCreateSaleRequest,
  parseSaveSaleDraftRequest,
} from '../src/modules/sales/sale-request-validation.js';

const clientId = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';
const warehouseId = '33333333-3333-4333-8333-333333333333';

const sale = {
  clientId,
  salesChannelCode: 'WHATSAPP',
  negotiatedMinimumDepositAmount: 10,
  negotiatedMinimumDepositReason: 'Acuerdo de prueba',
  items: [
    {
      variantId,
      warehouseId,
      quantity: 1,
      originalUnitPrice: 155,
      finalUnitPrice: 155,
    },
  ],
};

test('requires a deadline when the negotiated VIP deposit is greater than zero', () => {
  assert.throws(() => parseCreateSaleRequest(sale));
  const parsed = parseCreateSaleRequest({
    ...sale,
    negotiatedMinimumDepositDueAt: '2026-08-10T23:59:59-05:00',
  });
  assert.equal(parsed.negotiatedMinimumDepositDueAt, '2026-08-10T23:59:59-05:00');
});

test('does not require a deadline when the negotiated VIP deposit is zero', () => {
  const parsed = parseCreateSaleRequest({
    ...sale,
    negotiatedMinimumDepositAmount: 0,
  });
  assert.equal(parsed.negotiatedMinimumDepositDueAt, null);
});

test('requires the deadline before saving a VIP draft with a positive deposit', () => {
  assert.throws(() => parseSaveSaleDraftRequest({ input: sale }));
});

test('preserves the deposit deadline inside a sale draft payload', () => {
  const parsed = parseSaveSaleDraftRequest({
    input: {
      ...sale,
      negotiatedMinimumDepositDueAt: '2026-08-10T23:59:59-05:00',
    },
  });
  assert.equal(
    parsed.input.negotiatedMinimumDepositDueAt,
    '2026-08-10T23:59:59-05:00',
  );
});
