import type { Session } from '@supabase/supabase-js';
import type { AuthenticatedUser } from '@yukimi/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { apiRequest } from '../../app/api-client';
import { supabase } from '../../app/supabase';

interface AuthContextValue {
  session: Session | null;
  currentUser: AuthenticatedUser | null;
  isLoading: boolean;
  accessError: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refreshAccess(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  const refreshAccess = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);

    if (!data.session) {
      setCurrentUser(null);
      setAccessError(null);
      return;
    }

    try {
      const user = await apiRequest<AuthenticatedUser>('/auth/me');
      setCurrentUser(user);
      setAccessError(null);
    } catch (error) {
      setCurrentUser(null);
      setAccessError(error instanceof Error ? error.message : 'No se pudo verificar la cuenta.');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let authRefreshTimer: number | null = null;

    void (async () => {
      try {
        await refreshAccess();
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setCurrentUser(null);
        setAccessError(null);
        return;
      }
      if (authRefreshTimer !== null) window.clearTimeout(authRefreshTimer);
      authRefreshTimer = window.setTimeout(() => {
        authRefreshTimer = null;
        void refreshAccess();
      }, 0);
    });

    return () => {
      mounted = false;
      if (authRefreshTimer !== null) window.clearTimeout(authRefreshTimer);
      data.subscription.unsubscribe();
    };
  }, [refreshAccess]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      currentUser,
      isLoading,
      accessError,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await refreshAccess();
      },
      async signOut() {
        await supabase.auth.signOut();
        setCurrentUser(null);
        setSession(null);
        setAccessError(null);
      },
      refreshAccess,
    }),
    [accessError, currentUser, isLoading, refreshAccess, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return context;
}
