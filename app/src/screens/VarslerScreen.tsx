import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { FlatList, RefreshControl, View, Text, StyleSheet } from 'react-native';
import { Skjerm, Tittel, Kort, LasterVisning, TomVisning, Knapp } from '../components/UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { hentVarsler } from '../lib/data';
import { datoTid } from '@shared/domain/format';
import type { Notification, VarselType } from '../lib/types';

const IKON: Record<VarselType, string> = {
  ny_jobb: '🔧',
  jobb_omfordelt: '🔄',
  status_endret: '📌',
  omfordeling_foresporsel: '🙋',
};

export function VarslerScreen() {
  const { tekniker } = useAuth();
  const [varsler, setVarsler] = useState<Notification[]>([]);
  const [laster, setLaster] = useState(true);

  const last = useCallback(async () => {
    if (!tekniker) return;
    setVarsler(await hentVarsler(tekniker.id));
    setLaster(false);
  }, [tekniker]);

  useFocusEffect(useCallback(() => {
    last();
  }, [last]));
  useRealtime('notifications', last);

  async function markerLest(id: string) {
    await supabase.from('notifications').update({ lest: true }).eq('id', id);
    last();
  }

  async function markerAlleLest() {
    if (!tekniker) return;
    await supabase
      .from('notifications')
      .update({ lest: true })
      .eq('technician_id', tekniker.id)
      .eq('lest', false);
    last();
  }

  if (laster) return <Skjerm><LasterVisning /></Skjerm>;

  const uleste = varsler.filter((v) => !v.lest).length;

  return (
    <Skjerm>
      <View style={{ padding: avstand.l, paddingBottom: 0 }}>
        <Tittel>Varsler</Tittel>
        {uleste > 0 && (
          <Knapp tittel={`Marker alle som lest (${uleste})`} variant="sekundar" onPress={markerAlleLest} />
        )}
      </View>
      <FlatList
        data={varsler}
        keyExtractor={(v) => v.id}
        contentContainerStyle={{ padding: avstand.l }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={last} />}
        ListEmptyComponent={<TomVisning tekst="Ingen varsler." />}
        renderItem={({ item }) => (
          <Kort
            onPress={() => markerLest(item.id)}
            style={!item.lest ? { borderColor: farger.primar, borderLeftWidth: 3 } : undefined}
          >
            <View style={s.topp}>
              <Text style={s.tittel}>
                {IKON[item.type]} {item.tittel}
              </Text>
              {!item.lest && <View style={s.prikk} />}
            </View>
            <Text style={s.melding}>{item.melding}</Text>
            <Text style={s.tid}>{datoTid(item.opprettet)}</Text>
          </Kort>
        )}
      />
    </Skjerm>
  );
}

const s = StyleSheet.create({
  topp: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tittel: { fontFamily: skrift.semibold, color: farger.tekst, fontSize: tekststr.medium, flexShrink: 1 },
  prikk: { width: 10, height: 10, backgroundColor: farger.primar },
  melding: { fontFamily: skrift.regular, color: farger.tekst, fontSize: tekststr.normal, marginTop: 4 },
  tid: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.liten, marginTop: 4 },
});
