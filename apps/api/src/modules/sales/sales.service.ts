import type { CreateSaleInput, RequestSaleReleaseInput, ReviewSaleReleaseInput } from '@yukimi/shared';
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

  public requestRelease(saleId: string, input: RequestSaleReleaseInput) {
    return this.repository.requestRelease(saleId, input);
  }

  public reviewRelease(requestId: string, input: ReviewSaleReleaseInput) {
    return this.repository.reviewRelease(requestId, input);
  }
}
