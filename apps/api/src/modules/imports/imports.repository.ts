import type {
  AllocatePreorderInput,
  CreateImportCostInput,
  CreateImportIncidentInput,
  CreateImportInput,
  CreateImportWithDniInput,
  CreateInsuranceClaimInput,
  CreateImportPartnerInput,
  CreatePreorderSaleInput,
  ImportDetail,
  ImportDniPeopleResponse,
  ImportDniUsagesResponse,
  ImportFilter,
  ImportGenericResult,
  ImportListResponse,
  ImportMutationResult,
  ImportSupportData,
  PreorderSaleResult,
  ReceiveImportBoxInput,
  RegisterImportDniUsageInput,
  RegisterImportDniUsageResult,
  UpdateImportBoxStateInput,
  UpdateImportDniPersonInput,
  UpdateImportDniPersonResult,
  UpdateImportStateInput,
  UpdateInsuranceClaimInput,
} from '@yukimi/shared';

export interface ImportListQuery {
  search?: string | undefined;
  filter: ImportFilter;
  page: number;
  pageSize: number;
}

export interface ImportsRepository {
  list(query: ImportListQuery): Promise<ImportListResponse>;
  getSupportData(): Promise<ImportSupportData>;
  getById(importId: string): Promise<ImportDetail>;
  create(input: CreateImportInput, idempotencyKey: string): Promise<ImportMutationResult>;
  createWithDni(
    input: CreateImportWithDniInput,
    idempotencyKey: string,
  ): Promise<ImportMutationResult>;
  listDniPeople(): Promise<ImportDniPeopleResponse>;
  updateDniPerson(
    personId: string,
    input: UpdateImportDniPersonInput,
  ): Promise<UpdateImportDniPersonResult>;
  getDniUsages(importId: string): Promise<ImportDniUsagesResponse>;
  registerDniUsage(
    importId: string,
    input: RegisterImportDniUsageInput,
  ): Promise<RegisterImportDniUsageResult>;
  createPartner(input: CreateImportPartnerInput): Promise<ImportGenericResult>;
  createPreorder(
    input: CreatePreorderSaleInput,
    idempotencyKey: string,
  ): Promise<PreorderSaleResult>;
  advance(importId: string, input: UpdateImportStateInput): Promise<ImportMutationResult>;
  advanceBox(boxId: string, input: UpdateImportBoxStateInput): Promise<ImportMutationResult>;
  addCost(importId: string, input: CreateImportCostInput): Promise<ImportGenericResult>;
  createIncident(importId: string, input: CreateImportIncidentInput): Promise<ImportGenericResult>;
  createInsuranceClaim(
    importId: string,
    input: CreateInsuranceClaimInput,
  ): Promise<ImportGenericResult>;
  updateInsuranceClaim(
    claimId: string,
    input: UpdateInsuranceClaimInput,
  ): Promise<ImportGenericResult>;
  allocatePreorder(input: AllocatePreorderInput): Promise<ImportGenericResult>;
  receiveBox(
    boxId: string,
    input: ReceiveImportBoxInput,
    idempotencyKey: string,
  ): Promise<ImportMutationResult>;
  repairZeroReceivedBox(
    boxId: string,
    input: ReceiveImportBoxInput,
    idempotencyKey: string,
  ): Promise<ImportMutationResult>;
}
