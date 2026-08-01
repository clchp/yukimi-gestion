import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeliverySchema } from '@yukimi/shared';
import { getAllowedDeliveryTransitionCodes } from '../src/modules/deliveries/deliveries.service.js';

const saleId = '11111111-1111-4111-8111-111111111111';
const saleItemId = '22222222-2222-4222-8222-222222222222';
const operatorId = '33333333-3333-4333-8333-333333333333';
const addressId = '44444444-4444-4444-8444-444444444444';

const baseDelivery = {
  saleId,
  deliveryMethod: 'AGENCY' as const,
  operatorPartnerId: operatorId,
  shippingCost: 15,
  costPayer: 'CLIENT' as const,
  items: [{ saleItemId, quantity: 1 }],
};

test('agency deliveries require a destination and planned date', () => {
  assert.equal(createDeliverySchema.safeParse(baseDelivery).success, false);
  assert.equal(
    createDeliverySchema.safeParse({
      ...baseDelivery,
      destinationAddressId: addressId,
    }).success,
    false,
  );
  assert.equal(
    createDeliverySchema.safeParse({
      ...baseDelivery,
      destinationAddressId: addressId,
      plannedDispatchDate: '2026-08-01',
    }).success,
    true,
  );
});

test('other delivery methods require destination and an explanatory note', () => {
  const input = {
    ...baseDelivery,
    deliveryMethod: 'OTHER' as const,
    operatorPartnerId: null,
    destinationAddressId: addressId,
    plannedDispatchDate: null,
  };

  assert.equal(createDeliverySchema.safeParse(input).success, false);
  assert.equal(
    createDeliverySchema.safeParse({
      ...input,
      notes: 'Punto de entrega acordado con el cliente.',
    }).success,
    true,
  );
});

test('agency delivery transitions are sequential', () => {
  assert.deepEqual(getAllowedDeliveryTransitionCodes('AGENCY', 'PENDING_AGENCY_DISPATCH'), [
    'DELIVERED_TO_AGENCY',
    'CANCELLED',
  ]);
  assert.deepEqual(getAllowedDeliveryTransitionCodes('AGENCY', 'DELIVERED_TO_AGENCY'), [
    'OUT_FOR_DELIVERY',
    'CANCELLED',
  ]);
  assert.deepEqual(getAllowedDeliveryTransitionCodes('AGENCY', 'OUT_FOR_DELIVERY'), [
    'DELIVERED_TO_CLIENT',
    'CANCELLED',
  ]);
});

test('terminal delivery states do not expose more transitions', () => {
  assert.deepEqual(getAllowedDeliveryTransitionCodes('AGENCY', 'DELIVERED_TO_CLIENT'), []);
  assert.deepEqual(getAllowedDeliveryTransitionCodes('MOTORBIKE', 'CANCELLED'), []);
});
