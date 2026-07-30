import type {
  CreateCreditNoteInput,
  CreatePaymentInput,
  CreateReceiptInput,
  PaymentAttachmentRegistrationInput,
  ReceiptAttachmentRegistrationInput,
} from '@yukimi/shared';
import type { PaymentsRepository } from './payments.repository.js';

export class PaymentsService {
  public constructor(private readonly repository: PaymentsRepository) {}

  public getSupportData() {
    return this.repository.getSupportData();
  }
  public getSaleFinancials(saleId: string) {
    return this.repository.getSaleFinancials(saleId);
  }
  public createPayment(saleId: string, input: CreatePaymentInput, idempotencyKey: string) {
    return this.repository.createPayment(saleId, input, idempotencyKey);
  }
  public registerPaymentAttachment(paymentId: string, input: PaymentAttachmentRegistrationInput) {
    return this.repository.registerPaymentAttachment(paymentId, input);
  }
  public confirmPayment(paymentId: string, idempotencyKey: string) {
    return this.repository.confirmPayment(paymentId, idempotencyKey);
  }
  public rejectPayment(paymentId: string, reason: string) {
    return this.repository.rejectPayment(paymentId, reason);
  }
  public reversePayment(paymentId: string, reason: string, idempotencyKey: string) {
    return this.repository.reversePayment(paymentId, reason, idempotencyKey);
  }
  public createReceipt(saleId: string, input: CreateReceiptInput, idempotencyKey: string) {
    return this.repository.createReceipt(saleId, input, idempotencyKey);
  }
  public registerReceiptAttachment(receiptId: string, input: ReceiptAttachmentRegistrationInput) {
    return this.repository.registerReceiptAttachment(receiptId, input);
  }
  public annulReceipt(receiptId: string, reason: string) {
    return this.repository.annulReceipt(receiptId, reason);
  }
  public createCreditNote(receiptId: string, input: CreateCreditNoteInput) {
    return this.repository.createCreditNote(receiptId, input);
  }
  public calculateLatePenalty(saleId: string) {
    return this.repository.calculateLatePenalty(saleId);
  }
  public waivePenalty(penaltyId: string, reason: string) {
    return this.repository.waivePenalty(penaltyId, reason);
  }
}
