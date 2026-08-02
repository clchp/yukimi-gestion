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

export function createSale(
  input: CreateSaleInput,
  idempotencyKey: string,
): Promise<CreateSaleResult> {
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
  return apiRequest<{ id: string; stateCode: string; version: number }>(
    `/sales/items/${saleItemId}/release-requests`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function reviewSaleRelease(requestId: string, input: ReviewSaleReleaseInput) {
  return apiRequest<{ id: string; stateCode: string; version: number }>(
    `/sales/release-requests/${requestId}/review`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function getSaleDrafts(): Promise<SaleDraftList> {
  return apiRequest<SaleDraftList>('/sales/drafts');
}

export function getSaleDraft(draftId: string): Promise<SaleDraftDetail> {
  return apiRequest<SaleDraftDetail>(`/sales/drafts/${draftId}`);
}

export async function saveSaleDraft(input: SaveSaleDraftInput): Promise<SaleDraftDetail> {
  const result = await apiRequest<SaleDraftDetail>('/sales/drafts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('yukimi:sale-draft-saved', {
        detail: { id: result.id, code: result.code },
      }),
    );
  }, 350);
  return result;
}

export function cancelSaleDraft(
  draftId: string,
  version: number,
): Promise<{ id: string; status: string; version: number }> {
  return apiRequest<{ id: string; status: string; version: number }>(`/sales/drafts/${draftId}`, {
    method: 'DELETE',
    body: JSON.stringify({ version }),
  });
}

export function confirmSaleDraft(
  draftId: string,
  version: number,
  idempotencyKey = crypto.randomUUID(),
): Promise<CreateSaleResult> {
  return apiRequest<CreateSaleResult>(`/sales/drafts/${draftId}/confirm`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ version }),
  });
}

export function createReturnCase(
  saleId: string,
  input: CreateReturnCaseInput,
  idempotencyKey = crypto.randomUUID(),
): Promise<ReturnCaseResult> {
  return apiRequest<ReturnCaseResult>(`/sales/${saleId}/returns`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}
