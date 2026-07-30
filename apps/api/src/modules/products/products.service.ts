import type { AttachmentRegistrationInput, CreateProductInput } from '@yukimi/shared';
import type {
  InventoryQuery,
  ProductListQuery,
  ProductRepository,
} from './products.repository.js';

export class ProductService {
  public constructor(private readonly repository: ProductRepository) {}

  public list(query: ProductListQuery) {
    return this.repository.list(query);
  }

  public create(input: CreateProductInput, idempotencyKey: string) {
    return this.repository.create(input, idempotencyKey);
  }

  public registerAttachment(productId: string, input: AttachmentRegistrationInput) {
    return this.repository.registerAttachment(productId, input);
  }

  public listInventory(query: InventoryQuery) {
    return this.repository.listInventory(query);
  }
}
