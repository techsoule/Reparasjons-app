# Fixiphone reparasjons-app

Intern mobil-app (iOS + Android) for Fixiphone — et mobilreparasjonsverksted i
Kristiansand med tre reparatører. Appen mottar bookinger fra bookingskjemaet på
fixiphone-nettsiden, fordeler jobbene jevnt mellom reparatørene og regner ut hva
hver enkelt tjener.

## Stack

React Native + Expo (TypeScript) · Supabase (Postgres, Auth, Realtime, Edge
Functions, RLS) · React Navigation · Expo Notifications · Resend (e-post).

## Struktur

```
.
├── app/                 # Expo React Native-app (8 skjermer)
├── shared/              # Delt, testbar logikk (ingen avhengigheter)
│   ├── allocation/      # Fordelingsalgoritme + tester
│   ├── validation/      # Norsk telefon + e-post + tester
│   └── domain/          # Statusflyt, formatering, inntjening + tester
├── supabase/
│   ├── migrations/      # Skjema, RLS, funksjoner, varsler
│   ├── functions/       # Edge function booking-intake (+ _shared)
│   └── seed.sql         # iPhone-modeller, feiltyper, priser, reparatører
├── booking-form/        # HTML/JS bookingskjema for WordPress
└── docs/                # WordPress-innliming m.m.
```

## Byggerekkefølge (slik den ble bygget)

1. **Supabase-skjema + RLS** — `supabase/migrations/0001–0002`
2. **Fordelingsalgoritme + tester** (isolert) — `shared/allocation`
3. **Edge function `booking-intake` + bookingskjema** — `supabase/functions`, `booking-form`
4. **App-skjermer** — `app/src/screens`
5. **Push-varsler** — `app/src/lib/push.ts` + `booking-intake`

## Fordelingsalgoritme (kort)

Rullerende 30-dagers `total_kroner` (inntjening) og `total_minutter`
(belastning) normaliseres til 0–1 → `score = kroner×0.6 + minutter×0.4`. Ny
jobb går til lavest score; utilgjengelige hoppes over; lik score brytes på
lengst siden sist tildelt. Hver tildeling logges i `assignment_log` med
begrunnelse og score for alle tre — tillitsmekanismen i appen.

## Åpenhet

Alle tre reparatører ser hverandres tall (jobber, timer, kroner). Dette er et
bevisst valg, håndhevet i RLS: alle innloggede reparatører kan lese alle rader i
`jobs`, `earnings`, `technicians` og `assignment_log`.

## Tester

```bash
npm install && npm test       # 34 tester (algoritme, validering, domenelogikk)
```

## Oppsett

- **Backend:** kjør migrasjonene i `supabase/migrations` + `seed.sql`, deploy
  `booking-intake` (se `supabase/functions/README.md`).
- **Skjema:** fyll inn URL + anon-nøkkel i `booking-form/booking-form.html` og
  lim inn i WordPress (se `docs/wordpress-innliming.md`).
- **App:** se `app/README.md`.
