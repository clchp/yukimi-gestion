import { z } from 'zod';

export const globalSearchItemSchema = z.object({
  entityType: z.enum(['CLIENT', 'SALE', 'IMPORT', 'DELIVERY', 'PRODUCT']),
  id: z.string().uuid(),
  label: z.string(),
  secondary: z.string(),
  route: z.string().startsWith('/'),
});
export type GlobalSearchItem = z.infer<typeof globalSearchItemSchema>;

export const globalSearchResponseSchema = z.object({
  items: z.array(globalSearchItemSchema),
  query: z.string(),
});
export type GlobalSearchResponse = z.infer<typeof globalSearchResponseSchema>;
