# Få appen på iPhone (TestFlight)

Fordi alle tre bruker iPhone, distribuerer vi appen via **TestFlight** —
Apples offisielle måte å dele en app til noen få personer uten å gå gjennom
full App Store-vurdering. Appen bygges i Expo sin sky (EAS), ikke på din
maskin.

## Hva du må skaffe (én gang)

| # | Hva | Hvor | Kostnad / tid |
|---|-----|------|---------------|
| 1 | **Expo-konto** | [expo.dev](https://expo.dev) → Sign up | Gratis, 2 min |
| 2 | **Apple Developer-konto** | [developer.apple.com/programs](https://developer.apple.com/programs/enroll/) | ~99 $/år. Kan ta 1–2 dager å bli godkjent — start tidlig |

Selve appen (kode, ikon, byggeoppsett) er allerede klar i dette prosjektet
(`app/`, `eas.json`).

## Hvordan bygget skjer

Når kontoene finnes, kan **jeg kjøre bygget for deg** hvis du gir meg:
- en **Expo access token** (fra expo.dev → Account → Access tokens), og
- en **App Store Connect API-nøkkel** (fra App Store Connect → Users and
  Access → Integrations → App Store Connect API — du laster ned en `.p8`-fil
  og noterer «Issuer ID» + «Key ID»).

Med disse kjører jeg:

```bash
cd app
eas init            # kobler appen til din Expo-konto (lager projectId)
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Bygget tar ~15–20 min i skyen, og legges deretter automatisk i
App Store Connect.

## Invitere de tre til TestFlight

1. Gå til [App Store Connect](https://appstoreconnect.apple.com) → din app →
   **TestFlight**.
2. Under **Internal Testing**, legg til Jonas, Andreas og Felix med deres
   Apple-ID-e-poster.
3. De laster ned **TestFlight**-appen fra App Store og får en invitasjon —
   ett trykk for å installere Fixiphone-appen.

Etter dette får de nye versjoner automatisk hver gang vi bygger på nytt.

## Push-varsler

Push på ekte iPhone krever et bygg som dette (ikke Expo Go). EAS setter opp
Apple-push-nøkkelen (APNs) automatisk under bygget når du er logget på
Apple-kontoen. Da virker «ny jobb tildelt»-varslene på telefonene.

## Kort oppsummert

1. Lag Expo-konto (gratis) ✔ raskt
2. Start Apple Developer-innmelding (99 $/år) ✔ har ventetid — gjør det først
3. Gi meg de to nøklene over → jeg bygger og sender til TestFlight
4. Inviter de tre i TestFlight → de installerer med ett trykk
