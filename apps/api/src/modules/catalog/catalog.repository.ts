import type {
  CatalogsResponse,
  CatalogItem,
  CreateCatalogItemInput,
} from '@yukimi/shared';

export type CatalogKind = 'categories' | 'franchises' | 'brands' | 'product-lines';

export interface CatalogRepository {
  listAll(): Promise<CatalogsResponse>;
  create(kind: CatalogKind, input: CreateCatalogItemInput): Promise<CatalogItem>;
  setActive(kind: CatalogKind, id: string, isActive: boolean, version: number): Promise<CatalogItem>;
}
