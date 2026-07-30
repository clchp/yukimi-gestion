import { z } from 'zod';

export const APP_ROLES = {
  ADMIN: 'ADMIN',
} as const;

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES];

export const profileSchema = z.object({
  id: z.string().uuid(),
  email_snapshot: z.string().email().nullable(),
  display_name: z.string().min(1),
  phone: z.string().nullable(),
  avatar_path: z.string().nullable(),
  is_active: z.boolean(),
  last_login_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  version: z.number().int().positive(),
});

export type Profile = z.infer<typeof profileSchema>;

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  profile: profileSchema,
  roles: z.array(z.enum([APP_ROLES.ADMIN])).min(1),
});

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
