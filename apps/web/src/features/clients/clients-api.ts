import type {
  ClientDetail,
  ClientListResponse,
  ClientSupportData,
  CreateClientAddressInput,
  CreateClientIncidentInput,
  CreateClientInput,
  ResolveClientIncidentInput,
  SetClientStatusInput,
  SetClientVipInput,
  UpdateClientAddressInput,
  UpdateClientInput,
} from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export type ClientFilter = 'ALL' | 'ACTIVE' | 'VIP' | 'WITH_DEBT' | 'OVERDUE' | 'INACTIVE';

export function getClients(filters: {
  search?: string;
  filter?: ClientFilter;
  page?: number;
  pageSize?: number;
}): Promise<ClientListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  params.set('filter', filters.filter ?? 'ALL');
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 20));
  return apiRequest<ClientListResponse>(`/clients?${params.toString()}`);
}

export function getClient(clientId: string): Promise<ClientDetail> {
  return apiRequest<ClientDetail>(`/clients/${clientId}`);
}

export function getClientSupportData(): Promise<ClientSupportData> {
  return apiRequest<ClientSupportData>('/clients/support-data');
}

export function createClient(input: CreateClientInput, idempotencyKey = crypto.randomUUID()) {
  return apiRequest<{ id: string; code: string; version: number }>('/clients', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function updateClient(clientId: string, input: UpdateClientInput) {
  return apiRequest<{ id: string; code: string; version: number }>(`/clients/${clientId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function setClientStatus(clientId: string, input: SetClientStatusInput) {
  return apiRequest<{ id: string; version: number }>(`/clients/${clientId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function setClientVip(clientId: string, input: SetClientVipInput) {
  return apiRequest<{ id: string; isVip: boolean; version: number }>(`/clients/${clientId}/vip`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function createClientAddress(clientId: string, input: CreateClientAddressInput) {
  return apiRequest<{ id: string; version: number }>(`/clients/${clientId}/addresses`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateClientAddress(
  clientId: string,
  addressId: string,
  input: UpdateClientAddressInput,
) {
  return apiRequest<{ id: string; version: number }>(
    `/clients/${clientId}/addresses/${addressId}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
}

export function createClientIncident(clientId: string, input: CreateClientIncidentInput) {
  return apiRequest<{ id: string; version: number }>(`/clients/${clientId}/incidents`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function resolveClientIncident(incidentId: string, input: ResolveClientIncidentInput) {
  return apiRequest<{ id: string; version: number }>(`/clients/incidents/${incidentId}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
