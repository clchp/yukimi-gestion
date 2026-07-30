import { supabase } from '../../app/supabase';
import { registerPaymentAttachment, registerReceiptAttachment } from './payments-api';

function safeFilename(filename: string): string {
  const extension = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : 'dat';
  const base = filename
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'archivo'}.${extension || 'dat'}`;
}

export async function uploadPaymentProof(paymentId: string, file: File): Promise<void> {
  const path = `${paymentId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage
    .from('payment-proofs')
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
  if (error) throw error;
  try {
    await registerPaymentAttachment(paymentId, {
      bucketId: 'payment-proofs',
      objectPath: path,
      originalFilename: file.name,
      mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
      sizeBytes: file.size,
    });
  } catch (registrationError) {
    await supabase.storage.from('payment-proofs').remove([path]);
    throw registrationError;
  }
}

export async function uploadReceiptFile(receiptId: string, file: File): Promise<void> {
  const path = `${receiptId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage
    .from('receipt-files')
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
  if (error) throw error;
  try {
    await registerReceiptAttachment(receiptId, {
      bucketId: 'receipt-files',
      objectPath: path,
      originalFilename: file.name,
      mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
      sizeBytes: file.size,
    });
  } catch (registrationError) {
    await supabase.storage.from('receipt-files').remove([path]);
    throw registrationError;
  }
}
