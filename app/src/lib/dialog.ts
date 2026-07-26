// Kryssplattform-dialoger. React Native sin Alert er en TOM no-op på web
// (react-native-web), så vi bruker nettleserens egne dialoger der.
import { Alert, Platform } from 'react-native';

const w = globalThis as unknown as {
  alert: (m: string) => void;
  confirm: (m: string) => boolean;
  prompt: (m: string, def?: string) => string | null;
};

/** Enkel melding med OK. onOk kjøres etter at brukeren lukker den. */
export function melding(tittel: string, tekst?: string, onOk?: () => void): void {
  if (Platform.OS === 'web') {
    w.alert(tekst ? `${tittel}\n\n${tekst}` : tittel);
    onOk?.();
  } else {
    Alert.alert(tittel, tekst, onOk ? [{ text: 'OK', onPress: onOk }] : undefined);
  }
}

/** Ja/nei-bekreftelse. onJa kjøres kun ved bekreftelse. */
export function bekreft(tittel: string, tekst: string, onJa: () => void): void {
  if (Platform.OS === 'web') {
    if (w.confirm(`${tittel}\n\n${tekst}`)) onJa();
  } else {
    Alert.alert(tittel, tekst, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'OK', onPress: onJa },
    ]);
  }
}

/** Velg blant flere valg (f.eks. hvilken reparatør). */
export function velg(
  tittel: string,
  valg: { tekst: string; onTrykk: () => void }[],
): void {
  if (Platform.OS === 'web') {
    const meny = valg.map((v, i) => `${i + 1}. ${v.tekst}`).join('\n');
    const svar = w.prompt(`${tittel}\n\n${meny}\n\nSkriv nummer:`);
    const n = parseInt(svar ?? '', 10);
    if (n >= 1 && n <= valg.length) valg[n - 1].onTrykk();
  } else {
    Alert.alert(tittel, undefined, [
      ...valg.map((v) => ({ text: v.tekst, onPress: v.onTrykk })),
      { text: 'Avbryt', style: 'cancel' as const },
    ]);
  }
}

/** Be om en kort tekst (fritekst). onSvar kjøres med det brukeren skrev. */
export function spor(
  tittel: string,
  undertekst: string,
  onSvar: (tekst: string) => void,
): void {
  if (Platform.OS === 'web') {
    const s = w.prompt(`${tittel}\n\n${undertekst}`);
    if (s !== null) onSvar(s);
  } else if (typeof Alert.prompt === 'function') {
    Alert.prompt(tittel, undertekst, (t) => onSvar(t ?? ''));
  } else {
    Alert.alert(tittel, undertekst, [
      { text: 'Avbryt', style: 'cancel' },
      { text: 'OK', onPress: () => onSvar('') },
    ]);
  }
}
