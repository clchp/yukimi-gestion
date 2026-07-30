import type {
  CreateSaleInput,
  CreateSaleResult,
  RequestSaleReleaseInput,
  ReviewSaleReleaseInput,
  SaleDetail,
  SaleFilter,
  SaleListResponse,
  SaleReleaseQuote,
  SaleSupportData,
} from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export function getSales(filters: {
  search?: string;
  filter?: SaleFilter;
  page?: number;
  pageSize?: number;
}): Promise<SaleListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  params.set('filter', filters.filter ?? 'ALL');
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 20));
  return apiRequest<SaleListResponse>(`/sales?${params.toString()}`);
}

export function getSaleSupportData(): Promise<SaleSupportData> {
  return apiRequest<SaleSupportData>('/sales/support-data');
}

export function getSale(saleId: string): Promise<SaleDetail> {
  return apiRequest<SaleDetail>(`/sales/${saleId}`);
}

export function createSale(input: CreateSaleInput, idempotencyKey: string): Promise<CreateSaleResult> {
  return apiRequest<CreateSaleResult>('/sales', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function getSaleReleaseQuote(saleItemId: string): Promise<SaleReleaseQuote> {
  return apiRequest<SaleReleaseQuote>(`/sales/items/${saleItemId}/release-quote`);
}

export function requestSaleRelease(saleItemId: string, input: RequestSaleReleaseInput) {
  return apiRequest<{ id: string; stateCode: string; version: number }>(`/sales/items/${saleItemId}/release-requests`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function reviewSaleRelease(requestId: string, input: ReviewSaleReleaseInput) {
  return apiRequest<{ id: string; stateCode: string; version: number }>(`/sales/release-requests/${requestId}/review`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
