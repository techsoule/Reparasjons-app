import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, FlatList } from 'react-native';
import {
  Skjerm,
  Tittel,
  Undertittel,
  Felt,
  Knapp,
  Kort,
} from '../components/UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { hentTilgjengelighet } from '../lib/data';
import { dato } from '@shared/domain/format';
import type { Availability, AvailabilityType } from '../lib/types';

const TYPER: { key: AvailabilityType; tittel: string }[] = [
  { key: 'fri', tittel: 'Fri' },
  { key: 'ferie', tittel: 'Ferie' },
  { key: 'sykdom', tittel: 'Sykdom' },
];

const TYPE_TEKST: Record<AvailabilityType, string> = {
  fri: 'Fri',
  ferie: 'Ferie',
  sykdom: 'Sykdom',
};

export function TilgjengelighetScreen() {
  const { tekniker, loggUt } = useAuth();
  const [type, setType] = useState<AvailabilityType>('fri');
  const [fra, setFra] = useState('');
  const [til, setTil] = useState('');
  const [rader, setRader] = useState<Availability[]>([]);
  const [lagrer, setLagrer] = useState(false);

  const last = useCallback(async () => {
    if (tekniker) setRader(await hentTilgjengelighet(tekniker.id));
  }, [tekniker]);

  useEffect(() => {
    last();
  }, [last]);

  function gyldigDato(s: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  }

  async function lagre() {
    if (!gyldigDato(fra) || !gyldigDato(til)) {
      Alert.alert('Ugyldig dato', 'Bruk formatet ÅÅÅÅ-MM-DD.');
      return;
    }
    if (til < fra) {
      Alert.alert('Ugyldig periode', 'Til-dato kan ikke være før fra-dato.');
      return;
    }
    setLagrer(true);
    const { error } = await supabase.from('availability').insert({
      technician_id: tekniker!.id,
      dato_fra: fra,
      dato_til: til,
      type,
    });
    setLagrer(false);
    if (error) Alert.alert('Kunne ikke lagre', error.message);
    else {
      setFra('');
      setTil('');
      last();
    }
  }

  async function slett(id: string) {
    await supabase.from('availability').delete().eq('id', id);
    last();
  }

  return (
    <Skjerm scroll>
      <Tittel>Tilgjengelighet</Tittel>

      <Undertittel>Registrer fravær</Undertittel>
      <View style={s.typerad}>
        {TYPER.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[s.typeknapp, type === t.key && s.typeknappAktiv]}
            onPress={() => setType(t.key)}
          >
            <Text style={[s.typeTekst, type === t.key && s.typeTekstAktiv]}>{t.tittel}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Felt etikett="Fra (ÅÅÅÅ-MM-DD)" value={fra} onChangeText={setFra} placeholder="2026-07-28" />
      <Felt etikett="Til (ÅÅÅÅ-MM-DD)" value={til} onChangeText={setTil} placeholder="2026-08-04" />
      <Knapp tittel="Lagre fravær" onPress={lagre} laster={lagrer} />

      <Undertittel>Registrert fravær</Undertittel>
      {rader.length === 0 ? (
        <Text style={s.tom}>Ingen fravær registrert.</Text>
      ) : (
        <FlatList
          scrollEnabled={false}
          data={rader}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Kort>
              <View style={s.raderad}>
                <View>
                  <Text style={s.type}>{TYPE_TEKST[item.type]}</Text>
                  <Text style={s.periode}>
                    {dato(item.dato_fra)} – {dato(item.dato_til)}
                  </Text>
                </View>
                <Text style={s.slett} onPress={() => slett(item.id)}>
                  Slett
                </Text>
              </View>
            </Kort>
          )}
        />
      )}

      <Knapp
        tittel="Logg ut"
        variant="sekundar"
        onPress={loggUt}
        style={{ marginTop: avstand.xl }}
      />
    </Skjerm>
  );
}

const s = StyleSheet.create({
  typerad: { flexDirection: 'row', gap: avstand.s, marginBottom: avstand.m },
  typeknapp: {
    flex: 1,
    borderWidth: 1,
    borderColor: farger.kant,
    paddingVertical: avstand.s,
    alignItems: 'center',
  },
  typeknappAktiv: { backgroundColor: farger.primar, borderColor: farger.primar },
  typeTekst: { fontFamily: skrift.medium, color: farger.tekst, fontSize: tekststr.normal },
  typeTekstAktiv: { color: farger.hvit },
  tom: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.normal },
  raderad: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontFamily: skrift.semibold, color: farger.tekst, fontSize: tekststr.medium },
  periode: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.normal, marginTop: 2 },
  slett: { fontFamily: skrift.semibold, color: farger.feil, fontSize: tekststr.normal },
});
