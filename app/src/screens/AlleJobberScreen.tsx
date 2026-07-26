import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View, Text, StyleSheet } from 'react-native';
import { melding, velg } from '../lib/dialog';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Skjerm,
  Tittel,
  Segment,
  LasterVisning,
  TomVisning,
  Kort,
  StatusBadge,
} from '../components/UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { supabase } from '../lib/supabase';
import {
  hentJobber,
  hentRepairTypes,
  hentReparatorer,
  lagOppslag,
} from '../lib/data';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { kr, datoTid, erIDag } from '@shared/domain/format';
import { STATUS_TEKST, type JobStatus } from '@shared/domain/status';
import type { Job, Technician } from '../lib/types';
import type { AlleStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AlleStackParamList, 'AlleJobber'>;

const STATUS_FILTER: { key: string; tittel: string }[] = [
  { key: 'alle', tittel: 'Alle' },
  { key: 'aktive', tittel: 'Aktive' },
  { key: 'idag', tittel: 'I dag' },
];

export function AlleJobberScreen({ navigation }: Props) {
  const { erAdmin, tekniker } = useAuth();
  const [jobber, setJobber] = useState<Job[]>([]);
  const [rtNavn, setRtNavn] = useState<Record<string, string>>({});
  const [teknNavn, setTeknNavn] = useState<Record<string, string>>({});
  const [reparatorer, setReparatorer] = useState<Technician[]>([]);
  const [laster, setLaster] = useState(true);
  const [filter, setFilter] = useState('aktive');

  const last = useCallback(async () => {
    const [alle, rt, rep] = await Promise.all([
      hentJobber(),
      hentRepairTypes(),
      hentReparatorer(),
    ]);
    setJobber(alle);
    setRtNavn(lagOppslag(rt, 'navn'));
    setReparatorer(rep);
    setTeknNavn(lagOppslag(rep, 'navn'));
    setLaster(false);
  }, []);

  useEffect(() => {
    last();
  }, [last]);
  useRealtime('jobs', last);

  const filtrert = jobber.filter((j) => {
    const tid = j.bekreftet_tidspunkt ?? j.onsket_tidspunkt;
    if (filter === 'aktive') return j.status !== 'hentet';
    if (filter === 'idag') return erIDag(tid);
    return true;
  });

  function omfordel(jobb: Job) {
    // Admin: velg blant reparatører. Reparatør: kan hente jobben til seg selv.
    const valg = erAdmin
      ? reparatorer
      : reparatorer.filter((r) => r.id === tekniker?.id);
    const knapper = valg.map((r) => ({
      tekst: r.navn,
      onTrykk: async () => {
        const { error } = await supabase.rpc('omfordel_jobb', {
          p_job_id: jobb.id,
          p_ny_technician: r.id,
          p_begrunnelse: null,
        });
        if (error) melding('Kunne ikke omfordele', error.message);
      },
    }));
    velg(erAdmin ? 'Omfordel – velg reparatør' : 'Overfør jobben til deg selv?', knapper);
  }

  return (
    <Skjerm>
      <View style={{ padding: avstand.l, paddingBottom: 0 }}>
        <Tittel>Alle jobber</Tittel>
        <Segment valgt={filter} onVelg={setFilter} valg={STATUS_FILTER} />
      </View>
      {laster ? (
        <LasterVisning />
      ) : (
        <FlatList
          data={filtrert}
          keyExtractor={(j) => j.id}
          contentContainerStyle={{ padding: avstand.l, paddingTop: 0 }}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={last} tintColor={farger.primar} />
          }
          ListEmptyComponent={<TomVisning tekst="Ingen jobber." />}
          renderItem={({ item }) => (
            <Kort onPress={() => navigation.navigate('JobbDetalj', { jobId: item.id })}>
              <View style={s.topp}>
                <Text style={s.ordre}>{item.ordrenummer}</Text>
                <StatusBadge status={item.status as JobStatus} />
              </View>
              <Text style={s.kunde}>{item.kunde_navn}</Text>
              <Text style={s.detalj}>
                {item.device?.modellnavn ?? '—'} ·{' '}
                {item.repair_type_ids.map((id) => rtNavn[id]).filter(Boolean).join(', ')}
              </Text>
              <View style={s.bunn}>
                <Text style={s.tid}>
                  {datoTid(item.bekreftet_tidspunkt ?? item.onsket_tidspunkt) || 'Ikke satt'}
                </Text>
                <Text style={s.pris}>{kr(item.totalpris)}</Text>
              </View>
              <View style={s.bunn}>
                <Text style={s.tildelt}>
                  {item.technician_id
                    ? `Tildelt: ${teknNavn[item.technician_id] ?? 'ukjent'}`
                    : 'Ikke tildelt'}
                </Text>
                <Text style={s.omfordel} onPress={() => omfordel(item)}>
                  Omfordel ›
                </Text>
              </View>
            </Kort>
          )}
        />
      )}
    </Skjerm>
  );
}

const s = StyleSheet.create({
  topp: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: avstand.xs,
  },
  ordre: { fontFamily: skrift.semibold, color: farger.primar, fontSize: tekststr.normal },
  kunde: { fontFamily: skrift.semibold, color: farger.tekst, fontSize: tekststr.medium },
  detalj: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.normal, marginTop: 2 },
  bunn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: avstand.s,
  },
  tid: { fontFamily: skrift.medium, color: farger.tekst, fontSize: tekststr.normal },
  pris: { fontFamily: skrift.semibold, color: farger.tekst, fontSize: tekststr.normal },
  tildelt: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.liten },
  omfordel: { fontFamily: skrift.semibold, color: farger.primar, fontSize: tekststr.liten },
});
