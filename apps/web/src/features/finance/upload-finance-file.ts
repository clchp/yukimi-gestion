import { supabase } from '../../app/supabase';
import { registerFinanceAttachment } from './finance-api';

function safeFilename(filename: string): string {
  const extension = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : 'dat';
  const base = filename
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'comprobante'}.${extension || 'dat'}`;
}

export async function uploadFinanceProof(transactionId: string, file: File): Promise<void> {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type))
    throw new Error('El comprobante debe ser JPG, PNG, WEBP o PDF.');
  if (file.size > 10 * 1024 * 1024) throw new Error('El comprobante supera el máximo de 10 MB.');
  const path = `${transactionId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage
    .from('financial-files')
    .upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false });
  if (error) throw error;
  try {
    await registerFinanceAttachment(transactionId, {
      bucketId: 'financial-files',
      objectPath: path,
      originalFilename: file.name,
      mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
      sizeBytes: file.size,
    });
  } catch (value) {
    await supabase.storage.from('financial-files').remove([path]);
    throw value;
  }
}
