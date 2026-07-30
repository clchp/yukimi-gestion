import { supabase } from '../../app/supabase';
import { registerProductAttachment } from './products-api';

function safeFilename(filename: string): string {
  const extension = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() : 'jpg';
  const base = filename
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'imagen'}.${extension || 'jpg'}`;
}

export async function uploadProductImages(productId: string, files: File[]): Promise<void> {
  for (const [index, file] of files.entries()) {
    const path = `${productId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
    const { error } = await supabase.storage.from('product-images').upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    });
    if (error) throw error;

    try {
      await registerProductAttachment(productId, {
        bucketId: 'product-images',
        objectPath: path,
        originalFilename: file.name,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        sizeBytes: file.size,
        isCover: index === 0,
      });
    } catch (registrationError) {
      await supabase.storage.from('product-images').remove([path]);
      throw registrationError;
    }
  }
}
