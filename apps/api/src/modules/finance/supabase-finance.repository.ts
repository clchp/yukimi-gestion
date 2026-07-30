import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bankImportResultSchema,
  bankReconciliationDataSchema,
  cashClosureResultSchema,
  financeDashboardSchema,
  financeMutationResultSchema,
  financeSupportDataSchema,
  financeTransactionListSchema,
  type BankImportResult,
  type BankReconciliationData,
  type CashClosureResult,
  type ConfirmBankReconciliationInput,
  type CreateCashClosureInput,
  type CreateFinanceCategoryInput,
  type CreateFinanceTransferInput,
  type CreateManualFinanceTransactionInput,
  type CreateObligationInput,
  type CreateReceivedLoanInput,
  type FinanceAttachmentRegistrationInput,
  type FinanceDashboard,
  type FinanceMutationResult,
  type FinanceSupportData,
  type FinanceTransactionList,
  type ImportBankStatementInput,
  type PayLoanInstallmentInput,
  type PayObligationInput,
} from '@yukimi/shared';
import { z } from 'zod';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { FinanceRepository } from './finance.repository.js';

const categoryResultSchema = z.object({ id: z.string().uuid(), code: z.string(), name: z.string(), reused: z.boolean() });
const attachmentResultSchema = z.object({ id: z.string().uuid() });

export class SupabaseFinanceRepository implements FinanceRepository {
  public constructor(private readonly client: SupabaseClient) {}

  public async getSupportData(): Promise<FinanceSupportData> {
    const { data, error } = await this.client.rpc('get_finance_support_v1');
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar las opciones financieras.');
    return financeSupportDataSchema.parse(data);
  }

  public async getDashboard(): Promise<FinanceDashboard> {
    const { data, error } = await this.client.rpc('get_finance_dashboard_v1');
    if (error) throw mapSupabaseError(error, 'No se pudo cargar el resumen financiero.');
    return financeDashboardSchema.parse(data);
  }

  public async listTransactions(query: { search?: string | undefined; type?: string | undefined; page: number; pageSize: number }): Promise<FinanceTransactionList> {
    const { data, error } = await this.client.rpc('list_financial_transactions_v1', {
      p_search: query.search ?? null,
      p_type: query.type ?? 'ALL',
      p_page: query.page,
      p_page_size: query.pageSize,
    });
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar los movimientos financieros.');
    return financeTransactionListSchema.parse(data);
  }

  public async createCategory(input: CreateFinanceCategoryInput) {
    const { data, error } = await this.client.rpc('create_financial_category_v1', { p_input: input });
    if (error) throw mapSupabaseError(error, 'No se pudo crear la categoría.');
    return categoryResultSchema.parse(data);
  }

  public async createManualTransaction(input: CreateManualFinanceTransactionInput, idempotencyKey: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('create_manual_financial_transaction_v1', { p_input: input, p_idempotency_key: idempotencyKey });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el movimiento financiero.');
    return financeMutationResultSchema.parse(data);
  }

  public async createTransfer(input: CreateFinanceTransferInput, idempotencyKey: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('create_financial_transfer_v1', { p_input: input, p_idempotency_key: idempotencyKey });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar la transferencia.');
    return financeMutationResultSchema.parse(data);
  }

  public async reverseTransaction(transactionId: string, reason: string, idempotencyKey: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('reverse_financial_transaction_v1', { p_transaction_id: transactionId, p_reason: reason, p_idempotency_key: idempotencyKey });
    if (error) throw mapSupabaseError(error, 'No se pudo revertir el movimiento.');
    return financeMutationResultSchema.parse(data);
  }

  public async registerAttachment(transactionId: string, input: FinanceAttachmentRegistrationInput): Promise<{ id: string }> {
    const { data, error } = await this.client.rpc('register_financial_attachment_v1', { p_transaction_id: transactionId, p_input: input });
    if (error) throw mapSupabaseError(error, 'El archivo se subió, pero no se pudo asociar al movimiento.');
    return attachmentResultSchema.parse(data);
  }

  public async createObligation(input: CreateObligationInput, idempotencyKey: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('create_obligation_v1', { p_input: input, p_idempotency_key: idempotencyKey });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar la obligación.');
    return financeMutationResultSchema.parse(data);
  }

  public async payObligation(obligationId: string, input: PayObligationInput, idempotencyKey: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('pay_obligation_v1', { p_obligation_id: obligationId, p_input: input, p_idempotency_key: idempotencyKey });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el pago de la obligación.');
    return financeMutationResultSchema.parse(data);
  }

  public async createReceivedLoan(input: CreateReceivedLoanInput, idempotencyKey: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('create_received_loan_v1', { p_input: input, p_idempotency_key: idempotencyKey });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el préstamo.');
    return financeMutationResultSchema.parse(data);
  }

  public async payLoanInstallment(installmentId: string, input: PayLoanInstallmentInput, idempotencyKey: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('pay_loan_installment_v1', { p_installment_id: installmentId, p_input: input, p_idempotency_key: idempotencyKey });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el pago de la cuota.');
    return financeMutationResultSchema.parse(data);
  }

  public async createCashClosure(input: CreateCashClosureInput, idempotencyKey: string): Promise<CashClosureResult> {
    const { data, error } = await this.client.rpc('create_cash_closure_v1', { p_input: input, p_idempotency_key: idempotencyKey });
    if (error) throw mapSupabaseError(error, 'No se pudo cerrar la caja.');
    return cashClosureResultSchema.parse(data);
  }

  public async importBankStatement(input: ImportBankStatementInput, idempotencyKey: string): Promise<BankImportResult> {
    const { data, error } = await this.client.rpc('import_bank_statement_v1', {
      p_account_id: input.accountId,
      p_original_filename: input.originalFilename,
      p_file_checksum: input.fileChecksum,
      p_rows: input.rows,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo importar el extracto bancario.');
    return bankImportResultSchema.parse(data);
  }

  public async getBankReconciliation(accountId?: string | undefined, batchId?: string | undefined): Promise<BankReconciliationData> {
    const { data, error } = await this.client.rpc('get_bank_reconciliation_v1', { p_account_id: accountId ?? null, p_batch_id: batchId ?? null });
    if (error) throw mapSupabaseError(error, 'No se pudo cargar la conciliación bancaria.');
    return bankReconciliationDataSchema.parse(data);
  }

  public async confirmBankReconciliation(rowId: string, input: ConfirmBankReconciliationInput): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('confirm_bank_reconciliation_v1', {
      p_row_id: rowId,
      p_candidate_type: input.candidateType,
      p_candidate_id: input.candidateId,
      p_notes: input.notes ?? null,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo confirmar la conciliación.');
    return financeMutationResultSchema.parse(data);
  }

  public async dismissBankCandidate(candidateId: string, reason: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('dismiss_bank_candidate_v1', { p_candidate_id: candidateId, p_reason: reason });
    if (error) throw mapSupabaseError(error, 'No se pudo descartar la coincidencia.');
    return financeMutationResultSchema.parse(data);
  }

  public async ignoreBankRow(rowId: string, reason: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('ignore_bank_row_v1', { p_row_id: rowId, p_reason: reason });
    if (error) throw mapSupabaseError(error, 'No se pudo ignorar el movimiento bancario.');
    return financeMutationResultSchema.parse(data);
  }

  public async reverseBankReconciliation(reconciliationId: string, reason: string): Promise<FinanceMutationResult> {
    const { data, error } = await this.client.rpc('reverse_bank_reconciliation_v1', { p_reconciliation_id: reconciliationId, p_reason: reason });
    if (error) throw mapSupabaseError(error, 'No se pudo revertir la conciliación.');
    return financeMutationResultSchema.parse(data);
  }
}
