import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { browserSupabaseConfigured, getSupabaseBrowserClient } from './supabase.js';

interface AuthContextValue {
  readonly configured: boolean;
  readonly loading: boolean;
  readonly session: Session | null;
  readonly user: User | null;
  readonly accessToken?: string;
  readonly roles: readonly string[];
  readonly isOps: boolean;
  signInWithEmail(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const configured = browserSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setLoading(false);
      return;
    }
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string) => {
    const client = getSupabaseBrowserClient();
    if (!client) throw new Error('Supabase 브라우저 인증이 설정되지 않았습니다.');
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const metadata = session?.user.app_metadata ?? {};
    const role = typeof metadata.role === 'string' ? [metadata.role] : [];
    const listed = Array.isArray(metadata.roles)
      ? metadata.roles.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const roles = Object.freeze([...new Set([...role, ...listed].map((entry) => entry.toLowerCase()))]);
    return {
      configured,
      loading,
      session,
      user: session?.user ?? null,
      ...(session?.access_token ? { accessToken: session.access_token } : {}),
      roles,
      isOps: roles.some((entry) => entry === 'ops' || entry === 'admin'),
      signInWithEmail,
      signOut,
    };
  }, [configured, loading, session, signInWithEmail, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
