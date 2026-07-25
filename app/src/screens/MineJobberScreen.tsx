import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Skjerm, Tittel, Segment, LasterVisning, TomVisning } from '../components/UI';
import { JobbKort } from '../components/JobbKort';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { hentJobber, hentRepairTypes, lagOppslag } from '../lib/data';
import { erFullfort } from '@shared/domain/status';
import { erIDag } from '@shared/domain/format';
import { farger, avstand } from '../theme';
import type { Job } from '../lib/types';
import type { JobberStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<JobberStackParamList, 'MineJobber'>;

type Fane = 'idag' | 'kommende' | 'fullfort';

export function MineJobberScreen({ navigation }: Props) {
  const { tekniker } = useAuth();
  const [jobber, setJobber] = useState<Job[]>([]);
  const [rtNavn, setRtNavn] = useState<Record<string, string>>({});
  const [laster, setLaster] = useState(true);
  const [fane, setFane] = useState<Fane>('idag');

  const last = useCallback(async () => {
    const [alle, rt] = await Promise.all([hentJobber(), hentRepairTypes()]);
    setJobber(alle.filter((j) => j.technician_id === tekniker?.id));
    setRtNavn(lagOppslag(rt, 'navn'));
    setLaster(false);
  }, [tekniker?.id]);

  useEffect(() => {
    last();
  }, [last]);
  useRealtime('jobs', last);

  const mine = jobber;
  const filtrert = mine.filter((j) => {
    const tid = j.bekreftet_tidspunkt ?? j.onsket_tidspunkt;
    if (fane === 'fullfort') return erFullfort(j.status);
    if (erFullfort(j.status)) return false;
    if (fane === 'idag') return erIDag(tid) || !tid;
    return !erIDag(tid) && !!tid; // kommende
  });

  return (
    <Skjerm>
      <View style={{ padding: avstand.l, paddingBottom: 0 }}>
        <Tittel>Mine jobber</Tittel>
        <Segment
          valgt={fane}
          onVelg={(k) => setFane(k as Fane)}
          valg={[
            { key: 'idag', tittel: 'I dag' },
            { key: 'kommende', tittel: 'Kommende' },
            { key: 'fullfort', tittel: 'Fullført' },
          ]}
        />
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
          ListEmptyComponent={<TomVisning tekst="Ingen jobber her ennå." />}
          renderItem={({ item }) => (
            <JobbKort
              jobb={item}
              repairTypeNavn={rtNavn}
              provisjonProsent={tekniker?.provisjon_prosent}
              onPress={() => navigation.navigate('JobbDetalj', { jobId: item.id })}
            />
          )}
        />
      )}
    </Skjerm>
  );
}
