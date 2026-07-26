import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { melding, spor } from '../lib/dialog';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Skjerm,
  Tittel,
  Kort,
  Rad,
  Knapp,
  Felt,
  StatusBadge,
  LasterVisning,
  Undertittel,
} from '../components/UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { supabase } from '../lib/supabase';
import { hentJobb, hentRepairTypes, lagOppslag } from '../lib/data';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { kr, datoTid, tid as fmtTid } from '@shared/domain/format';
import { beregnProvisjon } from '@shared/domain/earnings';
import {
  STATUS_FLYT,
  STATUS_TEKST,
  type JobStatus,
} from '@shared/domain/status';
import type { Job } from '../lib/types';
import type { JobberStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<JobberStackParamList, 'JobbDetalj'>;

export function JobbDetaljScreen({ route }: Props) {
  const { jobId } = route.params;
  const { tekniker, erAdmin } = useAuth();
  const [jobb, setJobb] = useState<Job | null>(null);
  const [rtNavn, setRtNavn] = useState<Record<string, string>>({});
  const [notat, setNotat] = useState('');
  const [lagrer, setLagrer] = useState(false);

  const last = useCallback(async () => {
    const [j, rt] = await Promise.all([hentJobb(jobId), hentRepairTypes()]);
    setJobb(j);
    setRtNavn(lagOppslag(rt, 'navn'));
    if (j && notat === '') setNotat(j.notat ?? '');
  }, [jobId, notat]);

  useEffect(() => {
    last();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  useRealtime('jobs', last);

  if (!jobb) return <Skjerm><LasterVisning /></Skjerm>;

  const erMin = jobb.technician_id === tekniker?.id;
  const kanEndre = erMin || erAdmin;
  const feiltyper = jobb.repair_type_ids.map((id) => rtNavn[id]).filter(Boolean).join(', ');
  const andel = beregnProvisjon(jobb.arbeidspris, tekniker?.provisjon_prosent ?? 0);

  async function settStatus(ny: JobStatus) {
    const { error } = await supabase.from('jobs').update({ status: ny }).eq('id', jobId);
    if (error) melding('Kunne ikke endre status', error.message);
  }

  async function lagreNotat() {
    setLagrer(true);
    const { error } = await supabase.from('jobs').update({ notat }).eq('id', jobId);
    setLagrer(false);
    if (error) melding('Kunne ikke lagre notat', error.message);
    else melding('Lagret', 'Notatet er oppdatert.');
  }

  async function bekreftTidspunkt() {
    const tid = jobb!.onsket_tidspunkt ?? new Date().toISOString();
    const { error } = await supabase
      .from('jobs')
      .update({ bekreftet_tidspunkt: tid, status: 'bekreftet' })
      .eq('id', jobId);
    if (error) melding('Kunne ikke bekrefte', error.message);
  }

  async function sendOmfordelingsforesporsel(grunn: string | null) {
    const { error } = await supabase.rpc('be_om_omfordeling', {
      p_job_id: jobId,
      p_begrunnelse: grunn,
    });
    if (error) melding('Feil', error.message);
    else melding('Sendt', 'Admin har fått forespørselen.');
  }

  function beOmOmfordeling() {
    spor('Be om omfordeling', 'Kort begrunnelse (valgfritt):', (grunn) =>
      sendOmfordelingsforesporsel(grunn ? grunn : null),
    );
  }

  return (
    <Skjerm scroll>
      <View style={s.topp}>
        <Tittel>{jobb.ordrenummer}</Tittel>
        <StatusBadge status={jobb.status} />
      </View>

      <Undertittel>Kunde</Undertittel>
      <Kort>
        <Rad etikett="Navn" verdi={jobb.kunde_navn} />
        <Rad etikett="Telefon" verdi={jobb.telefon} />
        <Rad etikett="E-post" verdi={jobb.epost} />
        <Rad etikett="Modell" verdi={jobb.device?.modellnavn ?? '—'} />
        <Rad etikett="Reparasjon" verdi={feiltyper || '—'} />
        <Rad etikett="Ønsket tid" verdi={datoTid(jobb.onsket_tidspunkt) || 'Ikke satt'} />
        <Rad
          etikett="Bekreftet tid"
          verdi={datoTid(jobb.bekreftet_tidspunkt) || 'Ikke bekreftet'}
        />
        {jobb.kommentar ? <Rad etikett="Kommentar" verdi={jobb.kommentar} /> : null}
      </Kort>

      <Undertittel>Økonomi</Undertittel>
      <Kort>
        <Rad etikett="Delen koster" verdi={kr(jobb.delekost)} />
        <Rad etikett="Kunden betaler" verdi={kr(jobb.totalpris)} />
        <Rad etikett="Reparatør tjener" verdi={kr(andel)} />
        <Rad etikett="Estimert tid" verdi={fmtTid(jobb.estimert_tid_min)} />
      </Kort>

      {kanEndre && (
        <>
          <Undertittel>Status</Undertittel>
          <View style={s.statusrad}>
            {STATUS_FLYT.map((st) => {
              const aktiv = st === jobb.status;
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.statusknapp, aktiv && s.statusknappAktiv]}
                  onPress={() => settStatus(st)}
                >
                  <Text style={[s.statusTekst, aktiv && s.statusTekstAktiv]}>
                    {STATUS_TEKST[st]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!jobb.bekreftet_tidspunkt && (
            <Knapp
              tittel="Bekreft ønsket tidspunkt"
              variant="sekundar"
              onPress={bekreftTidspunkt}
              style={{ marginTop: avstand.m }}
            />
          )}

          <Undertittel>Notat</Undertittel>
          <Felt
            etikett=""
            value={notat}
            onChangeText={setNotat}
            multiline
            placeholder="Internt notat om jobben"
            style={s.notat}
          />
          <Knapp tittel="Lagre notat" onPress={lagreNotat} laster={lagrer} />

          {erMin && !erAdmin && (
            <Knapp
              tittel="Be om omfordeling"
              variant="fare"
              onPress={beOmOmfordeling}
              style={{ marginTop: avstand.m }}
            />
          )}
        </>
      )}
    </Skjerm>
  );
}

const s = StyleSheet.create({
  topp: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusrad: { flexDirection: 'row', flexWrap: 'wrap', gap: avstand.s },
  statusknapp: {
    borderWidth: 1,
    borderColor: farger.kant,
    paddingVertical: avstand.s,
    paddingHorizontal: avstand.m,
  },
  statusknappAktiv: { backgroundColor: farger.primar, borderColor: farger.primar },
  statusTekst: { fontFamily: skrift.medium, color: farger.tekst, fontSize: tekststr.normal },
  statusTekstAktiv: { color: farger.hvit },
  notat: { minHeight: 80 },
});
