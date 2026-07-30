import type {
  CreateSaleInput,
  CreateSaleResult,
  RequestSaleReleaseInput,
  ReviewSaleReleaseInput,
  SaleDetail,
  SaleFilter,
  SaleListResponse,
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
  requestRelease(saleId: string, input: RequestSaleReleaseInput): Promise<{ id: string; stateCode: string; version: number }>;
  reviewRelease(requestId: string, input: ReviewSaleReleaseInput): Promise<{ id: string; stateCode: string; version: number }>;
}
