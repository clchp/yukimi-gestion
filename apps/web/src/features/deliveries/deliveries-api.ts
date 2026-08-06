import type {
  CreateDeliveryInput,
  DeliveryDetail,
  DeliveryFilter,
  DeliveryListResponse,
  DeliveryMutationResult,
  DeliveryPartner,
  DeliveryPartnerListResponse,
  DeliverySupportData,
  UpdateDeliveryInput,
  UpdateDeliveryStateInput,
  UpsertDeliveryPartnerInput,
} from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export function getDeliveries(filters: {
  search?: string | undefined;
  filter?: DeliveryFilter | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}): Promise<DeliveryListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  params.set('filter', filters.filter ?? 'ALL');
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 20));
  return apiRequest<DeliveryListResponse>(`/deliveries?${params.toString()}`);
}

export function getDeliveryPartners(): Promise<DeliveryPartnerListResponse> {
  return apiRequest<DeliveryPartnerListResponse>('/deliveries/partners');
}

export function createDeliveryPartner(
  input: UpsertDeliveryPartnerInput,
): Promise<DeliveryPartner> {
  return apiRequest<DeliveryPartner>('/deliveries/partners', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDeliveryPartner(
  partnerId: string,
  input: UpsertDeliveryPartnerInput,
): Promise<DeliveryPartner> {
  return apiRequest<DeliveryPartner>(`/deliveries/partners/${partnerId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getDeliverySupportData(
  saleId?: string | undefined,
  deliveryId?: string | undefined,
): Promise<DeliverySupportData> {
  const params = new URLSearchParams();
  if (saleId) params.set('saleId', saleId);
  if (deliveryId) params.set('deliveryId', deliveryId);
  const query = params.toString();
  return apiRequest<DeliverySupportData>(`/deliveries/support-data${query ? `?${query}` : ''}`);
}

export function getDelivery(deliveryId: string): Promise<DeliveryDetail> {
  return apiRequest<DeliveryDetail>(`/deliveries/${deliveryId}`);
}

export function createDelivery(
  input: CreateDeliveryInput,
  idempotencyKey: string,
): Promise<DeliveryMutationResult> {
  return apiRequest<DeliveryMutationResult>('/deliveries', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function updateDelivery(
  deliveryId: string,
  input: UpdateDeliveryInput,
): Promise<DeliveryMutationResult> {
  return apiRequest<DeliveryMutationResult>(`/deliveries/${deliveryId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function advanceDelivery(
  deliveryId: string,
  input: UpdateDeliveryStateInput,
): Promise<DeliveryMutationResult> {
  return apiRequest<DeliveryMutationResult>(`/deliveries/${deliveryId}/state`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
