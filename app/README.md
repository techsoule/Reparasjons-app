# Fixiphone-app (Expo / React Native)

Intern app for reparatørene. Innlogging, jobber, fordeling, inntjening,
tilgjengelighet og varsler — med Supabase realtime.

## Kom i gang

```bash
cd app
npm install
cp .env.example .env      # fyll inn Supabase-URL + anon-nøkkel
npm start                 # åpne i Expo Go, eller npm run ios / npm run android
```

Verdiene kan også legges i `app.json` → `expo.extra.supabaseUrl` /
`supabaseAnonKey`.

## Struktur

```
app/
├── App.tsx                     # Fonter, providers, push-registrering
├── src/
│   ├── theme.ts                # Designsystem (#2b7de9, Poppins, skarpe hjørner)
│   ├── lib/
│   │   ├── supabase.ts         # Klient (AsyncStorage-sesjon)
│   │   ├── types.ts            # DB-typer
│   │   ├── data.ts             # Spørringer
│   │   └── push.ts             # Expo push-registrering
│   ├── context/AuthContext.tsx # Auth + rolle
│   ├── hooks/useRealtime.ts    # Realtime-abonnement
│   ├── components/             # UI-komponenter + JobbKort
│   ├── navigation/             # Tabs + stacks
│   └── screens/                # De 8 skjermene
```

## Skjermer

1. **Innlogging** — e-post + passord (roller reparatør/admin)
2. **Mine jobber** — i dag / kommende / fullført, med din andel
3. **Jobbdetalj** — kundeinfo, pris, status, notat, bekreft tid, omfordeling
4. **Alle jobber** — felles kø, hvem er tildelt, filtre, manuell omfordeling
5. **Fordeling** — søyler for alle tre (jobber/timer/kroner), uke/måned, hvem står for tur
6. **Min inntjening** — provisjon per jobb, sum utbetalt/ubetalt
7. **Tilgjengelighet** — fri/ferie/sykdom + utlogging (⚙️ i Mine jobber)
8. **Varsler** — ny jobb, omfordelt, status endret

Delt logikk (fordelingsalgoritme, validering, statusflyt, formatering,
inntjening) ligger i `../shared` og deles med backend + tester.

## Push-varsler

`src/lib/push.ts` ber om tillatelse, henter Expo push-token og lagrer det via
RPC `set_push_token`. Edge-funksjonen `booking-intake` sender push til tildelt
reparatør. For fysiske enheter kreves et EAS `projectId` i `app.json`.
