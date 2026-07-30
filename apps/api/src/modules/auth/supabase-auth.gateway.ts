import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authenticatedUserSchema, type AuthenticatedUser } from '@yukimi/shared';
import type { AppEnv } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';

interface ProfileRow {
  id: string;
  email_snapshot: string | null;
  display_name: string;
  phone: string | null;
  avatar_path: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

interface UserRoleRow {
  role_code: string;
}

export class SupabaseAuthGateway {
  public constructor(private readonly env: Pick<AppEnv, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>) {}

  private createUserClient(accessToken: string): SupabaseClient {
    return createClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  public async authenticate(accessToken: string): Promise<AuthenticatedUser> {
    const client = this.createUserClient(accessToken);
    const { data: authData, error: authError } = await client.auth.getUser(accessToken);

    if (authError || !authData.user?.email) {
      throw new AppError({
        code: 'INVALID_SESSION',
        message: 'La sesión no es válida o ha vencido.',
        statusCode: 401,
        cause: authError,
      });
    }

    const userId = authData.user.id;

    const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] =
      await Promise.all([
        client.from('profiles').select('*').eq('id', userId).maybeSingle<ProfileRow>(),
        client
          .from('user_roles')
          .select('role_code')
          .eq('user_id', userId)
          .is('revoked_at', null)
          .returns<UserRoleRow[]>(),
      ]);

    if (profileError || rolesError) {
      throw new AppError({
        code: 'AUTHORIZATION_LOOKUP_FAILED',
        message: 'No se pudo verificar el acceso de la cuenta.',
        statusCode: 503,
        details: {
          profile: profileError?.message,
          roles: rolesError?.message,
        },
      });
    }

    if (!profile?.is_active) {
      throw new AppError({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'La cuenta todavía no está activa para usar Yukimi Gestión.',
        statusCode: 403,
      });
    }

    const parsed = authenticatedUserSchema.safeParse({
      id: userId,
      email: authData.user.email,
      profile,
      roles: (roleRows ?? []).map((role) => role.role_code),
    });

    if (!parsed.success || !parsed.data.roles.includes('ADMIN')) {
      throw new AppError({
        code: 'ADMIN_ROLE_REQUIRED',
        message: 'La cuenta no tiene permisos administrativos.',
        statusCode: 403,
        ...(parsed.success ? {} : { details: parsed.error.flatten() }),
      });
    }

    return parsed.data;
  }
}
