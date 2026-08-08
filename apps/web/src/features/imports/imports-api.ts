import type {
  AllocatePreorderInput,
  CreateImportCostInput,
  CreateImportIncidentInput,
  CreateImportInput,
  CreateImportWithDniInput,
  CreateInsuranceClaimInput,
  CreateImportPartnerInput,
  CreatePreorderSaleInput,
  ImportDetail,
  ImportDniPeopleResponse,
  ImportDniUsagesResponse,
  ImportFilter,
  ImportGenericResult,
  ImportListResponse,
  ImportMutationResult,
  ImportSupportData,
  PreorderSaleResult,
  ReceiveImportBoxInput,
  RegisterImportDniUsageInput,
  RegisterImportDniUsageResult,
  UpdateImportBoxStateInput,
  UpdateImportDniPersonInput,
  UpdateImportDniPersonResult,
  UpdateImportStateInput,
  UpdateInsuranceClaimInput,
} from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export function getImports(filters: {
  search?: string | undefined;
  filter?: ImportFilter | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}): Promise<ImportListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  params.set('filter', filters.filter ?? 'ALL');
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 20));
  return apiRequest<ImportListResponse>(`/imports?${params.toString()}`);
}

export function getImportSupportData(): Promise<ImportSupportData> {
  return apiRequest<ImportSupportData>('/imports/support-data');
}

export function getImport(importId: string): Promise<ImportDetail> {
  return apiRequest<ImportDetail>(`/imports/${importId}`);
}

export function getImportDniPeople(): Promise<ImportDniPeopleResponse> {
  return apiRequest<ImportDniPeopleResponse>('/imports/dni-people');
}

export function updateImportDniPerson(
  personId: string,
  input: UpdateImportDniPersonInput,
): Promise<UpdateImportDniPersonResult> {
  return apiRequest<UpdateImportDniPersonResult>(`/imports/dni-people/${personId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getImportDniUsages(importId: string): Promise<ImportDniUsagesResponse> {
  return apiRequest<ImportDniUsagesResponse>(`/imports/${importId}/dni-usages`);
}

export function createImport(
  input: CreateImportInput,
  idempotencyKey: string,
): Promise<ImportMutationResult> {
  return apiRequest<ImportMutationResult>('/imports', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function createImportWithDni(
  input: CreateImportWithDniInput,
  idempotencyKey: string,
): Promise<ImportMutationResult> {
  return apiRequest<ImportMutationResult>('/imports/with-dni', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function registerImportDniUsage(
  importId: string,
  input: RegisterImportDniUsageInput,
): Promise<RegisterImportDniUsageResult> {
  return apiRequest<RegisterImportDniUsageResult>(`/imports/${importId}/dni-usages`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createImportPartner(input: CreateImportPartnerInput): Promise<ImportGenericResult> {
  return apiRequest<ImportGenericResult>('/imports/partners', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createPreorderSale(
  input: CreatePreorderSaleInput,
  idempotencyKey: string,
): Promise<PreorderSaleResult> {
  return apiRequest<PreorderSaleResult>('/imports/preorders', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function advanceImport(
  importId: string,
  input: UpdateImportStateInput,
): Promise<ImportMutationResult> {
  return apiRequest<ImportMutationResult>(`/imports/${importId}/state`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function advanceImportBox(
  boxId: string,
  input: UpdateImportBoxStateInput,
): Promise<ImportMutationResult> {
  return apiRequest<ImportMutationResult>(`/imports/boxes/${boxId}/state`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addImportCost(
  importId: string,
  input: CreateImportCostInput,
): Promise<ImportGenericResult> {
  return apiRequest<ImportGenericResult>(`/imports/${importId}/costs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createImportIncident(
  importId: string,
  input: CreateImportIncidentInput,
): Promise<ImportGenericResult> {
  return apiRequest<ImportGenericResult>(`/imports/${importId}/incidents`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createInsuranceClaim(
  importId: string,
  input: CreateInsuranceClaimInput,
): Promise<ImportGenericResult> {
  return apiRequest<ImportGenericResult>(`/imports/${importId}/insurance-claims`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateInsuranceClaim(
  claimId: string,
  input: UpdateInsuranceClaimInput,
): Promise<ImportGenericResult> {
  return apiRequest<ImportGenericResult>(`/imports/insurance-claims/${claimId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function allocatePreorder(input: AllocatePreorderInput): Promise<ImportGenericResult> {
  return apiRequest<ImportGenericResult>('/imports/preorders/allocate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function receiveImportBox(
  boxId: string,
  input: ReceiveImportBoxInput,
  idempotencyKey: string,
): Promise<ImportMutationResult> {
  return apiRequest<ImportMutationResult>(`/imports/boxes/${boxId}/receive`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function repairZeroReceivedImportBox(
  boxId: string,
  input: ReceiveImportBoxInput,
  idempotencyKey: string,
): Promise<ImportMutationResult> {
  return apiRequest<ImportMutationResult>(`/imports/boxes/${boxId}/repair-zero-receipt`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}
