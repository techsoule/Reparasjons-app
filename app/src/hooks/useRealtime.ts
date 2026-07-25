import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Abonner på realtime-endringer på en tabell og kjør `onEndring` ved
 * hver INSERT/UPDATE/DELETE. Alle ser oppdateringer umiddelbart.
 */
export function useRealtime(
  tabell: string,
  onEndring: () => void,
  aktivert = true,
) {
  useEffect(() => {
    if (!aktivert) return;
    const kanal = supabase
      .channel(`realtime:${tabell}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabell },
        () => onEndring(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(kanal);
    };
    // onEndring bør være stabil (useCallback) hos kaller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabell, aktivert]);
}
