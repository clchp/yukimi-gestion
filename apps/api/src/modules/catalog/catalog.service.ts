import type { CreateCatalogItemInput } from '@yukimi/shared';
import { AppError } from '../../shared/errors/app-error.js';
import type { CatalogKind, CatalogRepository } from './catalog.repository.js';

export class CatalogService {
  public constructor(private readonly repository: CatalogRepository) {}

  public listAll() {
    return this.repository.listAll();
  }

  public create(kind: CatalogKind, input: CreateCatalogItemInput) {
    if (kind === 'product-lines' && !input.brandId) {
      throw new AppError({
        code: 'BRAND_REQUIRED',
        message: 'Debes seleccionar una marca para crear una línea de producto.',
        statusCode: 400,
      });
    }
    return this.repository.create(kind, input);
  }

  public setActive(kind: CatalogKind, id: string, isActive: boolean, version: number) {
    return this.repository.setActive(kind, id, isActive, version);
  }
}
