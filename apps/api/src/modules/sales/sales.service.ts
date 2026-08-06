import type {
  CreateReturnCaseInput,
  CreateSaleInput,
  RequestSaleReleaseInput,
  ReviewSaleReleaseInput,
  SaveSaleDraftInput,
} from '@yukimi/shared';
import { AppError } from '../../shared/errors/app-error.js';
import type { SaleListQuery, SalesRepository } from './sales.repository.js';

export class SalesService {
  public constructor(private readonly repository: SalesRepository) {}

  public list(query: SaleListQuery) {
    return this.repository.list(query);
  }

  public getSupportData() {
    return this.repository.getSupportData();
  }

  public getById(saleId: string) {
    return this.repository.getById(saleId);
  }

  public create(input: CreateSaleInput, idempotencyKey: string) {
    return this.repository.create(input, idempotencyKey);
  }

  public listDrafts() {
    return this.repository.listDrafts();
  }

  public getDraft(draftId: string) {
    return this.repository.getDraft(draftId);
  }

  public saveDraft(input: SaveSaleDraftInput) {
    return this.repository.saveDraft(input);
  }

  public cancelDraft(draftId: string, version: number) {
    return this.repository.cancelDraft(draftId, version);
  }

  public confirmDraft(draftId: string, version: number, idempotencyKey: string) {
    return this.repository.confirmDraft(draftId, version, idempotencyKey);
  }

  public async createReturnCase(
    saleId: string,
    input: CreateReturnCaseInput,
    idempotencyKey: string,
  ) {
    const sale = await this.repository.getById(saleId);

    if (sale.deliveryStateCode !== 'DELIVERED') {
      throw new AppError({
        code: 'RETURN_REQUIRES_DELIVERED_SALE',
        message:
          'Solo puedes registrar una devolución o cambio después de confirmar la entrega al cliente.',
        statusCode: 409,
        details: {
          saleId,
          deliveryStateCode: sale.deliveryStateCode,
        },
      });
    }

    if (['CANCELLED', 'ANNULLED'].includes(sale.commercialStateCode)) {
      throw new AppError({
        code: 'RETURN_NOT_ALLOWED_FOR_CLOSED_SALE',
        message: 'No se puede registrar una devolución o cambio para una venta anulada o cancelada.',
        statusCode: 409,
        details: {
          saleId,
          commercialStateCode: sale.commercialStateCode,
        },
      });
    }

    return this.repository.createReturnCase(saleId, input, idempotencyKey);
  }

  public getReleaseQuote(saleItemId: string) {
    return this.repository.getReleaseQuote(saleItemId);
  }

  public requestRelease(saleItemId: string, input: RequestSaleReleaseInput) {
    return this.repository.requestRelease(saleItemId, input);
  }

  public reviewRelease(requestId: string, input: ReviewSaleReleaseInput) {
    return this.repository.reviewRelease(requestId, input);
  }
}
