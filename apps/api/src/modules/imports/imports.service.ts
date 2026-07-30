import type {
  AllocatePreorderInput,
  CreateImportCostInput,
  CreateImportIncidentInput,
  CreateImportInput,
  CreateInsuranceClaimInput,
  CreateImportPartnerInput,
  CreatePreorderSaleInput,
  ReceiveImportBoxInput,
  UpdateImportBoxStateInput,
  UpdateImportStateInput,
  UpdateInsuranceClaimInput,
} from '@yukimi/shared';
import type { ImportListQuery, ImportsRepository } from './imports.repository.js';

export class ImportsService {
  public constructor(private readonly repository: ImportsRepository) {}
  public list(query: ImportListQuery) { return this.repository.list(query); }
  public getSupportData() { return this.repository.getSupportData(); }
  public getById(importId: string) { return this.repository.getById(importId); }
  public create(input: CreateImportInput, idempotencyKey: string) { return this.repository.create(input, idempotencyKey); }
  public createPartner(input: CreateImportPartnerInput) { return this.repository.createPartner(input); }
  public createPreorder(input: CreatePreorderSaleInput, idempotencyKey: string) { return this.repository.createPreorder(input, idempotencyKey); }
  public advance(importId: string, input: UpdateImportStateInput) { return this.repository.advance(importId, input); }
  public advanceBox(boxId: string, input: UpdateImportBoxStateInput) { return this.repository.advanceBox(boxId, input); }
  public addCost(importId: string, input: CreateImportCostInput) { return this.repository.addCost(importId, input); }
  public createIncident(importId: string, input: CreateImportIncidentInput) { return this.repository.createIncident(importId, input); }
  public createInsuranceClaim(importId: string, input: CreateInsuranceClaimInput) { return this.repository.createInsuranceClaim(importId, input); }
  public updateInsuranceClaim(claimId: string, input: UpdateInsuranceClaimInput) { return this.repository.updateInsuranceClaim(claimId, input); }
  public allocatePreorder(input: AllocatePreorderInput) { return this.repository.allocatePreorder(input); }
  public receiveBox(boxId: string, input: ReceiveImportBoxInput, idempotencyKey: string) { return this.repository.receiveBox(boxId, input, idempotencyKey); }
}
