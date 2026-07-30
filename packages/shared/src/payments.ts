import { z } from 'zod';

export const paymentPartInputSchema = z.object({
  paymentMethodCode: z.string().trim().min(1).max(50),
  financialAccountId: z.string().uuid(),
  amount: z.number().positive().max(999999999.99),
  referenceNumber: z.string().trim().max(150).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type PaymentPartInput = z.infer<typeof paymentPartInputSchema>;

export const createPaymentSchema = z
  .object({
    receivedAt: z.string().datetime(),
    notes: z.string().trim().max(1000).nullable().optional(),
    parts: z.array(paymentPartInputSchema).min(1).max(10),
  })
  .superRefine((value, context) => {
    const total = value.parts.reduce((sum, part) => sum + part.amount, 0);
    if (total <= 0) {
      context.addIssue({
        code: 'custom',
        path: ['parts'],
        message: 'El pago debe tener un importe mayor que cero.',
      });
    }
  });
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const paymentAttachmentRegistrationSchema = z.object({
  bucketId: z.literal('payment-proofs'),
  objectPath: z.string().trim().min(1).max(500),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  sizeBytes: z
    .number()
    .int()
    .nonnegative()
    .max(10 * 1024 * 1024),
});
export type PaymentAttachmentRegistrationInput = z.infer<
  typeof paymentAttachmentRegistrationSchema
>;

export const receiptAttachmentRegistrationSchema = z.object({
  bucketId: z.literal('receipt-files'),
  objectPath: z.string().trim().min(1).max(500),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  sizeBytes: z
    .number()
    .int()
    .nonnegative()
    .max(10 * 1024 * 1024),
});
export type ReceiptAttachmentRegistrationInput = z.infer<
  typeof receiptAttachmentRegistrationSchema
>;

export const paymentActionReasonSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type PaymentActionReasonInput = z.infer<typeof paymentActionReasonSchema>;

export const createReceiptSchema = z
  .object({
    receiptType: z.enum(['BOLETA', 'CLIENTES_VARIOS', 'OTHER']).default('BOLETA'),
    series: z.string().trim().min(1).max(20),
    receiptNumber: z.string().trim().min(1).max(30),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().trim().max(1000).nullable().optional(),
    allocations: z
      .array(
        z.object({
          paymentId: z.string().uuid(),
          amount: z.number().positive().max(999999999.99),
        }),
      )
      .min(1)
      .max(20),
  })
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.allocations.forEach((allocation, index) => {
      if (ids.has(allocation.paymentId)) {
        context.addIssue({
          code: 'custom',
          path: ['allocations', index],
          message: 'Un pago no puede repetirse en la misma boleta.',
        });
      }
      ids.add(allocation.paymentId);
    });
  });
export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;

export const createCreditNoteSchema = z.object({
  series: z.string().trim().min(1).max(20),
  noteNumber: z.string().trim().min(1).max(30),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive().max(999999999.99),
  reason: z.string().trim().min(5).max(1000),
});
export type CreateCreditNoteInput = z.infer<typeof createCreditNoteSchema>;

export const paymentSupportDataSchema = z.object({
  paymentMethods: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      requiresProof: z.boolean(),
    }),
  ),
  financialAccounts: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      accountTypeCode: z.string(),
      currencyCode: z.string().length(3),
    }),
  ),
  latePenalty: z.object({
    enabled: z.boolean(),
    amountPerDay: z.number().nonnegative(),
    currencyCode: z.string().length(3),
  }),
});
export type PaymentSupportData = z.infer<typeof paymentSupportDataSchema>;

export const paymentFileSchema = z.object({
  id: z.string().uuid(),
  bucketId: z.string(),
  objectPath: z.string(),
  originalFilename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  signedUrl: z.string().url().nullable(),
  createdAt: z.string(),
});
export type PaymentFile = z.infer<typeof paymentFileSchema>;

export const paymentPartDetailSchema = z.object({
  id: z.string().uuid(),
  paymentMethodCode: z.string(),
  paymentMethodName: z.string(),
  requiresProof: z.boolean(),
  financialAccountId: z.string().uuid(),
  financialAccountName: z.string(),
  amount: z.number().positive(),
  referenceNumber: z.string().nullable(),
  notes: z.string().nullable(),
});

export const paymentDetailSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  stateCode: z.string(),
  declaredAmount: z.number().nonnegative(),
  currencyCode: z.string().length(3),
  receivedAt: z.string(),
  confirmedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  reversedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  reversalReason: z.string().nullable(),
  notes: z.string().nullable(),
  createdByName: z.string().nullable(),
  confirmedByName: z.string().nullable(),
  parts: z.array(paymentPartDetailSchema),
  proofs: z.array(paymentFileSchema),
  receiptAllocatedAmount: z.number().nonnegative(),
  unreceiptedAmount: z.number().nonnegative(),
  createdAt: z.string(),
  version: z.number().int().positive(),
});
export type PaymentDetail = z.infer<typeof paymentDetailSchema>;

export const creditNoteDetailSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  fullNumber: z.string().nullable(),
  issueDate: z.string(),
  amount: z.number().nonnegative(),
  reason: z.string(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});

export const receiptDetailSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  stateCode: z.string(),
  receiptType: z.string(),
  series: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  fullNumber: z.string().nullable(),
  issueDate: z.string().nullable(),
  amount: z.number().nonnegative(),
  notes: z.string().nullable(),
  annulledAt: z.string().nullable(),
  annulmentReason: z.string().nullable(),
  createdByName: z.string().nullable(),
  allocations: z.array(
    z.object({
      paymentId: z.string().uuid(),
      paymentCode: z.string(),
      allocatedAmount: z.number().positive(),
    }),
  ),
  files: z.array(paymentFileSchema),
  creditNotes: z.array(creditNoteDetailSchema),
  createdAt: z.string(),
  version: z.number().int().positive(),
});
export type ReceiptDetail = z.infer<typeof receiptDetailSchema>;

export const penaltyDetailSchema = z.object({
  id: z.string().uuid(),
  penaltyType: z.string(),
  amount: z.number().nonnegative(),
  unitAmount: z.number().nonnegative().nullable(),
  daysLate: z.number().int().nonnegative().nullable(),
  reason: z.string(),
  status: z.string(),
  calculatedFrom: z.string().nullable(),
  calculatedTo: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  version: z.number().int().positive(),
});
export type PenaltyDetail = z.infer<typeof penaltyDetailSchema>;

export const saleFinancialDetailSchema = z.object({
  saleId: z.string().uuid(),
  saleCode: z.string(),
  currencyCode: z.string().length(3),
  totalAmount: z.number().nonnegative(),
  paidTotal: z.number().nonnegative(),
  balanceAmount: z.number(),
  paymentStateCode: z.string(),
  dueAt: z.string().nullable(),
  payments: z.array(paymentDetailSchema),
  receipts: z.array(receiptDetailSchema),
  penalties: z.array(penaltyDetailSchema),
});
export type SaleFinancialDetail = z.infer<typeof saleFinancialDetailSchema>;

export const paymentMutationResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  stateCode: z.string(),
  version: z.number().int().positive(),
});
export type PaymentMutationResult = z.infer<typeof paymentMutationResultSchema>;

export const genericMutationResultSchema = z.object({
  id: z.string().uuid(),
  stateCode: z.string(),
  version: z.number().int().positive(),
});
export type GenericMutationResult = z.infer<typeof genericMutationResultSchema>;
