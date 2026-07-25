import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  TextInput,
  ScrollView,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { farger, avstand, skrift, tekststr } from '../theme';
import {
  STATUS_TEKST,
  STATUS_FARGE,
  type JobStatus,
} from '@shared/domain/status';

// ---- Skjermramme ----
export function Skjerm({
  children,
  scroll = false,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  refreshControl?: React.ReactElement;
}) {
  if (scroll) {
    return (
      <SafeAreaView style={s.skjerm} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ padding: avstand.l }}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={s.skjerm} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

// ---- Overskrift ----
export function Tittel({ children }: { children: React.ReactNode }) {
  return <Text style={s.tittel}>{children}</Text>;
}
export function Undertittel({ children }: { children: React.ReactNode }) {
  return <Text style={s.undertittel}>{children}</Text>;
}

// ---- Kort ----
export function Kort({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const innhold = <View style={[s.kort, style]}>{children}</View>;
  if (onPress)
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {innhold}
      </TouchableOpacity>
    );
  return innhold;
}

// ---- Knapp ----
export function Knapp({
  tittel,
  onPress,
  variant = 'primar',
  laster = false,
  deaktivert = false,
  style,
}: {
  tittel: string;
  onPress: () => void;
  variant?: 'primar' | 'sekundar' | 'fare';
  laster?: boolean;
  deaktivert?: boolean;
  style?: ViewStyle;
}) {
  const bakgrunn =
    variant === 'primar'
      ? farger.primar
      : variant === 'fare'
        ? farger.feil
        : farger.flate;
  const tekstFarge = variant === 'sekundar' ? farger.tekst : farger.hvit;
  return (
    <TouchableOpacity
      style={[
        s.knapp,
        { backgroundColor: bakgrunn, opacity: deaktivert ? 0.5 : 1 },
        variant === 'sekundar' && { borderWidth: 1, borderColor: farger.kant },
        style,
      ]}
      onPress={onPress}
      disabled={deaktivert || laster}
      activeOpacity={0.8}
    >
      {laster ? (
        <ActivityIndicator color={tekstFarge} />
      ) : (
        <Text style={[s.knappTekst, { color: tekstFarge }]}>{tittel}</Text>
      )}
    </TouchableOpacity>
  );
}

// ---- Statusbadge ----
export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <View style={[s.badge, { backgroundColor: STATUS_FARGE[status] }]}>
      <Text style={s.badgeTekst}>{STATUS_TEKST[status]}</Text>
    </View>
  );
}

// ---- Etikett + verdi (detaljrad) ----
export function Rad({ etikett, verdi }: { etikett: string; verdi: string }) {
  return (
    <View style={s.rad}>
      <Text style={s.radEtikett}>{etikett}</Text>
      <Text style={s.radVerdi}>{verdi}</Text>
    </View>
  );
}

// ---- Tekstfelt ----
export function Felt({
  etikett,
  style,
  ...props
}: {
  etikett: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: avstand.m }}>
      {etikett ? <Text style={s.feltEtikett}>{etikett}</Text> : null}
      <TextInput
        style={[s.felt, style]}
        placeholderTextColor={farger.tekstSvak}
        {...props}
      />
    </View>
  );
}

// ---- Segmentvelger (faner) ----
export function Segment({
  valg,
  valgt,
  onVelg,
}: {
  valg: { key: string; tittel: string }[];
  valgt: string;
  onVelg: (key: string) => void;
}) {
  return (
    <View style={s.segment}>
      {valg.map((v) => {
        const aktiv = v.key === valgt;
        return (
          <TouchableOpacity
            key={v.key}
            style={[s.segmentValg, aktiv && s.segmentValgAktiv]}
            onPress={() => onVelg(v.key)}
          >
            <Text style={[s.segmentTekst, aktiv && s.segmentTekstAktiv]}>
              {v.tittel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---- Søyle (fordeling) ----
export function Soyle({
  navn,
  verdi,
  maks,
  etikett,
  fremhev = false,
}: {
  navn: string;
  verdi: number;
  maks: number;
  etikett: string;
  fremhev?: boolean;
}) {
  const bredde = maks > 0 ? Math.max(2, (verdi / maks) * 100) : 2;
  return (
    <View style={{ marginBottom: avstand.m }}>
      <View style={s.soyleTopp}>
        <Text style={s.soyleNavn}>
          {navn}
          {fremhev ? '  ⟵ står for tur' : ''}
        </Text>
        <Text style={s.soyleVerdi}>{etikett}</Text>
      </View>
      <View style={s.soyleSpor}>
        <View
          style={[
            s.soyleFyll,
            { width: `${bredde}%`, backgroundColor: fremhev ? farger.advarsel : farger.primar },
          ]}
        />
      </View>
    </View>
  );
}

// ---- Laster / tom ----
export function LasterVisning() {
  return (
    <View style={s.senter}>
      <ActivityIndicator size="large" color={farger.primar} />
    </View>
  );
}
export function TomVisning({ tekst }: { tekst: string }) {
  return (
    <View style={s.senter}>
      <Text style={s.tomTekst}>{tekst}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  skjerm: { flex: 1, backgroundColor: farger.bakgrunn },
  tittel: {
    fontFamily: skrift.semibold,
    fontSize: tekststr.xl,
    color: farger.tekst,
    marginBottom: avstand.s,
  } as TextStyle,
  undertittel: {
    fontFamily: skrift.medium,
    fontSize: tekststr.medium,
    color: farger.tekst,
    marginTop: avstand.l,
    marginBottom: avstand.s,
  } as TextStyle,
  kort: {
    backgroundColor: farger.hvit,
    borderWidth: 1,
    borderColor: farger.kant,
    padding: avstand.l,
    marginBottom: avstand.m,
  },
  knapp: {
    paddingVertical: avstand.m,
    paddingHorizontal: avstand.l,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  knappTekst: { fontFamily: skrift.semibold, fontSize: tekststr.medium },
  badge: { paddingHorizontal: avstand.s, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeTekst: {
    color: farger.hvit,
    fontFamily: skrift.medium,
    fontSize: tekststr.liten,
  } as TextStyle,
  rad: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: avstand.s,
    borderBottomWidth: 1,
    borderBottomColor: farger.flate,
  },
  radEtikett: { fontFamily: skrift.regular, color: farger.tekstSvak, fontSize: tekststr.normal },
  radVerdi: {
    fontFamily: skrift.medium,
    color: farger.tekst,
    fontSize: tekststr.normal,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: avstand.m,
  } as TextStyle,
  feltEtikett: {
    fontFamily: skrift.medium,
    fontSize: tekststr.normal,
    color: farger.tekst,
    marginBottom: avstand.xs,
  } as TextStyle,
  felt: {
    borderWidth: 1,
    borderColor: farger.kant,
    padding: avstand.m,
    fontFamily: skrift.regular,
    fontSize: tekststr.medium,
    color: farger.tekst,
    backgroundColor: farger.hvit,
  },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: farger.kant,
    marginBottom: avstand.l,
  },
  segmentValg: { flex: 1, paddingVertical: avstand.s, alignItems: 'center' },
  segmentValgAktiv: { backgroundColor: farger.primar },
  segmentTekst: { fontFamily: skrift.medium, color: farger.tekst, fontSize: tekststr.normal },
  segmentTekstAktiv: { color: farger.hvit },
  soyleTopp: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: avstand.xs },
  soyleNavn: { fontFamily: skrift.medium, color: farger.tekst, fontSize: tekststr.normal },
  soyleVerdi: { fontFamily: skrift.semibold, color: farger.tekst, fontSize: tekststr.normal },
  soyleSpor: { height: 14, backgroundColor: farger.flate },
  soyleFyll: { height: 14 },
  senter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: avstand.xl },
  tomTekst: {
    fontFamily: skrift.regular,
    color: farger.tekstSvak,
    fontSize: tekststr.medium,
    textAlign: 'center',
  } as TextStyle,
});
