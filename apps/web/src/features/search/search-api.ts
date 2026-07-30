import type { GlobalSearchResponse } from '@yukimi/shared';
import { apiRequest } from '../../app/api-client';

export function globalSearch(query: string): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: '12' });
  return apiRequest<GlobalSearchResponse>(`/search?${params.toString()}`);
}
