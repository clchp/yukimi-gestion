import type { CatalogItem, CatalogsResponse, CreateCatalogItemInput } from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export type CatalogKind = 'categories' | 'franchises' | 'brands' | 'product-lines';

export function getCatalogs(): Promise<CatalogsResponse> {
  return apiRequest<CatalogsResponse>('/catalogs');
}

export function createCatalogItem(kind: CatalogKind, input: CreateCatalogItemInput): Promise<CatalogItem> {
  return apiRequest<CatalogItem>(`/catalogs/${kind}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setCatalogItemStatus(
  kind: CatalogKind,
  id: string,
  isActive: boolean,
  version: number,
): Promise<CatalogItem> {
  return apiRequest<CatalogItem>(`/catalogs/${kind}/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive, version }),
  });
}
