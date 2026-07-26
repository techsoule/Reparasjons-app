import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshControl, View, Text, StyleSheet } from 'react-native';
import {
  Skjerm,
  Tittel,
  Undertittel,
  Segment,
  Soyle,
  Kort,
  LasterVisning,
} from '../components/UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { supabase } from '../lib/supabase';
import { hentJobber, hentReparatorer } from '../lib/data';
import { useRealtime } from '../hooks/useRealtime';
import { aggregerStatistikk, type TeknikerStat } from '@shared/domain/earnings';
import { nesteForTur, type TechnicianInput } from '@shared/allocation/allocation';
import { kr, tid as fmtTid } from '@shared/domain/format';
import type { Job, Technician } from '../lib/types';

export function FordelingScreen() {
  const [stat, setStat] = useState<TeknikerStat[]>([]);
  const [nesteNavn, setNesteNavn] = useState<string | null>(null);
  const [laster, setLaster] = useState(true);
  const [periode, setPeriode] = useState<'uke' | 'maned'>('uke');

  const last = useCallback(async () => {
    const [jobber, reparatorer] = await Promise.all([
      hentJobber(),
      hentReparatorer(),
    ]);

    const dager = periode === 'uke' ? 7 : 30;
    const grense = Date.now() - dager * 86400_000;
    const iPeriode = jobber.filter(
      (j: Job) => new Date(j.opprettet).getTime() >= grense,
    );

    setStat(
      aggregerStatistikk(
        reparatorer.map((t: Technician) => ({
          id: t.id,
          navn: t.navn,
        })),
        iPeriode.map((j) => ({
          technician_id: j.technician_id,
          arbeidspris: j.arbeidspris,
          estimert_tid_min: j.estimert_tid_min,
        })),
      ),
    );

    // Hvem står for tur på neste innkommende booking
    const { data: fd } = await supabase.rpc('hent_fordelingsdata', {
      jobbdato: new Date().toISOString().slice(0, 10),
    });
    const input: TechnicianInput[] = (fd ?? []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      navn: t.navn as string,
      aktiv: t.aktiv as boolean,
      total_kroner: Number(t.total_kroner),
      total_minutter: Number(t.total_minutter),
      sist_tildelt: (t.sist_tildelt as string) ?? null,
      utilgjengelig: t.utilgjengelig as boolean,
    }));
    setNesteNavn(nesteForTur(input)?.navn ?? null);
    setLaster(false);
  }, [periode]);

  useFocusEffect(useCallback(() => {
    last();
  }, [last]));
  useRealtime('jobs', last);

  if (laster) return <Skjerm><LasterVisning /></Skjerm>;

  const maksJobber = Math.max(1, ...stat.map((s) => s.antall_jobber));
  const maksMin = Math.max(1, ...stat.map((s) => s.minutter));
  const maksKr = Math.max(1, ...stat.map((s) => s.kroner));

  return (
    <Skjerm scroll refreshControl={<RefreshControl refreshing={false} onRefresh={last} />}>
      <Tittel>Fordeling</Tittel>
      <Segment
        valgt={periode}
        onVelg={(k) => setPeriode(k as 'uke' | 'maned')}
        valg={[
          { key: 'uke', tittel: 'Siste uke' },
          { key: 'maned', tittel: 'Siste måned' },
        ]}
      />

      <Kort style={{ backgroundColor: farger.flate, borderColor: farger.flate }}>
        <Text style={s.nesteEtikett}>Står for tur på neste booking</Text>
        <Text style={s.nesteNavn}>{nesteNavn ?? 'Ingen tilgjengelig'}</Text>
      </Kort>

      <Undertittel>Fortjeneste per reparatør</Undertittel>
      {stat.map((t) => (
        <Soyle
          key={`k-${t.technician_id}`}
          navn={t.navn}
          verdi={t.kroner}
          maks={maksKr}
          etikett={kr(t.kroner)}
          fremhev={t.navn === nesteNavn}
        />
      ))}

      <Undertittel>Antall jobber</Undertittel>
      {stat.map((t) => (
        <Soyle
          key={`j-${t.technician_id}`}
          navn={t.navn}
          verdi={t.antall_jobber}
          maks={maksJobber}
          etikett={`${t.antall_jobber}`}
        />
      ))}

      <Undertittel>Timer</Undertittel>
      {stat.map((t) => (
        <Soyle
          key={`t-${t.technician_id}`}
          navn={t.navn}
          verdi={t.minutter}
          maks={maksMin}
          etikett={fmtTid(t.minutter)}
        />
      ))}
    </Skjerm>
  );
}

const s = StyleSheet.create({
  nesteEtikett: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.normal },
  nesteNavn: {
    fontFamily: skrift.semibold,
    color: farger.primar,
    fontSize: tekststr.stor,
    marginTop: 2,
  },
});
