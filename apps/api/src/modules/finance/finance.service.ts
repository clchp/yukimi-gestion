import type {
  ConfirmBankReconciliationInput,
  CreateCashClosureInput,
  CreateFinanceCategoryInput,
  CreateFinanceTransferInput,
  CreateManualFinanceTransactionInput,
  CreateObligationInput,
  CreateReceivedLoanInput,
  FinanceAttachmentRegistrationInput,
  ImportBankStatementInput,
  PayLoanInstallmentInput,
  PayObligationInput,
} from '@yukimi/shared';
import type { FinanceRepository } from './finance.repository.js';

export class FinanceService {
  public constructor(private readonly repository: FinanceRepository) {}
  public getSupportData() { return this.repository.getSupportData(); }
  public getDashboard() { return this.repository.getDashboard(); }
  public listTransactions(query: { search?: string | undefined; type?: string | undefined; page: number; pageSize: number }) { return this.repository.listTransactions(query); }
  public createCategory(input: CreateFinanceCategoryInput) { return this.repository.createCategory(input); }
  public createManualTransaction(input: CreateManualFinanceTransactionInput, key: string) { return this.repository.createManualTransaction(input, key); }
  public createTransfer(input: CreateFinanceTransferInput, key: string) { return this.repository.createTransfer(input, key); }
  public reverseTransaction(id: string, reason: string, key: string) { return this.repository.reverseTransaction(id, reason, key); }
  public registerAttachment(id: string, input: FinanceAttachmentRegistrationInput) { return this.repository.registerAttachment(id, input); }
  public createObligation(input: CreateObligationInput, key: string) { return this.repository.createObligation(input, key); }
  public payObligation(id: string, input: PayObligationInput, key: string) { return this.repository.payObligation(id, input, key); }
  public createReceivedLoan(input: CreateReceivedLoanInput, key: string) { return this.repository.createReceivedLoan(input, key); }
  public payLoanInstallment(id: string, input: PayLoanInstallmentInput, key: string) { return this.repository.payLoanInstallment(id, input, key); }
  public createCashClosure(input: CreateCashClosureInput, key: string) { return this.repository.createCashClosure(input, key); }
  public importBankStatement(input: ImportBankStatementInput, key: string) { return this.repository.importBankStatement(input, key); }
  public getBankReconciliation(accountId?: string | undefined, batchId?: string | undefined) { return this.repository.getBankReconciliation(accountId, batchId); }
  public confirmBankReconciliation(rowId: string, input: ConfirmBankReconciliationInput) { return this.repository.confirmBankReconciliation(rowId, input); }
  public dismissBankCandidate(id: string, reason: string) { return this.repository.dismissBankCandidate(id, reason); }
  public ignoreBankRow(id: string, reason: string) { return this.repository.ignoreBankRow(id, reason); }
  public reverseBankReconciliation(id: string, reason: string) { return this.repository.reverseBankReconciliation(id, reason); }
}
