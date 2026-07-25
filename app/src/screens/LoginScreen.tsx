import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Skjerm, Felt, Knapp } from '../components/UI';
import { farger, avstand, skrift, tekststr } from '../theme';
import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const { loggInn } = useAuth();
  const [epost, setEpost] = useState('');
  const [passord, setPassord] = useState('');
  const [feil, setFeil] = useState<string | null>(null);
  const [laster, setLaster] = useState(false);

  async function paaLoggInn() {
    setFeil(null);
    if (!epost.trim() || !passord) {
      setFeil('Fyll inn e-post og passord');
      return;
    }
    setLaster(true);
    const f = await loggInn(epost, passord);
    setLaster(false);
    if (f) setFeil(f);
  }

  return (
    <Skjerm>
      <KeyboardAvoidingView
        style={s.wrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.logo}>
          <Text style={s.logoTekst}>Fixiphone</Text>
        </View>
        <Text style={s.velkommen}>Logg inn</Text>

        <Felt
          etikett="E-post"
          value={epost}
          onChangeText={setEpost}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="navn@fixiphone.no"
        />
        <Felt
          etikett="Passord"
          value={passord}
          onChangeText={setPassord}
          secureTextEntry
          placeholder="••••••••"
        />

        {feil && <Text style={s.feil}>{feil}</Text>}

        <Knapp
          tittel="Logg inn"
          onPress={paaLoggInn}
          laster={laster}
          style={{ marginTop: avstand.m }}
        />
      </KeyboardAvoidingView>
    </Skjerm>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, padding: avstand.xl, justifyContent: 'center' },
  logo: { alignItems: 'center', marginBottom: avstand.xxl },
  logoTekst: {
    fontFamily: skrift.bold,
    fontSize: 34,
    color: farger.primar,
  },
  velkommen: {
    fontFamily: skrift.semibold,
    fontSize: tekststr.stor,
    color: farger.tekst,
    marginBottom: avstand.l,
  },
  feil: { color: farger.feil, fontFamily: skrift.medium, marginTop: avstand.xs },
});
