import { z } from 'zod';

export const financeAccountSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  accountTypeCode: z.string(),
  currencyCode: z.string().length(3),
  institutionName: z.string().nullable().optional(),
  currentBalance: z.number(),
  balanceAsOf: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type FinanceAccount = z.infer<typeof financeAccountSchema>;

export const financeCategorySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  nature: z.enum(['INCOME', 'EXPENSE', 'BOTH', 'TRANSFER', 'LOAN', 'ADJUSTMENT']),
  description: z.string().nullable().optional(),
});
export type FinanceCategory = z.infer<typeof financeCategorySchema>;

export const financeSupportDataSchema = z.object({
  accounts: z.array(financeAccountSchema),
  categories: z.array(financeCategorySchema),
  currencies: z.array(z.object({ code: z.string().length(3), name: z.string() })),
  obligationTypes: z.array(z.object({ code: z.string(), name: z.string() })),
});
export type FinanceSupportData = z.infer<typeof financeSupportDataSchema>;

export const financeTransactionSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  transactionTypeCode: z.string(),
  stateCode: z.string(),
  description: z.string(),
  categoryName: z.string().nullable(),
  occurredAt: z.string(),
  currencyCode: z.string().length(3),
  totalAmount: z.number().nonnegative(),
  sourceType: z.string().nullable(),
  isSystemGenerated: z.boolean(),
  createdByName: z.string().nullable(),
  accountNames: z.string(),
  reason: z.string().nullable().optional(),
  version: z.number().int().positive().optional(),
});
export type FinanceTransaction = z.infer<typeof financeTransactionSchema>;

export const financeObligationSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  obligationType: z.string(),
  title: z.string(),
  amount: z.number().nullable(),
  currencyCode: z.string().length(3).nullable(),
  dueDate: z.string(),
  daysRemaining: z.number().int(),
  status: z.string(),
  version: z.number().int().positive(),
});
export type FinanceObligation = z.infer<typeof financeObligationSchema>;

export const financeLoanSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  lenderName: z.string(),
  principalAmount: z.number().nonnegative(),
  outstandingPrincipal: z.number().nonnegative(),
  currencyCode: z.string().length(3),
  status: z.string(),
  nextDueDate: z.string().nullable(),
  nextInstallmentId: z.string().uuid().nullable(),
  nextInstallmentAmount: z.number().nonnegative().nullable(),
});
export type FinanceLoanSummary = z.infer<typeof financeLoanSummarySchema>;

export const financeDashboardSchema = z.object({
  accounts: z.array(financeAccountSchema),
  monthIncome: z.number().nonnegative(),
  monthExpense: z.number().nonnegative(),
  monthlySummary: z.array(z.object({
    month: z.string(),
    label: z.string(),
    income: z.number().nonnegative(),
    expense: z.number().nonnegative(),
  })),
  obligations: z.array(financeObligationSchema),
  loans: z.array(financeLoanSummarySchema),
  recentTransactions: z.array(financeTransactionSchema),
});
export type FinanceDashboard = z.infer<typeof financeDashboardSchema>;

export const financeTransactionListSchema = z.object({
  items: z.array(financeTransactionSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type FinanceTransactionList = z.infer<typeof financeTransactionListSchema>;

export const createFinanceCategorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  nature: z.enum(['INCOME', 'EXPENSE', 'BOTH']),
  description: z.string().trim().max(500).nullable().optional(),
});
export type CreateFinanceCategoryInput = z.infer<typeof createFinanceCategorySchema>;

export const createManualFinanceTransactionSchema = z.object({
  transactionTypeCode: z.enum(['INCOME', 'EXPENSE']),
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  amount: z.number().positive().max(999999999.99),
  occurredAt: z.string().datetime(),
  description: z.string().trim().min(3).max(300),
  reference: z.string().trim().max(150).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});
export type CreateManualFinanceTransactionInput = z.infer<typeof createManualFinanceTransactionSchema>;

export const createFinanceTransferSchema = z.object({
  sourceAccountId: z.string().uuid(),
  destinationAccountId: z.string().uuid(),
  amount: z.number().positive().max(999999999.99),
  occurredAt: z.string().datetime(),
  description: z.string().trim().max(300).nullable().optional(),
  reference: z.string().trim().max(150).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.sourceAccountId === value.destinationAccountId) {
    context.addIssue({ code: 'custom', path: ['destinationAccountId'], message: 'Selecciona una cuenta de destino diferente.' });
  }
});
export type CreateFinanceTransferInput = z.infer<typeof createFinanceTransferSchema>;

export const createObligationSchema = z.object({
  obligationType: z.enum(['CREDIT_CARD', 'SUNAT', 'CUSTOMS', 'SERVICE', 'OTHER']),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(1000).nullable().optional(),
  amount: z.number().positive().max(999999999.99),
  currencyCode: z.string().length(3),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  alertDaysBefore: z.number().int().min(0).max(90).default(3),
  recurrenceRule: z.string().trim().max(300).nullable().optional(),
});
export type CreateObligationInput = z.infer<typeof createObligationSchema>;

export const payObligationSchema = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.number().positive().max(999999999.99),
  occurredAt: z.string().datetime(),
  reference: z.string().trim().max(150).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type PayObligationInput = z.infer<typeof payObligationSchema>;

export const createReceivedLoanSchema = z.object({
  lenderName: z.string().trim().min(2).max(180),
  principalAmount: z.number().positive().max(999999999.99),
  accountId: z.string().uuid(),
  interestRate: z.number().min(0).max(1000).default(0),
  installmentCount: z.number().int().min(1).max(120),
  receivedAt: z.string().datetime(),
  firstDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateReceivedLoanInput = z.infer<typeof createReceivedLoanSchema>;

export const payLoanInstallmentSchema = z.object({
  accountId: z.string().uuid(),
  amount: z.number().positive().max(999999999.99),
  occurredAt: z.string().datetime(),
  reference: z.string().trim().max(150).nullable().optional(),
});
export type PayLoanInstallmentInput = z.infer<typeof payLoanInstallmentSchema>;

export const createCashClosureSchema = z.object({
  accountId: z.string().uuid(),
  closureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  countedAmount: z.number().min(0).max(999999999.99),
  notes: z.string().trim().max(1000).nullable().optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
});
export type CreateCashClosureInput = z.infer<typeof createCashClosureSchema>;

export const financeActionReasonSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});

export const financeAttachmentRegistrationSchema = z.object({
  bucketId: z.literal('financial-files'),
  objectPath: z.string().trim().min(1).max(500),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  sizeBytes: z.number().int().nonnegative().max(10 * 1024 * 1024),
});
export type FinanceAttachmentRegistrationInput = z.infer<typeof financeAttachmentRegistrationSchema>;

export const financeMutationResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string().optional(),
  stateCode: z.string(),
  version: z.number().int().positive(),
});
export type FinanceMutationResult = z.infer<typeof financeMutationResultSchema>;

export const cashClosureResultSchema = financeMutationResultSchema.extend({
  expectedAmount: z.number(),
  countedAmount: z.number(),
  differenceAmount: z.number(),
});
export type CashClosureResult = z.infer<typeof cashClosureResultSchema>;

export const bankStatementRowInputSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  postedAt: z.string().datetime().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(180).nullable().optional(),
  amountSigned: z.number().refine((value) => value !== 0, 'El importe no puede ser cero.'),
  currencyCode: z.string().length(3).nullable().optional(),
  balanceAfter: z.number().nullable().optional(),
});
export type BankStatementRowInput = z.infer<typeof bankStatementRowInputSchema>;

export const importBankStatementSchema = z.object({
  accountId: z.string().uuid(),
  originalFilename: z.string().trim().min(1).max(255),
  fileChecksum: z.string().trim().min(16).max(128),
  rows: z.array(bankStatementRowInputSchema).min(1).max(5000),
});
export type ImportBankStatementInput = z.infer<typeof importBankStatementSchema>;

export const bankImportResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  stateCode: z.string(),
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
  reused: z.boolean(),
});
export type BankImportResult = z.infer<typeof bankImportResultSchema>;

export const bankCandidateSchema = z.object({
  id: z.string().uuid(),
  candidateType: z.enum(['PAYMENT', 'FINANCIAL_TRANSACTION']),
  candidateId: z.string().uuid(),
  confidenceScore: z.number().min(0).max(1),
  label: z.string(),
  reason: z.record(z.string(), z.unknown()),
});

export const bankReconciliationRowSchema = z.object({
  id: z.string().uuid(),
  rowNumber: z.number().int().positive(),
  transactionDate: z.string(),
  description: z.string(),
  reference: z.string().nullable(),
  amountSigned: z.number(),
  currencyCode: z.string().length(3),
  balanceAfter: z.number().nullable(),
  reconciliationStatus: z.enum(['UNMATCHED', 'SUGGESTED', 'RECONCILED', 'IGNORED']),
  candidates: z.array(bankCandidateSchema),
  activeReconciliation: z.object({
    id: z.string().uuid(),
    matchedType: z.string(),
    matchedId: z.string().uuid(),
    matchedAmount: z.number().positive(),
    notes: z.string().nullable(),
    reconciledAt: z.string(),
  }).nullable(),
});

export const bankReconciliationDataSchema = z.object({
  accounts: z.array(z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    currencyCode: z.string().length(3),
    currentBalance: z.number(),
  })),
  selectedAccountId: z.string().uuid().nullable(),
  selectedBatchId: z.string().uuid().nullable(),
  batches: z.array(z.object({
    id: z.string().uuid(),
    code: z.string(),
    originalFilename: z.string(),
    importedFrom: z.string().nullable(),
    importedTo: z.string().nullable(),
    totalRows: z.number().int().nonnegative(),
    validRows: z.number().int().nonnegative(),
    invalidRows: z.number().int().nonnegative(),
    status: z.string(),
    importedAt: z.string(),
  })),
  summary: z.object({
    total: z.number().int().nonnegative(),
    suggested: z.number().int().nonnegative(),
    reconciled: z.number().int().nonnegative(),
    unmatched: z.number().int().nonnegative(),
    ignored: z.number().int().nonnegative(),
  }),
  rows: z.array(bankReconciliationRowSchema),
});
export type BankReconciliationData = z.infer<typeof bankReconciliationDataSchema>;

export const confirmBankReconciliationSchema = z.object({
  candidateType: z.enum(['PAYMENT', 'FINANCIAL_TRANSACTION']),
  candidateId: z.string().uuid(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type ConfirmBankReconciliationInput = z.infer<typeof confirmBankReconciliationSchema>;
