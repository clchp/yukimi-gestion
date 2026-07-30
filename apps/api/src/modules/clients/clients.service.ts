import type {
  CreateClientAddressInput,
  CreateClientIncidentInput,
  CreateClientInput,
  ResolveClientIncidentInput,
  SetClientStatusInput,
  SetClientVipInput,
  UpdateClientAddressInput,
  UpdateClientInput,
} from '@yukimi/shared';
import type { ClientListQuery, ClientRepository } from './clients.repository.js';

export class ClientService {
  public constructor(private readonly repository: ClientRepository) {}

  public list(query: ClientListQuery) {
    return this.repository.list(query);
  }

  public getById(clientId: string) {
    return this.repository.getById(clientId);
  }

  public getSupportData() {
    return this.repository.getSupportData();
  }

  public create(input: CreateClientInput, idempotencyKey: string) {
    return this.repository.create(input, idempotencyKey);
  }

  public update(clientId: string, input: UpdateClientInput) {
    return this.repository.update(clientId, input);
  }

  public setStatus(clientId: string, input: SetClientStatusInput) {
    return this.repository.setStatus(clientId, input);
  }

  public setVip(clientId: string, input: SetClientVipInput) {
    return this.repository.setVip(clientId, input);
  }

  public saveAddress(
    clientId: string,
    addressId: string | null,
    input: CreateClientAddressInput | UpdateClientAddressInput,
    expectedVersion: number | null,
  ) {
    return this.repository.saveAddress(clientId, addressId, input, expectedVersion);
  }

  public createIncident(clientId: string, input: CreateClientIncidentInput) {
    return this.repository.createIncident(clientId, input);
  }

  public resolveIncident(incidentId: string, input: ResolveClientIncidentInput) {
    return this.repository.resolveIncident(incidentId, input);
  }
}
