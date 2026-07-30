import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deliveryDetailSchema,
  deliveryListResponseSchema,
  deliveryMutationResultSchema,
  deliverySupportDataSchema,
  type CreateDeliveryInput,
  type DeliveryDetail,
  type DeliveryListResponse,
  type DeliveryMutationResult,
  type DeliverySupportData,
  type UpdateDeliveryInput,
  type UpdateDeliveryStateInput,
} from '@yukimi/shared';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { DeliveriesRepository, DeliveryListQuery } from './deliveries.repository.js';

export class SupabaseDeliveriesRepository implements DeliveriesRepository {
  public constructor(
    private readonly client: SupabaseClient,
    private readonly actorId: string,
  ) {
    void this.actorId;
  }

  public async list(query: DeliveryListQuery): Promise<DeliveryListResponse> {
    const { data, error } = await this.client.rpc('list_deliveries_v1', {
      p_search: query.search ?? null,
      p_filter: query.filter,
      p_page: query.page,
      p_page_size: query.pageSize,
    });
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar las entregas.');
    return deliveryListResponseSchema.parse(data);
  }

  public async getSupportData(saleId?: string | undefined, deliveryId?: string | undefined): Promise<DeliverySupportData> {
    const functionName = deliveryId ? 'get_delivery_edit_support_v1' : 'get_delivery_support_v1';
    const args = deliveryId ? { p_delivery_id: deliveryId } : { p_sale_id: saleId ?? null };
    const { data, error } = await this.client.rpc(functionName, args);
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar las opciones de entrega.');
    return deliverySupportDataSchema.parse(data);
  }

  public async getById(deliveryId: string): Promise<DeliveryDetail> {
    const { data, error } = await this.client.rpc('get_delivery_detail_v1', {
      p_delivery_id: deliveryId,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo cargar la entrega.');
    return deliveryDetailSchema.parse(data);
  }

  public async create(input: CreateDeliveryInput, idempotencyKey: string): Promise<DeliveryMutationResult> {
    const { data, error } = await this.client.rpc('create_delivery_v1', {
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo crear la entrega.');
    return deliveryMutationResultSchema.parse(data);
  }


  public async update(deliveryId: string, input: UpdateDeliveryInput): Promise<DeliveryMutationResult> {
    const { data, error } = await this.client.rpc('update_delivery_v1', {
      p_delivery_id: deliveryId,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo corregir la entrega.');
    return deliveryMutationResultSchema.parse(data);
  }

  public async advance(deliveryId: string, input: UpdateDeliveryStateInput): Promise<DeliveryMutationResult> {
    const { data, error } = await this.client.rpc('advance_delivery_v1', {
      p_delivery_id: deliveryId,
      p_next_state_code: input.nextStateCode,
      p_reason: input.reason,
      p_occurred_at: input.occurredAt ?? null,
      p_tracking_number: input.trackingNumber ?? null,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar el estado de la entrega.');
    return deliveryMutationResultSchema.parse(data);
  }
}
