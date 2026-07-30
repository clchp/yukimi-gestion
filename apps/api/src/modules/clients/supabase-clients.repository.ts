import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clientDetailSchema,
  clientListResponseSchema,
  clientSupportDataSchema,
  type ClientDetail,
  type ClientListResponse,
  type ClientSupportData,
  type CreateClientAddressInput,
  type CreateClientIncidentInput,
  type CreateClientInput,
  type ResolveClientIncidentInput,
  type SetClientStatusInput,
  type SetClientVipInput,
  type UpdateClientAddressInput,
  type UpdateClientInput,
} from '@yukimi/shared';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type {
  ClientListQuery,
  ClientMutationResult,
  ClientRepository,
} from './clients.repository.js';

interface RpcMutationRow {
  id: string;
  code?: string;
  version: number;
  isVip?: boolean;
}

export class SupabaseClientRepository implements ClientRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async list(query: ClientListQuery): Promise<ClientListResponse> {
    const { data, error } = await this.client.rpc('list_clients_v1', {
      p_search: query.search ?? null,
      p_filter: query.filter,
      p_page: query.page,
      p_page_size: query.pageSize,
    });
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar los clientes.');
    return clientListResponseSchema.parse(data);
  }

  public async getById(clientId: string): Promise<ClientDetail> {
    const { data, error } = await this.client.rpc('get_client_detail_v1', { p_client_id: clientId });
    if (error) throw mapSupabaseError(error, 'No se pudo cargar el cliente.');
    return clientDetailSchema.parse(data);
  }

  public async getSupportData(): Promise<ClientSupportData> {
    const assignments = await this.client
      .from('business_partner_types')
      .select('partner_id')
      .eq('partner_type_code', 'AGENCY');
    if (assignments.error) throw mapSupabaseError(assignments.error, 'No se pudieron cargar las agencias.');

    const partnerIds = [...new Set((assignments.data ?? []).map((row) => String(row.partner_id)))];
    if (partnerIds.length === 0) return { preferredPartners: [] };

    const partners = await this.client
      .from('business_partners')
      .select('id,legal_name,trade_name,is_active')
      .in('id', partnerIds)
      .eq('is_active', true)
      .order('trade_name');
    if (partners.error) throw mapSupabaseError(partners.error, 'No se pudieron cargar las agencias.');

    return clientSupportDataSchema.parse({
      preferredPartners: (partners.data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.trade_name ?? row.legal_name),
      })),
    });
  }

  public async create(input: CreateClientInput, idempotencyKey: string): Promise<ClientMutationResult> {
    const { data, error } = await this.client.rpc('create_client_v1', {
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo crear el cliente.');
    return data as RpcMutationRow;
  }

  public async update(clientId: string, input: UpdateClientInput): Promise<ClientMutationResult> {
    const { version, ...payload } = input;
    const { data, error } = await this.client.rpc('update_client_v1', {
      p_client_id: clientId,
      p_expected_version: version,
      p_input: payload,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar el cliente.');
    return data as RpcMutationRow;
  }

  public async setStatus(clientId: string, input: SetClientStatusInput): Promise<ClientMutationResult> {
    const { data, error } = await this.client.rpc('set_client_status_v1', {
      p_client_id: clientId,
      p_expected_version: input.version,
      p_is_active: input.isActive,
      p_reason: input.reason,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar el estado del cliente.');
    return data as RpcMutationRow;
  }

  public async setVip(
    clientId: string,
    input: SetClientVipInput,
  ): Promise<ClientMutationResult & { isVip: boolean }> {
    const { clientVersion, ...payload } = input;
    const { data, error } = await this.client.rpc('set_client_vip_v1', {
      p_client_id: clientId,
      p_expected_client_version: clientVersion,
      p_input: payload,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo actualizar la condición VIP.');
    return data as RpcMutationRow & { isVip: boolean };
  }

  public async saveAddress(
    clientId: string,
    addressId: string | null,
    input: CreateClientAddressInput | UpdateClientAddressInput,
    expectedVersion: number | null,
  ): Promise<ClientMutationResult> {
    const payload = { ...input } as Record<string, unknown>;
    delete payload.version;
    const { data, error } = await this.client.rpc('save_client_address_v1', {
      p_client_id: clientId,
      p_address_id: addressId,
      p_expected_version: expectedVersion,
      p_input: payload,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo guardar la dirección.');
    return data as RpcMutationRow;
  }

  public async createIncident(
    clientId: string,
    input: CreateClientIncidentInput,
  ): Promise<ClientMutationResult> {
    const { data, error } = await this.client.rpc('create_client_incident_v1', {
      p_client_id: clientId,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el incidente.');
    return data as RpcMutationRow;
  }

  public async resolveIncident(
    incidentId: string,
    input: ResolveClientIncidentInput,
  ): Promise<ClientMutationResult> {
    const { data, error } = await this.client.rpc('resolve_client_incident_v1', {
      p_incident_id: incidentId,
      p_expected_version: input.version,
      p_resolution_notes: input.resolutionNotes,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo resolver el incidente.');
    return data as RpcMutationRow;
  }
}
