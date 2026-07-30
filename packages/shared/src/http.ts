import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;

export interface ApiSuccess<T> {
  data: T;
  meta?: Record<string, unknown>;
}
