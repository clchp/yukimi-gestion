import { apiErrorSchema, type ApiSuccess } from '@yukimi/shared';
import { webEnv } from './env';
import { supabase } from './supabase';

export class ApiClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
    public readonly requestId?: string,
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

  let response: Response;
  try {
    response = await fetch(`${webEnv.VITE_API_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    throw new ApiClientError(
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor. Comprueba que la API esté encendida y vuelve a intentarlo.',
      0,
      error instanceof Error ? { message: error.message } : undefined,
    );
  }

  const body: unknown = await response.json().catch(() => null);
  const headerRequestId = response.headers.get('x-request-id') ?? undefined;

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiClientError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
        parsed.data.error.details,
        parsed.data.error.requestId ?? headerRequestId,
      );
    }
    throw new ApiClientError(
      'UNEXPECTED_API_ERROR',
      response.status >= 500
        ? 'El servidor no pudo completar la operación. Tus datos escritos se conservarán para que puedas intentarlo nuevamente.'
        : 'La API devolvió una respuesta inesperada. Revisa los datos ingresados y vuelve a intentarlo.',
      response.status,
      body,
      headerRequestId,
    );
  }

  return (body as ApiSuccess<T>).data;
}
