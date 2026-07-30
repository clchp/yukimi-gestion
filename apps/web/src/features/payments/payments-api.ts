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
import { apiRequest } from '../../app/api-client';

export function getPaymentSupportData(): Promise<PaymentSupportData> {
  return apiRequest<PaymentSupportData>('/payments/support-data');
}

export function getSaleFinancials(saleId: string): Promise<SaleFinancialDetail> {
  return apiRequest<SaleFinancialDetail>(`/payments/sales/${saleId}`);
}

export function createPayment(
  saleId: string,
  input: CreatePaymentInput,
  idempotencyKey: string,
): Promise<PaymentMutationResult> {
  return apiRequest<PaymentMutationResult>(`/payments/sales/${saleId}`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function registerPaymentAttachment(
  paymentId: string,
  input: PaymentAttachmentRegistrationInput,
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/payments/${paymentId}/attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function confirmPayment(paymentId: string): Promise<GenericMutationResult> {
  return apiRequest<GenericMutationResult>(`/payments/${paymentId}/confirm`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
  });
}

export function rejectPayment(paymentId: string, reason: string): Promise<GenericMutationResult> {
  return apiRequest<GenericMutationResult>(`/payments/${paymentId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function reversePayment(paymentId: string, reason: string): Promise<GenericMutationResult> {
  return apiRequest<GenericMutationResult>(`/payments/${paymentId}/reverse`, {
    method: 'POST',
    headers: { 'idempotency-key': crypto.randomUUID() },
    body: JSON.stringify({ reason }),
  });
}

export function createReceipt(
  saleId: string,
  input: CreateReceiptInput,
  idempotencyKey: string,
): Promise<GenericMutationResult> {
  return apiRequest<GenericMutationResult>(`/payments/sales/${saleId}/receipts`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function registerReceiptAttachment(
  receiptId: string,
  input: ReceiptAttachmentRegistrationInput,
): Promise<{ id: string }> {
  return apiRequest<{ id: string }>(`/payments/receipts/${receiptId}/attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function annulReceipt(receiptId: string, reason: string): Promise<GenericMutationResult> {
  return apiRequest<GenericMutationResult>(`/payments/receipts/${receiptId}/annul`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function createCreditNote(
  receiptId: string,
  input: CreateCreditNoteInput,
): Promise<GenericMutationResult> {
  return apiRequest<GenericMutationResult>(`/payments/receipts/${receiptId}/credit-notes`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function calculateLatePenalty(saleId: string): Promise<GenericMutationResult> {
  return apiRequest<GenericMutationResult>(`/payments/sales/${saleId}/late-penalty`, {
    method: 'POST',
  });
}

export function waivePenalty(penaltyId: string, reason: string): Promise<GenericMutationResult> {
  return apiRequest<GenericMutationResult>(`/payments/penalties/${penaltyId}/waive`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
