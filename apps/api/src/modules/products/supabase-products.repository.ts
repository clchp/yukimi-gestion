import type { SupabaseClient } from '@supabase/supabase-js';
import {
  inventoryMovementResultSchema,
  productDetailSchema,
  updateProductResultSchema,
} from '@yukimi/shared';
import type {
  AttachmentRegistrationInput,
  CreateInventoryMovementInput,
  CreateProductInput,
  CreateProductResult,
  InventoryMovementResult,
  InventoryResponse,
  InventoryRow,
  ProductDetail,
  ProductListItem,
  ProductListResponse,
  UpdateProductInput,
  UpdateProductResult,
} from '@yukimi/shared';
import { AppError } from '../../shared/errors/app-error.js';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { InventoryQuery, ProductListQuery, ProductRepository } from './products.repository.js';

interface ProductIdRow {
  id: string;
}

interface ProductCatalogRow {
  product_id: string;
  product_code: string;
  product_name: string;
  character_name: string | null;
  category_id: string;
  category_name: string;
  franchise_id: string | null;
  franchise_name: string | null;
  brand_name: string | null;
  product_line_name: string | null;
  product_is_active: boolean;
  product_version: number;
  variant_id: string;
  sku: string;
  variant_name: string;
  sale_price: number | string;
  currency_code: string;
  minimum_stock: number;
  variant_is_active: boolean;
  available_quantity: number;
  reserved_quantity: number;
  accumulated_quantity: number;
  damaged_quantity: number;
  lost_quantity: number;
  in_transit_quantity: number;
  preorder_expected_quantity: number;
}

interface ProductDetailRow {
  id: string;
  code: string;
  name: string;
  character_name: string | null;
  category_id: string;
  franchise_id: string | null;
  brand_id: string | null;
  product_line_id: string | null;
  description: string | null;
  is_active: boolean;
  version: number;
}

interface ProductVariantDetailRow {
  id: string;
  sku: string;
  variant_name: string;
  barcode: string | null;
  sale_price: number | string;
  currency_code: string;
  minimum_stock: number;
  weight_grams: number | string | null;
  dimensions: Record<string, string | number> | null;
  is_active: boolean;
  version: number;
}

interface AttachmentRow {
  id: string;
  entity_id: string;
  object_path: string;
  metadata: Record<string, unknown> | null;
}

interface InventoryViewRow {
  variant_id: string;
  product_id: string;
  product_code: string;
  sku: string;
  product_name: string;
  variant_name: string;
  category_name: string;
  franchise_name: string | null;
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  warehouse_is_virtual: boolean;
  is_visible_in_operations: boolean;
  available_quantity: number;
  reserved_quantity: number;
  accumulated_quantity: number;
  damaged_quantity: number;
  lost_quantity: number;
  in_transit_quantity: number;
  preorder_expected_quantity: number;
  minimum_stock: number;
  sale_price: number | string;
  current_unit_cost_pen: number | string | null;
  currency_code: string;
  is_active: boolean;
}

function numeric(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function nullableNumeric(value: number | string | null): number | null {
  return value == null ? null : numeric(value);
}

function normalizeSearch(search: string): string {
  return search
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,%()]/g, ' ')
    .trim()
    .slice(0, 100);
}

function normalizeComparable(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

function toRpcPayload(input: CreateProductInput): Record<string, unknown> {
  return {
    name: input.name,
    franchise_id: input.franchiseId ?? null,
    character_name: input.characterName ?? null,
    category_id: input.categoryId,
    brand_id: input.brandId ?? null,
    product_line_id: input.productLineId ?? null,
    description: input.description ?? null,
    is_active: input.isActive,
    variants: input.variants.map((variant) => ({
      variant_name: variant.variantName,
      barcode: variant.barcode ?? null,
      sale_price: variant.salePrice,
      currency_code: variant.currencyCode,
      minimum_stock: variant.minimumStock,
      weight_grams: variant.weightGrams ?? null,
      dimensions: variant.dimensions,
      is_active: variant.isActive,
      attributes: variant.attributes.map((attribute) => ({
        attribute_id: attribute.attributeId,
        value_text: attribute.valueText,
        value_number: attribute.valueNumber,
        value_boolean: attribute.valueBoolean,
        value_date: attribute.valueDate,
      })),
      initial_stock: variant.initialStock.map((stock) => ({
        warehouse_id: stock.warehouseId,
        quantity: stock.quantity,
        original_currency_code: stock.originalCurrencyCode,
        original_unit_cost: stock.originalUnitCost,
        exchange_rate_to_pen: stock.exchangeRateToPen,
      })),
    })),
  };
}

function toUpdatePayload(input: UpdateProductInput): Record<string, unknown> {
  return {
    name: input.name,
    franchise_id: input.franchiseId ?? null,
    character_name: input.characterName ?? null,
    category_id: input.categoryId,
    brand_id: input.brandId ?? null,
    product_line_id: input.productLineId ?? null,
    description: input.description ?? null,
    is_active: input.isActive,
    version: input.version,
    reason: input.reason,
    variants: input.variants.map((variant) => ({
      id: variant.id,
      variant_name: variant.variantName,
      barcode: variant.barcode ?? null,
      sale_price: variant.salePrice,
      currency_code: variant.currencyCode,
      minimum_stock: variant.minimumStock,
      weight_grams: variant.weightGrams ?? null,
      dimensions: variant.dimensions,
      is_active: variant.isActive,
      version: variant.version,
    })),
  };
}

export class SupabaseProductRepository implements ProductRepository {
  public constructor(
    private readonly client: SupabaseClient,
    private readonly actorId: string,
  ) {}

  public async list(query: ProductListQuery): Promise<ProductListResponse> {
    let idQuery = this.client
      .from('products')
      .select('id', { count: 'exact' })
      .order('updated_at', { ascending: false });

    if (query.categoryId) idQuery = idQuery.eq('category_id', query.categoryId);
    if (query.isActive !== undefined) idQuery = idQuery.eq('is_active', query.isActive);
    if (query.search) {
      const search = normalizeSearch(query.search);
      if (search) {
        const { data: matchingFranchises, error: franchiseError } = await this.client
          .from('franchises')
          .select('id')
          .ilike('search_name_normalized', `%${search.toLocaleLowerCase('es')}%`)
          .limit(30)
          .returns<Array<{ id: string }>>();
        if (franchiseError)
          throw mapSupabaseError(franchiseError, 'No se pudo completar la búsqueda de productos.');

        const franchiseFilter =
          (matchingFranchises ?? []).length > 0
            ? `,franchise_id.in.(${(matchingFranchises ?? []).map((item) => item.id).join(',')})`
            : '';
        idQuery = idQuery.or(
          `code.ilike.%${search}%,search_name_normalized.ilike.%${search.toLocaleLowerCase('es')}%,search_character_normalized.ilike.%${search.toLocaleLowerCase('es')}%${franchiseFilter}`,
        );
      }
    }

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const {
      data: idRows,
      error: idError,
      count,
    } = await idQuery.range(from, to).returns<ProductIdRow[]>();
    if (idError) throw mapSupabaseError(idError, 'No se pudieron cargar los productos.');

    const productIds = (idRows ?? []).map((row) => row.id);
    if (productIds.length === 0) {
      return {
        items: [],
        summary: await this.loadSummary(),
        page: query.page,
        pageSize: query.pageSize,
        total: count ?? 0,
      };
    }

    const [
      { data: rows, error: rowsError },
      { data: attachments, error: attachmentsError },
      summary,
    ] = await Promise.all([
      this.client
        .from('v_product_catalog')
        .select('*')
        .in('product_id', productIds)
        .returns<ProductCatalogRow[]>(),
      this.client
        .from('attachments')
        .select('id,entity_id,object_path,metadata')
        .eq('entity_type', 'PRODUCT')
        .eq('attachment_type', 'IMAGE')
        .eq('is_active', true)
        .in('entity_id', productIds)
        .returns<AttachmentRow[]>(),
      this.loadSummary(),
    ]);

    if (rowsError)
      throw mapSupabaseError(rowsError, 'No se pudieron cargar las variantes de los productos.');
    if (attachmentsError)
      throw mapSupabaseError(
        attachmentsError,
        'No se pudieron cargar las imágenes de los productos.',
      );

    const order = new Map(productIds.map((id, index) => [id, index]));
    const coverByProduct = new Map<string, string>();
    for (const attachment of attachments ?? []) {
      const current = coverByProduct.get(attachment.entity_id);
      if (!current || attachment.metadata?.isCover === true) {
        coverByProduct.set(attachment.entity_id, attachment.object_path);
      }
    }

    const products = new Map<string, ProductListItem>();
    for (const row of rows ?? []) {
      let product = products.get(row.product_id);
      if (!product) {
        product = {
          productId: row.product_id,
          productCode: row.product_code,
          productName: row.product_name,
          characterName: row.character_name,
          categoryId: row.category_id,
          categoryName: row.category_name,
          franchiseId: row.franchise_id,
          franchiseName: row.franchise_name,
          brandName: row.brand_name,
          productLineName: row.product_line_name,
          isActive: row.product_is_active,
          version: row.product_version,
          imagePath: coverByProduct.get(row.product_id) ?? null,
          variants: [],
        };
        products.set(row.product_id, product);
      }

      product.variants.push({
        variantId: row.variant_id,
        sku: row.sku,
        variantName: row.variant_name,
        salePrice: numeric(row.sale_price),
        currencyCode: row.currency_code,
        minimumStock: row.minimum_stock,
        availableQuantity: row.available_quantity,
        reservedQuantity: row.reserved_quantity,
        accumulatedQuantity: row.accumulated_quantity,
        damagedQuantity: row.damaged_quantity,
        lostQuantity: row.lost_quantity,
        inTransitQuantity: row.in_transit_quantity,
        preorderExpectedQuantity: row.preorder_expected_quantity,
        isActive: row.variant_is_active,
      });
    }

    return {
      items: [...products.values()].sort(
        (left, right) => (order.get(left.productId) ?? 0) - (order.get(right.productId) ?? 0),
      ),
      summary,
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? 0,
    };
  }

  public async get(productId: string): Promise<ProductDetail> {
    const [productResult, variantsResult, attachmentsResult] = await Promise.all([
      this.client
        .from('products')
        .select(
          'id,code,name,character_name,category_id,franchise_id,brand_id,product_line_id,description,is_active,version',
        )
        .eq('id', productId)
        .maybeSingle<ProductDetailRow>(),
      this.client
        .from('product_variants')
        .select(
          'id,sku,variant_name,barcode,sale_price,currency_code,minimum_stock,weight_grams,dimensions,is_active,version',
        )
        .eq('product_id', productId)
        .order('created_at')
        .returns<ProductVariantDetailRow[]>(),
      this.client
        .from('attachments')
        .select('id,entity_id,object_path,metadata')
        .eq('entity_type', 'PRODUCT')
        .eq('entity_id', productId)
        .eq('attachment_type', 'IMAGE')
        .eq('is_active', true)
        .order('created_at')
        .returns<AttachmentRow[]>(),
    ]);

    if (productResult.error)
      throw mapSupabaseError(productResult.error, 'No se pudo cargar el producto.');
    if (!productResult.data) {
      throw new AppError({
        code: 'PRODUCT_NOT_FOUND',
        message: 'El producto no existe.',
        statusCode: 404,
      });
    }
    if (variantsResult.error)
      throw mapSupabaseError(variantsResult.error, 'No se pudieron cargar las variantes.');
    if (attachmentsResult.error)
      throw mapSupabaseError(attachmentsResult.error, 'No se pudieron cargar las imágenes.');

    const product = productResult.data;
    const loadName = async (table: string, id: string | null) => {
      if (!id) return null;
      const { data, error } = await this.client
        .from(table)
        .select('name')
        .eq('id', id)
        .maybeSingle<{ name: string }>();
      if (error) throw mapSupabaseError(error, 'No se pudo cargar un catálogo del producto.');
      return data?.name ?? null;
    };
    const [categoryName, franchiseName, brandName, productLineName] = await Promise.all([
      loadName('product_categories', product.category_id),
      loadName('franchises', product.franchise_id),
      loadName('brands', product.brand_id),
      loadName('product_lines', product.product_line_id),
    ]);

    return productDetailSchema.parse({
      id: product.id,
      code: product.code,
      name: product.name,
      characterName: product.character_name,
      categoryId: product.category_id,
      categoryName: categoryName ?? 'Sin categoría',
      franchiseId: product.franchise_id,
      franchiseName,
      brandId: product.brand_id,
      brandName,
      productLineId: product.product_line_id,
      productLineName,
      description: product.description,
      imagePaths: (attachmentsResult.data ?? []).map((attachment) => attachment.object_path),
      isActive: product.is_active,
      version: Number(product.version),
      variants: (variantsResult.data ?? []).map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        variantName: variant.variant_name,
        barcode: variant.barcode,
        salePrice: numeric(variant.sale_price),
        currencyCode: variant.currency_code,
        minimumStock: variant.minimum_stock,
        weightGrams: nullableNumeric(variant.weight_grams),
        dimensions: variant.dimensions ?? {},
        isActive: variant.is_active,
        version: Number(variant.version),
      })),
    });
  }

  private async loadSummary(): Promise<ProductListResponse['summary']> {
    const [{ count, error: productError }, { data: inventoryRows, error: inventoryError }] =
      await Promise.all([
        this.client
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        this.client
          .from('v_inventory_summary')
          .select(
            'variant_id,available_quantity,preorder_expected_quantity,minimum_stock,is_active,is_visible_in_operations',
          )
          .eq('is_active', true),
      ]);

    if (productError)
      throw mapSupabaseError(productError, 'No se pudo calcular el resumen de productos.');
    if (inventoryError)
      throw mapSupabaseError(inventoryError, 'No se pudo calcular el resumen de inventario.');

    const rows = (inventoryRows ?? []) as Array<{
      variant_id: string;
      available_quantity: number;
      preorder_expected_quantity: number;
      minimum_stock: number;
      is_visible_in_operations: boolean;
    }>;
    const lowStock = new Set<string>();
    let availableUnits = 0;
    let preorderUnits = 0;
    for (const row of rows) {
      if (row.is_visible_in_operations) {
        availableUnits += row.available_quantity;
        if (row.minimum_stock > 0 && row.available_quantity <= row.minimum_stock)
          lowStock.add(row.variant_id);
      }
      preorderUnits += row.preorder_expected_quantity;
    }

    return {
      activeProducts: count ?? 0,
      availableUnits,
      preorderUnits,
      lowStockVariants: lowStock.size,
    };
  }

  public async create(
    input: CreateProductInput,
    idempotencyKey: string,
  ): Promise<CreateProductResult> {
    const { data, error } = await this.client.rpc('create_product_bundle', {
      p_payload: toRpcPayload(input),
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo crear el producto.');
    return data as CreateProductResult;
  }

  public async update(productId: string, input: UpdateProductInput): Promise<UpdateProductResult> {
    const { data, error } = await this.client.rpc('update_product_bundle_v1', {
      p_product_id: productId,
      p_payload: toUpdatePayload(input),
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar el producto.');
    return updateProductResultSchema.parse(data);
  }

  public async registerAttachment(
    productId: string,
    input: AttachmentRegistrationInput,
  ): Promise<{ id: string }> {
    const { data: product, error: productError } = await this.client
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle();
    if (productError) throw mapSupabaseError(productError, 'No se pudo verificar el producto.');
    if (!product) {
      throw new AppError({
        code: 'PRODUCT_NOT_FOUND',
        message: 'El producto no existe.',
        statusCode: 404,
      });
    }

    const { data, error } = await this.client
      .from('attachments')
      .insert({
        entity_type: 'PRODUCT',
        entity_id: productId,
        attachment_type: 'IMAGE',
        bucket_id: input.bucketId,
        object_path: input.objectPath,
        original_filename: input.originalFilename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        metadata: { isCover: input.isCover },
        uploaded_by: this.actorId,
      })
      .select('id')
      .single<{ id: string }>();

    if (error)
      throw mapSupabaseError(error, 'La imagen se subió, pero no se pudo asociar al producto.');
    return data;
  }

  public async listInventory(query: InventoryQuery): Promise<InventoryResponse> {
    let inventoryQuery = this.client
      .from('v_inventory_summary')
      .select('*')
      .eq('is_active', true)
      .order('product_name')
      .order('variant_name');

    if (!query.includeVirtual) inventoryQuery = inventoryQuery.eq('is_visible_in_operations', true);
    if (query.warehouseId) inventoryQuery = inventoryQuery.eq('warehouse_id', query.warehouseId);
    const { data, error } = await inventoryQuery.returns<InventoryViewRow[]>();
    if (error) throw mapSupabaseError(error, 'No se pudo cargar el inventario.');

    const search = query.search ? normalizeComparable(normalizeSearch(query.search)) : '';
    const filteredRows = search
      ? (data ?? []).filter((row) =>
          normalizeComparable(
            `${row.product_name} ${row.variant_name} ${row.product_code} ${row.sku} ${row.franchise_name ?? ''}`,
          ).includes(search),
        )
      : (data ?? []);

    const items: InventoryRow[] = filteredRows.map((row) => ({
      variantId: row.variant_id,
      productId: row.product_id,
      productCode: row.product_code,
      sku: row.sku,
      productName: row.product_name,
      variantName: row.variant_name,
      categoryName: row.category_name,
      franchiseName: row.franchise_name,
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      warehouseName: row.warehouse_name,
      availableQuantity: row.available_quantity,
      reservedQuantity: row.reserved_quantity,
      accumulatedQuantity: row.accumulated_quantity,
      damagedQuantity: row.damaged_quantity,
      lostQuantity: row.lost_quantity,
      inTransitQuantity: row.in_transit_quantity,
      preorderExpectedQuantity: row.preorder_expected_quantity,
      minimumStock: row.minimum_stock,
      salePrice: numeric(row.sale_price),
      currentUnitCostPen: nullableNumeric(row.current_unit_cost_pen),
      currencyCode: row.currency_code,
      isActive: row.is_active,
    }));

    return {
      items,
      totals: items.reduce(
        (totals, item) => ({
          available: totals.available + item.availableQuantity,
          reserved: totals.reserved + item.reservedQuantity,
          accumulated: totals.accumulated + item.accumulatedQuantity,
          damaged: totals.damaged + item.damagedQuantity,
          lost: totals.lost + item.lostQuantity,
          inTransit: totals.inTransit + item.inTransitQuantity,
          preorderExpected: totals.preorderExpected + item.preorderExpectedQuantity,
        }),
        {
          available: 0,
          reserved: 0,
          accumulated: 0,
          damaged: 0,
          lost: 0,
          inTransit: 0,
          preorderExpected: 0,
        },
      ),
    };
  }

  public async createInventoryMovement(
    input: CreateInventoryMovementInput,
    idempotencyKey: string,
  ): Promise<InventoryMovementResult> {
    const { data, error } = await this.client.rpc('create_inventory_movement_v1', {
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el movimiento de inventario.');
    return inventoryMovementResultSchema.parse(data);
  }
}
