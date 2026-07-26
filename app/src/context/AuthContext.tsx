import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Technician } from '../lib/types';

interface AuthState {
  session: Session | null;
  tekniker: Technician | null;
  laster: boolean;
  erAdmin: boolean;
  loggInn: (epost: string, passord: string) => Promise<string | null>;
  loggUt: () => Promise<void>;
  oppdaterTekniker: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tekniker, setTekniker] = useState<Technician | null>(null);
  const [laster, setLaster] = useState(true);

  const hentTekniker = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('technicians')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setTekniker((data as Technician) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user) await hentTekniker(data.session.user.id);
      setLaster(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s?.user) await hentTekniker(s.user.id);
      else setTekniker(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [hentTekniker]);

  const loggInn = useCallback(async (epost: string, passord: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: epost.trim(),
      password: passord,
    });
    if (error) {
      if (error.message.toLowerCase().includes('invalid'))
        return 'Feil e-post eller passord';
      return error.message;
    }
    return null;
  }, []);

  const loggUt = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const oppdaterTekniker = useCallback(async () => {
    if (session?.user) await hentTekniker(session.user.id);
  }, [session, hentTekniker]);

  return (
    <AuthCtx.Provider
      value={{
        session,
        tekniker,
        laster,
        erAdmin: tekniker?.rolle === 'admin' || tekniker?.er_admin === true,
        loggInn,
        loggUt,
        oppdaterTekniker,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth må brukes innenfor AuthProvider');
  return ctx;
}
