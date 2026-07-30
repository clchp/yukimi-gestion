import type {
  ClientDetail,
  ClientListResponse,
  ClientSupportData,
  CreateClientAddressInput,
  CreateClientIncidentInput,
  CreateClientInput,
  ResolveClientIncidentInput,
  SetClientStatusInput,
  SetClientVipInput,
  UpdateClientAddressInput,
  UpdateClientInput,
} from '@yukimi/shared';

export type ClientFilter = 'ALL' | 'ACTIVE' | 'VIP' | 'WITH_DEBT' | 'OVERDUE' | 'INACTIVE';

export interface ClientListQuery {
  search?: string | undefined;
  filter: ClientFilter;
  page: number;
  pageSize: number;
}

export interface ClientMutationResult {
  id: string;
  code?: string;
  version: number;
}

export interface ClientRepository {
  list(query: ClientListQuery): Promise<ClientListResponse>;
  getById(clientId: string): Promise<ClientDetail>;
  getSupportData(): Promise<ClientSupportData>;
  create(input: CreateClientInput, idempotencyKey: string): Promise<ClientMutationResult>;
  update(clientId: string, input: UpdateClientInput): Promise<ClientMutationResult>;
  setStatus(clientId: string, input: SetClientStatusInput): Promise<ClientMutationResult>;
  setVip(clientId: string, input: SetClientVipInput): Promise<ClientMutationResult & { isVip: boolean }>;
  saveAddress(
    clientId: string,
    addressId: string | null,
    input: CreateClientAddressInput | UpdateClientAddressInput,
    expectedVersion: number | null,
  ): Promise<ClientMutationResult>;
  createIncident(clientId: string, input: CreateClientIncidentInput): Promise<ClientMutationResult>;
  resolveIncident(incidentId: string, input: ResolveClientIncidentInput): Promise<ClientMutationResult>;
}
