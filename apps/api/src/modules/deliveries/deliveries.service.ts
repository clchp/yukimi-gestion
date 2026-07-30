import type {
  CreateDeliveryInput,
  UpdateDeliveryInput,
  UpdateDeliveryStateInput,
} from '@yukimi/shared';
import type { DeliveriesRepository, DeliveryListQuery } from './deliveries.repository.js';

export class DeliveriesService {
  public constructor(private readonly repository: DeliveriesRepository) {}

  public list(query: DeliveryListQuery) {
    return this.repository.list(query);
  }

  public getSupportData(saleId?: string | undefined, deliveryId?: string | undefined) {
    return this.repository.getSupportData(saleId, deliveryId);
  }

  public getById(deliveryId: string) {
    return this.repository.getById(deliveryId);
  }

  public create(input: CreateDeliveryInput, idempotencyKey: string) {
    return this.repository.create(input, idempotencyKey);
  }

  public update(deliveryId: string, input: UpdateDeliveryInput) {
    return this.repository.update(deliveryId, input);
  }

  public advance(deliveryId: string, input: UpdateDeliveryStateInput) {
    return this.repository.advance(deliveryId, input);
  }
}
