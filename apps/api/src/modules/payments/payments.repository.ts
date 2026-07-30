import type {
  CreateCreditNoteInput,
  CreatePaymentInput,
  CreateReceiptInput,
  GenericMutationResult,
  PaymentAttachmentRegistrationInput,
  PaymentMutationResult,
  PaymentSupportData,
  ReceiptAttachmentRegistrationInput,
  SaleFinancialDetail,
} from '@yukimi/shared';

export interface PaymentsRepository {
  getSupportData(): Promise<PaymentSupportData>;
  getSaleFinancials(saleId: string): Promise<SaleFinancialDetail>;
  createPayment(
    saleId: string,
    input: CreatePaymentInput,
    idempotencyKey: string,
  ): Promise<PaymentMutationResult>;
  registerPaymentAttachment(
    paymentId: string,
    input: PaymentAttachmentRegistrationInput,
  ): Promise<{ id: string }>;
  confirmPayment(paymentId: string, idempotencyKey: string): Promise<GenericMutationResult>;
  rejectPayment(paymentId: string, reason: string): Promise<GenericMutationResult>;
  reversePayment(
    paymentId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<GenericMutationResult>;
  createReceipt(
    saleId: string,
    input: CreateReceiptInput,
    idempotencyKey: string,
  ): Promise<GenericMutationResult>;
  registerReceiptAttachment(
    receiptId: string,
    input: ReceiptAttachmentRegistrationInput,
  ): Promise<{ id: string }>;
  annulReceipt(receiptId: string, reason: string): Promise<GenericMutationResult>;
  createCreditNote(receiptId: string, input: CreateCreditNoteInput): Promise<GenericMutationResult>;
  calculateLatePenalty(saleId: string): Promise<GenericMutationResult>;
  waivePenalty(penaltyId: string, reason: string): Promise<GenericMutationResult>;
}
