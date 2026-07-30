import type { SupabaseClient } from '@supabase/supabase-js';
import {
  importDetailSchema,
  importGenericResultSchema,
  importListResponseSchema,
  importMutationResultSchema,
  importSupportDataSchema,
  preorderSaleResultSchema,
  type AllocatePreorderInput,
  type CreateImportCostInput,
  type CreateImportIncidentInput,
  type CreateImportInput,
  type CreateInsuranceClaimInput,
  type CreateImportPartnerInput,
  type CreatePreorderSaleInput,
  type ImportDetail,
  type ImportGenericResult,
  type ImportListResponse,
  type ImportMutationResult,
  type ImportSupportData,
  type PreorderSaleResult,
  type ReceiveImportBoxInput,
  type UpdateImportBoxStateInput,
  type UpdateImportStateInput,
  type UpdateInsuranceClaimInput,
} from '@yukimi/shared';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { ImportListQuery, ImportsRepository } from './imports.repository.js';

export class SupabaseImportsRepository implements ImportsRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async list(query: ImportListQuery): Promise<ImportListResponse> {
    const { data, error } = await this.client.rpc('list_imports_v1', {
      p_search: query.search ?? null,
      p_filter: query.filter,
      p_page: query.page,
      p_page_size: query.pageSize,
    });
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar las importaciones.');
    return importListResponseSchema.parse(data);
  }

  public async getSupportData(): Promise<ImportSupportData> {
    const { data, error } = await this.client.rpc('get_import_support_v1');
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar las opciones de importación.');
    return importSupportDataSchema.parse(data);
  }

  public async getById(importId: string): Promise<ImportDetail> {
    const { data, error } = await this.client.rpc('get_import_detail_v1', {
      p_import_id: importId,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo cargar la importación.');
    return importDetailSchema.parse(data);
  }

  public async create(
    input: CreateImportInput,
    idempotencyKey: string,
  ): Promise<ImportMutationResult> {
    const { data, error } = await this.client.rpc('create_import_v1', {
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo crear la importación.');
    return importMutationResultSchema.parse(data);
  }

  public async createPartner(input: CreateImportPartnerInput): Promise<ImportGenericResult> {
    const { data, error } = await this.client.rpc('create_import_partner_v1', { p_input: input });
    if (error) throw mapSupabaseError(error, 'No se pudo crear el proveedor u operador.');
    return importGenericResultSchema.parse(data);
  }

  public async createPreorder(
    input: CreatePreorderSaleInput,
    idempotencyKey: string,
  ): Promise<PreorderSaleResult> {
    const { data, error } = await this.client.rpc('create_preorder_sale_v1', {
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo crear la preventa.');
    return preorderSaleResultSchema.parse(data);
  }

  public async advance(
    importId: string,
    input: UpdateImportStateInput,
  ): Promise<ImportMutationResult> {
    const { data, error } = await this.client.rpc('advance_import_v1', {
      p_import_id: importId,
      p_next_state_code: input.nextStateCode,
      p_reason: input.reason,
      p_occurred_at: input.occurredAt ?? null,
      p_master_tracking_number: input.masterTrackingNumber ?? null,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar el estado de la importación.');
    return importMutationResultSchema.parse(data);
  }

  public async advanceBox(
    boxId: string,
    input: UpdateImportBoxStateInput,
  ): Promise<ImportMutationResult> {
    const { data, error } = await this.client.rpc('advance_import_box_v1', {
      p_box_id: boxId,
      p_next_state_code: input.nextStateCode,
      p_reason: input.reason,
      p_occurred_at: input.occurredAt ?? null,
      p_tracking_number: input.trackingNumber ?? null,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar el estado de la caja.');
    return importMutationResultSchema.parse(data);
  }

  public async addCost(
    importId: string,
    input: CreateImportCostInput,
  ): Promise<ImportGenericResult> {
    const { data, error } = await this.client.rpc('add_import_cost_v2', {
      p_import_id: importId,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el costo.');
    return importGenericResultSchema.parse(data);
  }

  public async createIncident(
    importId: string,
    input: CreateImportIncidentInput,
  ): Promise<ImportGenericResult> {
    const { data, error } = await this.client.rpc('create_import_incident_v1', {
      p_import_id: importId,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar la incidencia.');
    return importGenericResultSchema.parse(data);
  }

  public async createInsuranceClaim(
    importId: string,
    input: CreateInsuranceClaimInput,
  ): Promise<ImportGenericResult> {
    const { data, error } = await this.client.rpc('create_insurance_claim_v1', {
      p_import_id: importId,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el reclamo al seguro.');
    return importGenericResultSchema.parse(data);
  }

  public async updateInsuranceClaim(
    claimId: string,
    input: UpdateInsuranceClaimInput,
  ): Promise<ImportGenericResult> {
    const { data, error } = await this.client.rpc('update_insurance_claim_v1', {
      p_claim_id: claimId,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar el reclamo al seguro.');
    return importGenericResultSchema.parse(data);
  }

  public async allocatePreorder(input: AllocatePreorderInput): Promise<ImportGenericResult> {
    const { data, error } = await this.client.rpc('allocate_preorder_v1', { p_input: input });
    if (error) throw mapSupabaseError(error, 'No se pudo vincular la preventa.');
    return importGenericResultSchema.parse(data);
  }

  public async receiveBox(
    boxId: string,
    input: ReceiveImportBoxInput,
    idempotencyKey: string,
  ): Promise<ImportMutationResult> {
    const { data, error } = await this.client.rpc('receive_import_box_v2', {
      p_box_id: boxId,
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo ingresar la caja a stock.');
    return importMutationResultSchema.parse(data);
  }
}
