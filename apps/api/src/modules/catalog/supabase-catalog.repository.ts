import type { SupabaseClient } from '@supabase/supabase-js';
import {
  catalogItemSchema,
  type CatalogItem,
  type CatalogsResponse,
  type CreateCatalogItemInput,
  type UpdateCatalogItemInput,
} from '@yukimi/shared';
import { AppError } from '../../shared/errors/app-error.js';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { CatalogKind, CatalogRepository } from './catalog.repository.js';

interface BaseCatalogRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  version: number;
  release_penalty_amount?: number | null;
  release_penalty_currency?: string | null;
}

function toCode(name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return normalized || `CAT_${Date.now()}`;
}

function toItem(row: BaseCatalogRow): CatalogItem {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    version: row.version,
    releasePenaltyAmount: row.release_penalty_amount ?? null,
    releasePenaltyCurrency: row.release_penalty_currency ?? null,
  };
}

const tableByKind: Record<CatalogKind, string> = {
  categories: 'product_categories',
  franchises: 'franchises',
  brands: 'brands',
  'product-lines': 'product_lines',
};

export class SupabaseCatalogRepository implements CatalogRepository {
  public constructor(
    private readonly client: SupabaseClient,
    private readonly actorId: string,
  ) {}

  public async listAll(): Promise<CatalogsResponse> {
    const [
      categoriesResult,
      franchisesResult,
      brandsResult,
      linesResult,
      attributesResult,
      warehousesResult,
      currenciesResult,
    ] = await Promise.all([
      this.client
        .from('product_categories')
        .select(
          'id,code,name,description,is_active,version,release_penalty_amount,release_penalty_currency',
        )
        .order('sort_order')
        .order('name'),
      this.client
        .from('franchises')
        .select('id,code,name,description,is_active,version')
        .order('name'),
      this.client.from('brands').select('id,code,name,description,is_active,version').order('name'),
      this.client
        .from('product_lines')
        .select('id,brand_id,code,name,description,is_active,version')
        .order('name'),
      this.client
        .from('product_attribute_definitions')
        .select('id,code,name,description,data_type,allowed_values,sort_order,is_active,version')
        .order('sort_order'),
      this.client
        .from('warehouses')
        .select(
          'id,code,name,description,warehouse_type,is_virtual,is_visible_in_operations,is_active,version',
        )
        .order('name'),
      this.client
        .from('currencies')
        .select('code,name,symbol,decimal_places,is_active')
        .order('code'),
    ]);

    const failed = [
      categoriesResult,
      franchisesResult,
      brandsResult,
      linesResult,
      attributesResult,
      warehousesResult,
      currenciesResult,
    ].find((result) => result.error);
    if (failed?.error) throw mapSupabaseError(failed.error, 'No se pudieron cargar los catálogos.');

    return {
      categories: ((categoriesResult.data ?? []) as BaseCatalogRow[]).map(toItem),
      franchises: ((franchisesResult.data ?? []) as BaseCatalogRow[]).map(toItem),
      brands: ((brandsResult.data ?? []) as BaseCatalogRow[]).map(toItem),
      productLines: (
        (linesResult.data ?? []) as Array<BaseCatalogRow & { brand_id: string | null }>
      ).map((row) => ({
        ...toItem(row),
        brandId: row.brand_id,
      })),
      attributeDefinitions: (
        (attributesResult.data ?? []) as Array<
          BaseCatalogRow & {
            data_type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'COLOR' | 'DATE';
            allowed_values: string[] | null;
            sort_order: number;
          }
        >
      ).map((row) => ({
        ...toItem(row),
        dataType: row.data_type,
        allowedValues: Array.isArray(row.allowed_values) ? row.allowed_values : null,
        sortOrder: row.sort_order,
      })),
      warehouses: (
        (warehousesResult.data ?? []) as Array<
          BaseCatalogRow & {
            warehouse_type: 'OPERATIONAL' | 'FOREIGN' | 'TRANSIT' | 'OTHER';
            is_virtual: boolean;
            is_visible_in_operations: boolean;
          }
        >
      ).map((row) => ({
        ...toItem(row),
        warehouseType: row.warehouse_type,
        isVirtual: row.is_virtual,
        isVisibleInOperations: row.is_visible_in_operations,
      })),
      currencies: (
        (currenciesResult.data ?? []) as Array<{
          code: string;
          name: string;
          symbol: string;
          decimal_places: number;
          is_active: boolean;
        }>
      ).map((row) => ({
        code: row.code,
        name: row.name,
        symbol: row.symbol,
        decimalPlaces: row.decimal_places,
        isActive: row.is_active,
      })),
    };
  }

  public async create(kind: CatalogKind, input: CreateCatalogItemInput): Promise<CatalogItem> {
    const table = tableByKind[kind];
    const actorId = this.actorId;
    const basePayload: Record<string, unknown> = {
      code: toCode(input.name),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    };

    if (kind === 'categories') {
      basePayload.parent_id = input.parentId ?? null;
      basePayload.release_penalty_amount = input.releasePenaltyAmount ?? null;
      basePayload.release_penalty_currency = input.releasePenaltyCurrency ?? 'PEN';
    }
    if (kind === 'product-lines') basePayload.brand_id = input.brandId ?? null;

    const { data, error } = await this.client
      .from(table)
      .insert(basePayload)
      .select('id,code,name,description,is_active,version')
      .single<BaseCatalogRow>();

    if (error) throw mapSupabaseError(error, 'No se pudo crear el elemento del catálogo.');
    return toItem(data);
  }

  public async update(
    kind: CatalogKind,
    id: string,
    input: UpdateCatalogItemInput,
  ): Promise<CatalogItem> {
    const { data, error } = await this.client.rpc('update_catalog_item_v1', {
      p_kind: kind,
      p_item_id: id,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo editar el elemento del catálogo.');
    return catalogItemSchema.parse(data);
  }

  public async setActive(
    kind: CatalogKind,
    id: string,
    isActive: boolean,
    version: number,
  ): Promise<CatalogItem> {
    const table = tableByKind[kind];
    const actorId = this.actorId;
    const { data, error } = await this.client
      .from(table)
      .update({ is_active: isActive, updated_by: actorId })
      .eq('id', id)
      .eq('version', version)
      .select('id,code,name,description,is_active,version')
      .maybeSingle<BaseCatalogRow>();

    if (error) throw mapSupabaseError(error, 'No se pudo actualizar el elemento del catálogo.');
    if (!data) {
      throw new AppError({
        code: 'OPTIMISTIC_LOCK_CONFLICT',
        message:
          'El catálogo fue modificado por otra administradora. Actualiza la pantalla e inténtalo nuevamente.',
        statusCode: 409,
      });
    }
    return toItem(data);
  }
}
