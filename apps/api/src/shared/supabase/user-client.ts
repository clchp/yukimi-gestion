import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../../config/env.js';

export interface UserSupabaseClientFactory {
  create(accessToken: string): SupabaseClient;
}

export class SupabaseUserClientFactory implements UserSupabaseClientFactory {
  public constructor(private readonly env: Pick<AppEnv, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>) {}

  public create(accessToken: string): SupabaseClient {
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
}
