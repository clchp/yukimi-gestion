import type {
  BankImportResult,
  BankReconciliationData,
  CashClosureResult,
  ConfirmBankReconciliationInput,
  CreateCashClosureInput,
  CreateFinanceCategoryInput,
  CreateFinanceTransferInput,
  CreateManualFinanceTransactionInput,
  CreateObligationInput,
  CreateReceivedLoanInput,
  FinanceAttachmentRegistrationInput,
  FinanceDashboard,
  FinanceMutationResult,
  FinanceSupportData,
  FinanceTransactionList,
  ImportBankStatementInput,
  PayLoanInstallmentInput,
  PayObligationInput,
  UpdateFinanceCategoryInput,
} from '@yukimi/shared';

export interface FinanceRepository {
  getSupportData(): Promise<FinanceSupportData>;
  getDashboard(): Promise<FinanceDashboard>;
  listTransactions(query: {
    search?: string | undefined;
    type?: string | undefined;
    page: number;
    pageSize: number;
  }): Promise<FinanceTransactionList>;
  createCategory(
    input: CreateFinanceCategoryInput,
  ): Promise<{ id: string; code: string; name: string; reused: boolean }>;
  updateCategory(
    categoryId: string,
    input: UpdateFinanceCategoryInput,
  ): Promise<{
    id: string;
    code: string;
    name: string;
    nature: string;
    description: string | null;
    isActive: boolean;
    version: number;
  }>;
  createManualTransaction(
    input: CreateManualFinanceTransactionInput,
    idempotencyKey: string,
  ): Promise<FinanceMutationResult>;
  createTransfer(
    input: CreateFinanceTransferInput,
    idempotencyKey: string,
  ): Promise<FinanceMutationResult>;
  reverseTransaction(
    transactionId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<FinanceMutationResult>;
  registerAttachment(
    transactionId: string,
    input: FinanceAttachmentRegistrationInput,
  ): Promise<{ id: string }>;
  createObligation(
    input: CreateObligationInput,
    idempotencyKey: string,
  ): Promise<FinanceMutationResult>;
  payObligation(
    obligationId: string,
    input: PayObligationInput,
    idempotencyKey: string,
  ): Promise<FinanceMutationResult>;
  createReceivedLoan(
    input: CreateReceivedLoanInput,
    idempotencyKey: string,
  ): Promise<FinanceMutationResult>;
  payLoanInstallment(
    installmentId: string,
    input: PayLoanInstallmentInput,
    idempotencyKey: string,
  ): Promise<FinanceMutationResult>;
  createCashClosure(
    input: CreateCashClosureInput,
    idempotencyKey: string,
  ): Promise<CashClosureResult>;
  importBankStatement(
    input: ImportBankStatementInput,
    idempotencyKey: string,
  ): Promise<BankImportResult>;
  getBankReconciliation(
    accountId?: string | undefined,
    batchId?: string | undefined,
  ): Promise<BankReconciliationData>;
  confirmBankReconciliation(
    rowId: string,
    input: ConfirmBankReconciliationInput,
  ): Promise<FinanceMutationResult>;
  dismissBankCandidate(candidateId: string, reason: string): Promise<FinanceMutationResult>;
  ignoreBankRow(rowId: string, reason: string): Promise<FinanceMutationResult>;
  reverseBankReconciliation(
    reconciliationId: string,
    reason: string,
  ): Promise<FinanceMutationResult>;
}
