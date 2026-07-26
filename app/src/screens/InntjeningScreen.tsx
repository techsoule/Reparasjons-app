import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, View, Text, StyleSheet } from 'react-native';
import { Skjerm, Tittel, Kort, LasterVisning, TomVisning } from '../components/UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { summerInntjening } from '@shared/domain/earnings';
import { kr, dato } from '@shared/domain/format';

interface EarningRad {
  id: string;
  belop: number;
  utbetalt: boolean;
  periode: string | null;
  opprettet: string;
  jobs: { ordrenummer: string; kunde_navn: string } | null;
}

export function InntjeningScreen() {
  const { tekniker } = useAuth();
  const [rader, setRader] = useState<EarningRad[]>([]);
  const [laster, setLaster] = useState(true);

  const last = useCallback(async () => {
    if (!tekniker) return;
    const { data } = await supabase
      .from('earnings')
      .select('id, belop, utbetalt, periode, opprettet, jobs(ordrenummer, kunde_navn)')
      .eq('technician_id', tekniker.id)
      .order('opprettet', { ascending: false });
    setRader((data as unknown as EarningRad[]) ?? []);
    setLaster(false);
  }, [tekniker]);

  useFocusEffect(useCallback(() => {
    last();
  }, [last]));
  useRealtime('earnings', last);

  if (laster) return <Skjerm><LasterVisning /></Skjerm>;

  const sum = summerInntjening(rader);

  return (
    <Skjerm>
      <View style={{ padding: avstand.l, paddingBottom: 0 }}>
        <Tittel>Min inntjening</Tittel>
        <View style={s.sumrad}>
          <View style={s.sumboks}>
            <Text style={s.sumEtikett}>Ubetalt</Text>
            <Text style={[s.sumVerdi, { color: farger.advarsel }]}>{kr(sum.ubetalt)}</Text>
          </View>
          <View style={s.sumboks}>
            <Text style={s.sumEtikett}>Utbetalt</Text>
            <Text style={[s.sumVerdi, { color: farger.suksess }]}>{kr(sum.utbetalt)}</Text>
          </View>
          <View style={s.sumboks}>
            <Text style={s.sumEtikett}>Totalt</Text>
            <Text style={s.sumVerdi}>{kr(sum.total)}</Text>
          </View>
        </View>
      </View>

      <FlatList
        data={rader}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: avstand.l }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={last} />}
        ListEmptyComponent={<TomVisning tekst="Ingen inntjening registrert ennå." />}
        renderItem={({ item }) => (
          <Kort>
            <View style={s.topp}>
              <Text style={s.ordre}>{item.jobs?.ordrenummer ?? '—'}</Text>
              <Text style={[s.belop, { color: item.utbetalt ? farger.suksess : farger.advarsel }]}>
                {kr(item.belop)}
              </Text>
            </View>
            <View style={s.topp}>
              <Text style={s.kunde}>{item.jobs?.kunde_navn ?? ''}</Text>
              <Text style={s.merke}>{item.utbetalt ? 'Utbetalt' : 'Ubetalt'}</Text>
            </View>
            <Text style={s.dato}>{dato(item.opprettet)}</Text>
          </Kort>
        )}
      />
    </Skjerm>
  );
}

const s = StyleSheet.create({
  sumrad: { flexDirection: 'row', gap: avstand.s, marginBottom: avstand.l },
  sumboks: {
    flex: 1,
    borderWidth: 1,
    borderColor: farger.kant,
    padding: avstand.m,
    alignItems: 'center',
  },
  sumEtikett: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.liten },
  sumVerdi: { fontFamily: skrift.semibold, color: farger.tekst, fontSize: tekststr.medium, marginTop: 2 },
  topp: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ordre: { fontFamily: skrift.semibold, color: farger.primar, fontSize: tekststr.normal },
  belop: { fontFamily: skrift.semibold, fontSize: tekststr.medium },
  kunde: { fontFamily: skrift.regular, color: farger.tekst, fontSize: tekststr.normal },
  merke: { fontFamily: skrift.medium, color: farger.tekstSvak, fontSize: tekststr.liten },
  dato: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.liten, marginTop: 2 },
});
