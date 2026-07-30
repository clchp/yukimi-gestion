import type {
  AttachmentRegistrationInput,
  CreateProductInput,
  CreateProductResult,
  InventoryResponse,
  ProductListResponse,
} from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export interface ProductListFilters {
  search?: string;
  categoryId?: string | undefined;
  isActive?: boolean;
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

export function createProduct(input: CreateProductInput, idempotencyKey = crypto.randomUUID()): Promise<CreateProductResult> {
  return apiRequest<CreateProductResult>('/products', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
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
  includeVirtual?: boolean;
}): Promise<InventoryResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.warehouseId) params.set('warehouseId', filters.warehouseId);
  params.set('includeVirtual', String(filters.includeVirtual ?? false));
  return apiRequest<InventoryResponse>(`/products/inventory/summary?${params.toString()}`);
}
