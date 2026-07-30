import { useQuery } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { supabase } from '../../app/supabase';

interface ProductImageProps {
  path: string | null;
  alt: string;
  className?: string;
  fallbackText?: string;
}

export function ProductImage({
  path,
  alt,
  className = 'product-thumb',
  fallbackText = 'P',
}: ProductImageProps) {
  const signedUrl = useQuery({
    queryKey: ['product-image', path],
    enabled: Boolean(path),
    staleTime: 45 * 60_000,
    queryFn: async () => {
      if (!path) return null;
      const { data, error } = await supabase.storage
        .from('product-images')
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (!path || signedUrl.isError || !signedUrl.data) {
    return (
      <div className={className} aria-label="Producto sin imagen">
        {fallbackText || <ImageIcon size={18} />}
      </div>
    );
  }

  return (
    <img className={`${className} product-image`} src={signedUrl.data} alt={alt} loading="lazy" />
  );
}
