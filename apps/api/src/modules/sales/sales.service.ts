import type {
  CreateReturnCaseInput,
  CreateSaleInput,
  RequestSaleReleaseInput,
  ReviewSaleReleaseInput,
  SaveSaleDraftInput,
} from '@yukimi/shared';
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

  public createReturnCase(saleId: string, input: CreateReturnCaseInput, idempotencyKey: string) {
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
