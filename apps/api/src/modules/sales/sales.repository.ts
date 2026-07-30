import type {
  CreateReturnCaseInput,
  CreateSaleInput,
  CreateSaleResult,
  RequestSaleReleaseInput,
  ReturnCaseResult,
  ReviewSaleReleaseInput,
  SaleDraftDetail,
  SaleDraftList,
  SaveSaleDraftInput,
  SaleDetail,
  SaleFilter,
  SaleListResponse,
  SaleReleaseQuote,
  SaleSupportData,
} from '@yukimi/shared';

export interface SaleListQuery {
  search?: string | undefined;
  filter: SaleFilter;
  page: number;
  pageSize: number;
}

export interface SalesRepository {
  list(query: SaleListQuery): Promise<SaleListResponse>;
  getSupportData(): Promise<SaleSupportData>;
  getById(saleId: string): Promise<SaleDetail>;
  create(input: CreateSaleInput, idempotencyKey: string): Promise<CreateSaleResult>;
  listDrafts(): Promise<SaleDraftList>;
  getDraft(draftId: string): Promise<SaleDraftDetail>;
  saveDraft(input: SaveSaleDraftInput): Promise<SaleDraftDetail>;
  confirmDraft(draftId: string, version: number, idempotencyKey: string): Promise<CreateSaleResult>;
  createReturnCase(
    saleId: string,
    input: CreateReturnCaseInput,
    idempotencyKey: string,
  ): Promise<ReturnCaseResult>;
  getReleaseQuote(saleItemId: string): Promise<SaleReleaseQuote>;
  requestRelease(
    saleItemId: string,
    input: RequestSaleReleaseInput,
  ): Promise<{ id: string; stateCode: string; version: number }>;
  reviewRelease(
    requestId: string,
    input: ReviewSaleReleaseInput,
  ): Promise<{ id: string; stateCode: string; version: number }>;
}
