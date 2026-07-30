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
  FinanceDashboard,
  FinanceMutationResult,
  FinanceSupportData,
  FinanceTransactionList,
  ImportBankStatementInput,
  PayLoanInstallmentInput,
  PayObligationInput,
} from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export function getFinanceSupport(): Promise<FinanceSupportData> {
  return apiRequest<FinanceSupportData>('/finance/support-data');
}
export function getFinanceDashboard(): Promise<FinanceDashboard> {
  return apiRequest<FinanceDashboard>('/finance/dashboard');
}
export function getFinanceTransactions(filters: { search?: string | undefined; type?: string | undefined; page?: number | undefined; pageSize?: number | undefined }): Promise<FinanceTransactionList> {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.type) params.set('type', filters.type);
  params.set('page', String(filters.page ?? 1));
  params.set('pageSize', String(filters.pageSize ?? 20));
  return apiRequest<FinanceTransactionList>(`/finance/transactions?${params.toString()}`);
}
export function createFinanceCategory(input: CreateFinanceCategoryInput): Promise<{ id: string; code: string; name: string; reused: boolean }> {
  return apiRequest<{ id: string; code: string; name: string; reused: boolean }>('/finance/categories', { method: 'POST', body: JSON.stringify(input) });
}
export function createManualFinanceTransaction(input: CreateManualFinanceTransactionInput, key: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>('/finance/transactions', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(input) });
}
export function createFinanceTransfer(input: CreateFinanceTransferInput, key: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>('/finance/transfers', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(input) });
}
export function reverseFinanceTransaction(id: string, reason: string, key: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>(`/finance/transactions/${id}/reverse`, { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify({ reason }) });
}
export function createObligation(input: CreateObligationInput, key: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>('/finance/obligations', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(input) });
}
export function payObligation(id: string, input: PayObligationInput, key: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>(`/finance/obligations/${id}/pay`, { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(input) });
}
export function createReceivedLoan(input: CreateReceivedLoanInput, key: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>('/finance/loans', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(input) });
}
export function payLoanInstallment(id: string, input: PayLoanInstallmentInput, key: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>(`/finance/loan-installments/${id}/pay`, { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(input) });
}
export function createCashClosure(input: CreateCashClosureInput, key: string): Promise<CashClosureResult> {
  return apiRequest<CashClosureResult>('/finance/cash-closures', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(input) });
}
export function getBankReconciliation(filters: { accountId?: string | undefined; batchId?: string | undefined }): Promise<BankReconciliationData> {
  const params = new URLSearchParams();
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.batchId) params.set('batchId', filters.batchId);
  return apiRequest<BankReconciliationData>(`/finance/bank-reconciliation?${params.toString()}`);
}
export function importBankStatement(input: ImportBankStatementInput, key: string): Promise<BankImportResult> {
  return apiRequest<BankImportResult>('/finance/bank-statements/import', { method: 'POST', headers: { 'idempotency-key': key }, body: JSON.stringify(input) });
}
export function confirmBankReconciliation(rowId: string, input: ConfirmBankReconciliationInput): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>(`/finance/bank-rows/${rowId}/reconcile`, { method: 'POST', body: JSON.stringify(input) });
}
export function dismissBankCandidate(candidateId: string, reason: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>(`/finance/bank-candidates/${candidateId}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) });
}
export function ignoreBankRow(rowId: string, reason: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>(`/finance/bank-rows/${rowId}/ignore`, { method: 'POST', body: JSON.stringify({ reason }) });
}
export function reverseBankReconciliation(id: string, reason: string): Promise<FinanceMutationResult> {
  return apiRequest<FinanceMutationResult>(`/finance/bank-reconciliations/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function registerFinanceAttachment(transactionId: string, input: {
  bucketId: 'financial-files';
  objectPath: string;
  originalFilename: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  sizeBytes: number;
}): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/finance/transactions/${transactionId}/attachments`, { method: 'POST', body: JSON.stringify(input) });
}
