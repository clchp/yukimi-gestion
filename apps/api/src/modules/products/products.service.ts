import type {
  AttachmentRegistrationInput,
  CreateInventoryMovementInput,
  CreateProductInput,
  UpdateProductInput,
} from '@yukimi/shared';
import type { InventoryQuery, ProductListQuery, ProductRepository } from './products.repository.js';

export class ProductService {
  public constructor(private readonly repository: ProductRepository) {}

  public list(query: ProductListQuery) {
    return this.repository.list(query);
  }

  public get(productId: string) {
    return this.repository.get(productId);
  }

  public create(input: CreateProductInput, idempotencyKey: string) {
    return this.repository.create(input, idempotencyKey);
  }

  public update(productId: string, input: UpdateProductInput) {
    return this.repository.update(productId, input);
  }

  public registerAttachment(productId: string, input: AttachmentRegistrationInput) {
    return this.repository.registerAttachment(productId, input);
  }

  public listInventory(query: InventoryQuery) {
    return this.repository.listInventory(query);
  }

  public createInventoryMovement(input: CreateInventoryMovementInput, idempotencyKey: string) {
    return this.repository.createInventoryMovement(input, idempotencyKey);
  }
}
