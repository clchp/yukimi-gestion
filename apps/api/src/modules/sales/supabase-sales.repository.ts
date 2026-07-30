import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSaleResultSchema,
  saleDetailSchema,
  saleListResponseSchema,
  saleReleaseQuoteSchema,
  saleSupportDataSchema,
  type CreateSaleInput,
  type CreateSaleResult,
  type RequestSaleReleaseInput,
  type ReviewSaleReleaseInput,
  type SaleDetail,
  type SaleListResponse,
  type SaleReleaseQuote,
  type SaleSupportData,
} from '@yukimi/shared';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { SaleListQuery, SalesRepository } from './sales.repository.js';


export class SupabaseSalesRepository implements SalesRepository {
  public constructor(
    private readonly client: SupabaseClient,
    private readonly actorId: string,
  ) {}

  public async list(query: SaleListQuery): Promise<SaleListResponse> {
    const { data, error } = await this.client.rpc('list_sales_v1', {
      p_search: query.search ?? null,
      p_filter: query.filter,
      p_page: query.page,
      p_page_size: query.pageSize,
    });
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar las ventas.');
    return saleListResponseSchema.parse(data);
  }

  public async getSupportData(): Promise<SaleSupportData> {
    const { data, error } = await this.client.rpc('get_sale_support_v1');
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar las opciones de venta.');
    return saleSupportDataSchema.parse(data);
  }

  public async getById(saleId: string): Promise<SaleDetail> {
    const { data, error } = await this.client.rpc('get_sale_detail_v2', { p_sale_id: saleId });
    if (error) throw mapSupabaseError(error, 'No se pudo cargar la venta.');
    return saleDetailSchema.parse(data);
  }

  public async create(input: CreateSaleInput, idempotencyKey: string): Promise<CreateSaleResult> {
    const { data, error } = await this.client.rpc('create_sale_v2', {
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo crear la venta.');
    return createSaleResultSchema.parse(data);
  }

  public async getReleaseQuote(saleItemId: string): Promise<SaleReleaseQuote> {
    const { data, error } = await this.client.rpc('get_sale_release_quote_v2', {
      p_sale_item_id: saleItemId,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo calcular la penalidad sugerida.');
    return saleReleaseQuoteSchema.parse(data);
  }

  public async requestRelease(
    saleItemId: string,
    input: RequestSaleReleaseInput,
  ): Promise<{ id: string; stateCode: string; version: number }> {
    const { data, error } = await this.client.rpc('request_sale_release_v2', {
      p_sale_item_id: saleItemId,
      p_reason: input.reason,
      p_penalty_amount: input.penaltyAmount,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo solicitar la liberación.');
    const row = data as { id: string; stateCode: string; version: number };
    return { id: row.id, stateCode: row.stateCode, version: row.version };
  }

  public async reviewRelease(
    requestId: string,
    input: ReviewSaleReleaseInput,
  ): Promise<{ id: string; stateCode: string; version: number }> {
    const { data, error } = await this.client.rpc('review_sale_release_v2', {
      p_request_id: requestId,
      p_decision: input.decision,
      p_review_notes: input.reviewNotes,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo revisar la solicitud de liberación.');
    const row = data as { id: string; stateCode: string; version: number };
    return { id: row.id, stateCode: row.stateCode, version: row.version };
  }
}
