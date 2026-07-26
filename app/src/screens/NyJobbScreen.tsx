import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from 'react-native';
import { melding } from '../lib/dialog';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Skjerm, Tittel, Felt, Knapp } from '../components/UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { supabase } from '../lib/supabase';
import { hentDevices, hentRepairTypes } from '../lib/data';
import type { Device, RepairType } from '../lib/types';
import type { JobberStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<JobberStackParamList, 'NyJobb'>;

export function NyJobbScreen({ navigation }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [repairTypes, setRepairTypes] = useState<RepairType[]>([]);
  const [modellModal, setModellModal] = useState(false);

  const [kundeNavn, setKundeNavn] = useState('');
  const [telefon, setTelefon] = useState('');
  const [epost, setEpost] = useState('');
  const [modell, setModell] = useState('');
  const [valgteFeil, setValgteFeil] = useState<string[]>([]);
  const [kvalitet, setKvalitet] = useState<'original' | 'aftermarket'>('original');
  const [tidspunkt, setTidspunkt] = useState('');
  const [kommentar, setKommentar] = useState('');
  const [sender, setSender] = useState(false);

  useEffect(() => {
    hentDevices().then(setDevices);
    hentRepairTypes().then(setRepairTypes);
  }, []);

  const vekslerFeil = useCallback((navn: string) => {
    setValgteFeil((f) =>
      f.includes(navn) ? f.filter((x) => x !== navn) : [...f, navn],
    );
  }, []);

  async function lagre() {
    if (!kundeNavn.trim()) return melding('Mangler', 'Fyll inn kundenavn.');
    if (!modell) return melding('Mangler', 'Velg modell.');
    if (valgteFeil.length === 0) return melding('Mangler', 'Velg minst én feiltype.');

    setSender(true);
    const { data, error } = await supabase.rpc('opprett_og_fordel_jobb', {
      p_kunde_navn: kundeNavn,
      p_modell: modell,
      p_feiltyper: valgteFeil,
      p_telefon: telefon,
      p_epost: epost,
      p_onsket: tidspunkt,
      p_kommentar: kommentar,
      p_kvalitet: kvalitet,
    });
    setSender(false);

    if (error) {
      melding('Kunne ikke lagre', error.message);
      return;
    }
    const rad = Array.isArray(data) ? data[0] : data;
    melding(
      'Booking opprettet',
      `Ordre ${rad?.ordrenummer}\nFordelt til: ${rad?.tildelt ?? 'ingen tilgjengelig – må fordeles manuelt'}`,
      () => navigation.goBack(),
    );
  }

  return (
    <Skjerm scroll>
      <Tittel>Ny booking</Tittel>
      <Text style={s.hjelp}>
        Jobben fordeles automatisk og rettferdig – uavhengig av hvem som legger den inn.
      </Text>

      <Felt etikett="Kundenavn *" value={kundeNavn} onChangeText={setKundeNavn} placeholder="Ola Nordmann" />
      <Felt
        etikett="Telefon"
        value={telefon}
        onChangeText={setTelefon}
        keyboardType="phone-pad"
        placeholder="404 04 040"
      />

      {/* Modell-velger */}
      <Text style={s.etikett}>Modell *</Text>
      <TouchableOpacity style={s.velger} onPress={() => setModellModal(true)}>
        <Text style={[s.velgerTekst, !modell && { color: farger.tekstSvak }]}>
          {modell || 'Velg modell …'}
        </Text>
        <Text style={s.pil}>▾</Text>
      </TouchableOpacity>

      {/* Feiltyper */}
      <Text style={s.etikett}>Hva gjelder det? *</Text>
      <View style={s.chips}>
        {repairTypes.map((rt) => {
          const valgt = valgteFeil.includes(rt.navn);
          return (
            <TouchableOpacity
              key={rt.id}
              style={[s.chip, valgt && s.chipAktiv]}
              onPress={() => vekslerFeil(rt.navn)}
            >
              <Text style={[s.chipTekst, valgt && s.chipTekstAktiv]}>{rt.navn}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Kvalitet */}
      <Text style={s.etikett}>Kvalitet</Text>
      <View style={s.kvalrad}>
        {([
          { key: 'original', tittel: 'Original / premium' },
          { key: 'aftermarket', tittel: 'Aftermarket' },
        ] as const).map((k) => {
          const valgt = kvalitet === k.key;
          return (
            <TouchableOpacity
              key={k.key}
              style={[s.kvalknapp, valgt && s.kvalknappAktiv]}
              onPress={() => setKvalitet(k.key)}
            >
              <Text style={[s.kvalTekst, valgt && s.kvalTekstAktiv]}>{k.tittel}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ height: avstand.m }} />
      <Felt
        etikett="Ønsket tidspunkt (valgfritt)"
        value={tidspunkt}
        onChangeText={setTidspunkt}
        placeholder="f.eks. i dag 15:00"
      />
      <Felt
        etikett="Kommentar (valgfritt)"
        value={kommentar}
        onChangeText={setKommentar}
        multiline
        placeholder="Beskriv feilen"
        style={{ minHeight: 70 }}
      />

      <Knapp tittel="Opprett og fordel" onPress={lagre} laster={sender} />
      <View style={{ height: avstand.xl }} />

      {/* Modal for modellvalg */}
      <Modal visible={modellModal} animationType="slide" transparent>
        <View style={s.modalBak}>
          <View style={s.modalKort}>
            <View style={s.modalTopp}>
              <Text style={s.modalTittel}>Velg modell</Text>
              <TouchableOpacity onPress={() => setModellModal(false)}>
                <Text style={s.lukk}>Lukk</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={devices}
              keyExtractor={(d) => d.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.modellrad}
                  onPress={() => {
                    setModell(item.modellnavn);
                    setModellModal(false);
                  }}
                >
                  <Text style={s.modellTekst}>{item.modellnavn}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </Skjerm>
  );
}

const s = StyleSheet.create({
  hjelp: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.normal, marginBottom: avstand.l },
  etikett: { fontFamily: skrift.medium, fontSize: tekststr.normal, color: farger.tekst, marginBottom: avstand.xs },
  velger: {
    borderWidth: 1,
    borderColor: farger.kant,
    padding: avstand.m,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: avstand.m,
  },
  velgerTekst: { fontFamily: skrift.regular, fontSize: tekststr.medium, color: farger.tekst },
  pil: { color: farger.tekstSvak, fontSize: tekststr.medium },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: avstand.s },
  chip: { borderWidth: 1, borderColor: farger.kant, paddingVertical: avstand.s, paddingHorizontal: avstand.m },
  chipAktiv: { backgroundColor: farger.primar, borderColor: farger.primar },
  chipTekst: { fontFamily: skrift.medium, color: farger.tekst, fontSize: tekststr.normal },
  chipTekstAktiv: { color: farger.hvit },
  kvalrad: { flexDirection: 'row', gap: avstand.s, marginBottom: avstand.s },
  kvalknapp: { flex: 1, borderWidth: 1, borderColor: farger.kant, paddingVertical: avstand.s, alignItems: 'center' },
  kvalknappAktiv: { backgroundColor: farger.primar, borderColor: farger.primar },
  kvalTekst: { fontFamily: skrift.medium, color: farger.tekst, fontSize: tekststr.normal },
  kvalTekstAktiv: { color: farger.hvit },
  modalBak: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalKort: { backgroundColor: farger.hvit, maxHeight: '80%', paddingBottom: avstand.xl },
  modalTopp: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: avstand.l,
    borderBottomWidth: 1,
    borderBottomColor: farger.kant,
  },
  modalTittel: { fontFamily: skrift.semibold, fontSize: tekststr.medium, color: farger.tekst },
  lukk: { fontFamily: skrift.semibold, color: farger.primar, fontSize: tekststr.normal },
  modellrad: { padding: avstand.l, borderBottomWidth: 1, borderBottomColor: farger.flate },
  modellTekst: { fontFamily: skrift.regular, fontSize: tekststr.medium, color: farger.tekst },
});
