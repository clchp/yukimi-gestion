import type {
  AttachmentRegistrationInput,
  CreateInventoryMovementInput,
  CreateProductInput,
  CreateProductResult,
  InventoryMovementResult,
  InventoryResponse,
  ProductDetail,
  ProductListResponse,
  UpdateProductInput,
  UpdateProductResult,
} from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export interface ProductListFilters {
  search?: string | undefined;
  categoryId?: string | undefined;
  isActive?: boolean | undefined;
  page?: number;
  pageSize?: number;
}

export function getProducts(filters: ProductListFilters): Promise<ProductListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.isActive !== undefined) params.set('isActive', String(filters.isActive));
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 20));
  return apiRequest<ProductListResponse>(`/products?${params.toString()}`);
}

export function getProduct(productId: string): Promise<ProductDetail> {
  return apiRequest<ProductDetail>(`/products/${productId}`);
}

export function createProduct(
  input: CreateProductInput,
  idempotencyKey = crypto.randomUUID(),
): Promise<CreateProductResult> {
  return apiRequest<CreateProductResult>('/products', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function updateProduct(
  productId: string,
  input: UpdateProductInput,
): Promise<UpdateProductResult> {
  return apiRequest<UpdateProductResult>(`/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function registerProductAttachment(
  productId: string,
  input: AttachmentRegistrationInput,
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/products/${productId}/attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getInventory(filters: {
  search?: string;
  warehouseId?: string | undefined;
  includeVirtual?: boolean | undefined;
}): Promise<InventoryResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
  params.set('includeVirtual', String(filters.includeVirtual ?? false));
  return apiRequest<InventoryResponse>(`/products/inventory/summary?${params.toString()}`);
}

export function createInventoryMovement(
  input: CreateInventoryMovementInput,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<InventoryMovementResult> {
  return apiRequest<InventoryMovementResult>('/products/inventory/movements', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}
