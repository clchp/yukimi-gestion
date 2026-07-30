import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AttachmentRegistrationInput,
  CreateProductInput,
  CreateProductResult,
  InventoryResponse,
  InventoryRow,
  ProductListItem,
  ProductListResponse,
} from '@yukimi/shared';
import { AppError } from '../../shared/errors/app-error.js';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type {
  InventoryQuery,
  ProductListQuery,
  ProductRepository,
} from './products.repository.js';

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
  currency_code: string;
  is_active: boolean;
}

function numeric(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function normalizeSearch(search: string): string {
  return search.replace(/[,%()]/g, ' ').trim().slice(0, 100);
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
          .ilike('name', `%${search}%`)
          .limit(30)
          .returns<Array<{ id: string }>>();
        if (franchiseError) throw mapSupabaseError(franchiseError, 'No se pudo completar la búsqueda de productos.');

        const franchiseFilter = (matchingFranchises ?? []).length > 0
          ? `,franchise_id.in.(${(matchingFranchises ?? []).map((item) => item.id).join(',')})`
          : '';
        idQuery = idQuery.or(
          `code.ilike.%${search}%,name.ilike.%${search}%,character_name.ilike.%${search}%${franchiseFilter}`,
        );
      }
    }

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data: idRows, error: idError, count } = await idQuery.range(from, to).returns<ProductIdRow[]>();
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

    const [{ data: rows, error: rowsError }, { data: attachments, error: attachmentsError }, summary] =
      await Promise.all([
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

    if (rowsError) throw mapSupabaseError(rowsError, 'No se pudieron cargar las variantes de los productos.');
    if (attachmentsError) throw mapSupabaseError(attachmentsError, 'No se pudieron cargar las imágenes de los productos.');

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

  private async loadSummary(): Promise<ProductListResponse['summary']> {
    const [{ count, error: productError }, { data: inventoryRows, error: inventoryError }] = await Promise.all([
      this.client.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      this.client
        .from('v_inventory_summary')
        .select('variant_id,available_quantity,preorder_expected_quantity,minimum_stock,is_active,is_visible_in_operations')
        .eq('is_active', true),
    ]);

    if (productError) throw mapSupabaseError(productError, 'No se pudo calcular el resumen de productos.');
    if (inventoryError) throw mapSupabaseError(inventoryError, 'No se pudo calcular el resumen de inventario.');

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
        if (row.minimum_stock > 0 && row.available_quantity <= row.minimum_stock) lowStock.add(row.variant_id);
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

  public async create(input: CreateProductInput, idempotencyKey: string): Promise<CreateProductResult> {
    const { data, error } = await this.client.rpc('create_product_bundle', {
      p_payload: toRpcPayload(input),
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo crear el producto.');
    return data as CreateProductResult;
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
      throw new AppError({ code: 'PRODUCT_NOT_FOUND', message: 'El producto no existe.', statusCode: 404 });
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

    if (error) throw mapSupabaseError(error, 'La imagen se subió, pero no se pudo asociar al producto.');
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
    if (query.search) {
      const search = normalizeSearch(query.search);
      if (search) inventoryQuery = inventoryQuery.or(`product_name.ilike.%${search}%,sku.ilike.%${search}%,product_code.ilike.%${search}%`);
    }

    const { data, error } = await inventoryQuery.returns<InventoryViewRow[]>();
    if (error) throw mapSupabaseError(error, 'No se pudo cargar el inventario.');

    const items: InventoryRow[] = (data ?? []).map((row) => ({
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
        { available: 0, reserved: 0, accumulated: 0, damaged: 0, lost: 0, inTransit: 0, preorderExpected: 0 },
      ),
    };
  }
}
