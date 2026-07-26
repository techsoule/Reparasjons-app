import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Kort, StatusBadge } from './UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { kr, datoTid } from '@shared/domain/format';
import { fortjeneste } from '@shared/domain/earnings';
import type { Job } from '../lib/types';

export function JobbKort({
  jobb,
  repairTypeNavn,
  visAndel = false,
  tildeltNavn,
  onPress,
}: {
  jobb: Job;
  repairTypeNavn: Record<string, string>;
  visAndel?: boolean; // vis «din andel» (hele arbeidsmarginen)
  tildeltNavn?: string; // vises i Alle jobber
  onPress: () => void;
}) {
  const feiltyper = jobb.repair_type_ids
    .map((id) => repairTypeNavn[id])
    .filter(Boolean)
    .join(', ');
  const modell = jobb.device?.modellnavn ?? 'Ukjent modell';
  const tid = jobb.bekreftet_tidspunkt ?? jobb.onsket_tidspunkt;
  const andel = visAndel ? fortjeneste(jobb.arbeidspris) : null;

  return (
    <Kort onPress={onPress}>
      <View style={s.topp}>
        <Text style={s.ordre}>{jobb.ordrenummer}</Text>
        <StatusBadge status={jobb.status} />
      </View>
      <Text style={s.kunde}>{jobb.kunde_navn}</Text>
      <Text style={s.detalj}>
        {modell}
        {feiltyper ? ` · ${feiltyper}` : ''}
      </Text>
      <View style={s.bunn}>
        <Text style={s.tid}>{tid ? datoTid(tid) : 'Tidspunkt ikke satt'}</Text>
        <Text style={s.pris}>{kr(jobb.totalpris)}</Text>
      </View>
      <View style={s.bunn}>
        {tildeltNavn ? (
          <Text style={s.tildelt}>Tildelt: {tildeltNavn}</Text>
        ) : (
          <View />
        )}
        {andel != null && (
          <Text style={s.andel}>Din andel: {kr(andel)}</Text>
        )}
      </View>
    </Kort>
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
  detalj: {
    fontFamily: skrift.regular,
    color: farger.tekstSvak,
    fontSize: tekststr.normal,
    marginTop: 2,
  },
  bunn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: avstand.s,
  },
  tid: { fontFamily: skrift.medium, color: farger.tekst, fontSize: tekststr.normal },
  pris: { fontFamily: skrift.semibold, color: farger.tekst, fontSize: tekststr.normal },
  tildelt: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.liten },
  andel: { fontFamily: skrift.medium, color: farger.suksess, fontSize: tekststr.liten },
});
