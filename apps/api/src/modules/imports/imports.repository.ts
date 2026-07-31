import type {
  AllocatePreorderInput,
  CreateImportCostInput,
  CreateImportIncidentInput,
  CreateImportInput,
  CreateInsuranceClaimInput,
  CreateImportPartnerInput,
  CreatePreorderSaleInput,
  ImportDetail,
  ImportFilter,
  ImportGenericResult,
  ImportListResponse,
  ImportMutationResult,
  ImportSupportData,
  PreorderSaleResult,
  ReceiveImportBoxInput,
  UpdateImportBoxStateInput,
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
