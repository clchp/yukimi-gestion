import type {
  AttachmentRegistrationInput,
  CreateProductInput,
  CreateProductResult,
  CreateInventoryMovementInput,
  InventoryMovementResult,
  InventoryResponse,
  ProductDetail,
  ProductListResponse,
  UpdateProductInput,
  UpdateProductResult,
} from '@yukimi/shared';

export interface ProductListQuery {
  search?: string | undefined;
  categoryId?: string | undefined;
  isActive?: boolean | undefined;
  page: number;
  pageSize: number;
}

export interface InventoryQuery {
  search?: string | undefined;
  warehouseId?: string | undefined;
  includeVirtual: boolean;
}

export interface ProductRepository {
  list(query: ProductListQuery): Promise<ProductListResponse>;
  get(productId: string): Promise<ProductDetail>;
  create(input: CreateProductInput, idempotencyKey: string): Promise<CreateProductResult>;
  update(productId: string, input: UpdateProductInput): Promise<UpdateProductResult>;
  registerAttachment(
    productId: string,
    input: AttachmentRegistrationInput,
  ): Promise<{ id: string }>;
  listInventory(query: InventoryQuery): Promise<InventoryResponse>;
  createInventoryMovement(
    input: CreateInventoryMovementInput,
    idempotencyKey: string,
  ): Promise<InventoryMovementResult>;
}
