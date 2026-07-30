import type {
  CreateDeliveryInput,
  DeliveryDetail,
  DeliveryFilter,
  DeliveryListResponse,
  DeliveryMutationResult,
  DeliverySupportData,
  UpdateDeliveryInput,
  UpdateDeliveryStateInput,
} from '@yukimi/shared';

export interface DeliveryListQuery {
  search?: string | undefined;
  filter: DeliveryFilter;
  page: number;
  pageSize: number;
}

export interface DeliveriesRepository {
  list(query: DeliveryListQuery): Promise<DeliveryListResponse>;
  getSupportData(
    saleId?: string | undefined,
    deliveryId?: string | undefined,
  ): Promise<DeliverySupportData>;
  getById(deliveryId: string): Promise<DeliveryDetail>;
  create(input: CreateDeliveryInput, idempotencyKey: string): Promise<DeliveryMutationResult>;
  update(deliveryId: string, input: UpdateDeliveryInput): Promise<DeliveryMutationResult>;
  advance(deliveryId: string, input: UpdateDeliveryStateInput): Promise<DeliveryMutationResult>;
}
