import assert from 'node:assert/strict';
import test from 'node:test';
import type { CreateReturnCaseInput } from '@yukimi/shared';
import { SalesService } from '../src/modules/sales/sales.service.js';
import type { SalesRepository } from '../src/modules/sales/sales.repository.js';
import { AppError } from '../src/shared/errors/app-error.js';

const saleId = '11111111-1111-4111-8111-111111111111';
const saleItemId = '22222222-2222-4222-8222-222222222222';
const warehouseId = '33333333-3333-4333-8333-333333333333';

const input: CreateReturnCaseInput = {
  caseType: 'RETURN',
  reason: 'Producto recibido por el negocio para devolución.',
  items: [
    {
      saleItemId,
      quantity: 1,
      receivedCondition: 'OPENED',
      destinationWarehouseId: warehouseId,
      replacementVariantId: null,
      notes: null,
    },
  ],
};

function repositoryFor(deliveryStateCode: string, commercialStateCode = 'ACTIVE') {
  let createCalls = 0;
  const repository = {
    getById: async () => ({ deliveryStateCode, commercialStateCode }),
    createReturnCase: async () => {
      createCalls += 1;
      return {
        id: '44444444-4444-4444-8444-444444444444',
        code: 'DEV-0000001',
        stateCode: 'REGISTERED',
        caseType: input.caseType,
        version: 1,
      };
    },
  } as unknown as SalesRepository;

  return { repository, getCreateCalls: () => createCalls };
}

test('return and exchange are blocked until customer delivery is confirmed', async () => {
  const { repository, getCreateCalls } = repositoryFor('PENDING');
  const service = new SalesService(repository);

  await assert.rejects(
    () => service.createReturnCase(saleId, input, 'test-return-before-delivery'),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'RETURN_REQUIRES_DELIVERED_SALE' &&
      error.statusCode === 409,
  );
  assert.equal(getCreateCalls(), 0);
});

test('return and exchange are allowed after customer delivery is confirmed', async () => {
  const { repository, getCreateCalls } = repositoryFor('DELIVERED', 'COMPLETED');
  const service = new SalesService(repository);

  const result = await service.createReturnCase(saleId, input, 'test-return-after-delivery');

  assert.equal(result.code, 'DEV-0000001');
  assert.equal(getCreateCalls(), 1);
});

test('cancelled sales cannot receive return cases even if delivery was completed', async () => {
  const { repository, getCreateCalls } = repositoryFor('DELIVERED', 'CANCELLED');
  const service = new SalesService(repository);

  await assert.rejects(
    () => service.createReturnCase(saleId, input, 'test-return-cancelled-sale'),
    (error: unknown) =>
      error instanceof AppError && error.code === 'RETURN_NOT_ALLOWED_FOR_CLOSED_SALE',
  );
  assert.equal(getCreateCalls(), 0);
});
