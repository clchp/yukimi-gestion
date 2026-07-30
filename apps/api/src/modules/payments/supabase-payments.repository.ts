import type { SupabaseClient } from '@supabase/supabase-js';
import {
  genericMutationResultSchema,
  paymentMutationResultSchema,
  paymentSupportDataSchema,
  saleFinancialDetailSchema,
  type CreateCreditNoteInput,
  type CreatePaymentInput,
  type CreateReceiptInput,
  type GenericMutationResult,
  type PaymentAttachmentRegistrationInput,
  type PaymentMutationResult,
  type PaymentSupportData,
  type ReceiptAttachmentRegistrationInput,
  type SaleFinancialDetail,
} from '@yukimi/shared';
import { AppError } from '../../shared/errors/app-error.js';
import { mapSupabaseError } from '../../shared/supabase/map-error.js';
import type { PaymentsRepository } from './payments.repository.js';

export class SupabasePaymentsRepository implements PaymentsRepository {
  public constructor(
    private readonly client: SupabaseClient,
    private readonly actorId: string,
  ) {}

  public async getSupportData(): Promise<PaymentSupportData> {
    const { data, error } = await this.client.rpc('get_payment_support_v1');
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar los medios de pago.');
    return paymentSupportDataSchema.parse(data);
  }

  public async getSaleFinancials(saleId: string): Promise<SaleFinancialDetail> {
    const { data, error } = await this.client.rpc('get_sale_financial_detail_v1', {
      p_sale_id: saleId,
    });
    if (error) throw mapSupabaseError(error, 'No se pudieron cargar los pagos y boletas.');
    const parsed = saleFinancialDetailSchema.parse(data);

    const sign = async (bucketId: string, objectPath: string): Promise<string | null> => {
      const { data: signed, error: signedError } = await this.client.storage
        .from(bucketId)
        .createSignedUrl(objectPath, 60 * 30);
      if (signedError) return null;
      return signed.signedUrl;
    };

    const payments = await Promise.all(
      parsed.payments.map(async (payment) => ({
        ...payment,
        proofs: await Promise.all(
          payment.proofs.map(async (proof) => ({
            ...proof,
            signedUrl: await sign(proof.bucketId, proof.objectPath),
          })),
        ),
      })),
    );

    const receipts = await Promise.all(
      parsed.receipts.map(async (receipt) => ({
        ...receipt,
        files: await Promise.all(
          receipt.files.map(async (file) => ({
            ...file,
            signedUrl: await sign(file.bucketId, file.objectPath),
          })),
        ),
      })),
    );

    return { ...parsed, payments, receipts };
  }

  public async createPayment(
    saleId: string,
    input: CreatePaymentInput,
    idempotencyKey: string,
  ): Promise<PaymentMutationResult> {
    const { data, error } = await this.client.rpc('create_payment_v1', {
      p_sale_id: saleId,
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar el pago.');
    return paymentMutationResultSchema.parse(data);
  }

  public async registerPaymentAttachment(
    paymentId: string,
    input: PaymentAttachmentRegistrationInput,
  ): Promise<{ id: string }> {
    const { data: payment, error: paymentError } = await this.client
      .from('payments')
      .select('id')
      .eq('id', paymentId)
      .maybeSingle();
    if (paymentError) throw mapSupabaseError(paymentError, 'No se pudo verificar el pago.');
    if (!payment)
      throw new AppError({
        code: 'PAYMENT_NOT_FOUND',
        message: 'El pago no existe.',
        statusCode: 404,
      });

    const { data, error } = await this.client
      .from('attachments')
      .insert({
        entity_type: 'PAYMENT',
        entity_id: paymentId,
        attachment_type: 'PROOF',
        bucket_id: input.bucketId,
        object_path: input.objectPath,
        original_filename: input.originalFilename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        uploaded_by: this.actorId,
      })
      .select('id')
      .single<{ id: string }>();
    if (error)
      throw mapSupabaseError(error, 'La constancia se subió, pero no se pudo asociar al pago.');
    return data;
  }

  public async confirmPayment(
    paymentId: string,
    idempotencyKey: string,
  ): Promise<GenericMutationResult> {
    const { data, error } = await this.client.rpc('confirm_payment_v1', {
      p_payment_id: paymentId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo confirmar el pago.');
    return genericMutationResultSchema.parse(data);
  }

  public async rejectPayment(paymentId: string, reason: string): Promise<GenericMutationResult> {
    const { data, error } = await this.client.rpc('reject_payment_v1', {
      p_payment_id: paymentId,
      p_reason: reason,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo rechazar el pago.');
    return genericMutationResultSchema.parse(data);
  }

  public async reversePayment(
    paymentId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<GenericMutationResult> {
    const { data, error } = await this.client.rpc('reverse_payment_v1', {
      p_payment_id: paymentId,
      p_reason: reason,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo revertir el pago.');
    return genericMutationResultSchema.parse(data);
  }

  public async createReceipt(
    saleId: string,
    input: CreateReceiptInput,
    idempotencyKey: string,
  ): Promise<GenericMutationResult> {
    const { data, error } = await this.client.rpc('create_receipt_v1', {
      p_sale_id: saleId,
      p_input: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar la boleta.');
    return genericMutationResultSchema.parse(data);
  }

  public async registerReceiptAttachment(
    receiptId: string,
    input: ReceiptAttachmentRegistrationInput,
  ): Promise<{ id: string }> {
    const { data: receipt, error: receiptError } = await this.client
      .from('sales_receipts')
      .select('id')
      .eq('id', receiptId)
      .maybeSingle();
    if (receiptError) throw mapSupabaseError(receiptError, 'No se pudo verificar la boleta.');
    if (!receipt)
      throw new AppError({
        code: 'RECEIPT_NOT_FOUND',
        message: 'La boleta no existe.',
        statusCode: 404,
      });

    const { data, error } = await this.client
      .from('attachments')
      .insert({
        entity_type: 'RECEIPT',
        entity_id: receiptId,
        attachment_type: 'FILE',
        bucket_id: input.bucketId,
        object_path: input.objectPath,
        original_filename: input.originalFilename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        uploaded_by: this.actorId,
      })
      .select('id')
      .single<{ id: string }>();
    if (error)
      throw mapSupabaseError(error, 'El archivo se subió, pero no se pudo asociar a la boleta.');
    return data;
  }

  public async annulReceipt(receiptId: string, reason: string): Promise<GenericMutationResult> {
    const { data, error } = await this.client.rpc('annul_receipt_v1', {
      p_receipt_id: receiptId,
      p_reason: reason,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo anular la boleta.');
    return genericMutationResultSchema.parse(data);
  }

  public async createCreditNote(
    receiptId: string,
    input: CreateCreditNoteInput,
  ): Promise<GenericMutationResult> {
    const { data, error } = await this.client.rpc('create_credit_note_v1', {
      p_receipt_id: receiptId,
      p_input: input,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo registrar la nota de crédito.');
    return genericMutationResultSchema.parse(data);
  }

  public async calculateLatePenalty(saleId: string): Promise<GenericMutationResult> {
    const { data, error } = await this.client.rpc('calculate_late_penalty_v1', {
      p_sale_id: saleId,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo calcular la penalidad.');
    return genericMutationResultSchema.parse(data);
  }

  public async waivePenalty(penaltyId: string, reason: string): Promise<GenericMutationResult> {
    const { data, error } = await this.client.rpc('waive_penalty_v1', {
      p_penalty_id: penaltyId,
      p_reason: reason,
    });
    if (error) throw mapSupabaseError(error, 'No se pudo exonerar la penalidad.');
    return genericMutationResultSchema.parse(data);
  }
}
