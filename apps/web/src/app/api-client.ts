import { apiErrorSchema, type ApiSuccess } from '@yukimi/shared';
import { webEnv } from './env';
import { supabase } from './supabase';

export class ApiClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');

  if (init?.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  if (data.session?.access_token) {
    headers.set('authorization', `Bearer ${data.session.access_token}`);
  }

  const response = await fetch(`${webEnv.VITE_API_URL}${path}`, {
    ...init,
    headers,
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
        parsed.data.error.details,
      );
    }
    throw new ApiClientError('UNEXPECTED_API_ERROR', 'La API devolvió una respuesta inesperada.', response.status);
  }

  return (body as ApiSuccess<T>).data;
}
