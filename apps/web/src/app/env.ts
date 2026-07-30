import { z } from 'zod';

const webEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_API_URL: z.string().url(),
  VITE_WEB_PUSH_PUBLIC_KEY: z.string().min(20).optional(),
});

const parsed = webEnvSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Variables del frontend inválidas: ${details}`);
}

export const webEnv = parsed.data;
