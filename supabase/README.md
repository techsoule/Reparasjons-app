# Supabase — Fixiphone reparasjons-app

Backend for appen: Postgres-skjema, RLS, edge functions og seed-data.

## Struktur

```
supabase/
├── migrations/
│   ├── 0001_schema.sql     # Tabeller, enums, ordrenummer, triggere
│   └── 0002_rls.sql        # Row Level Security + rollehjelpere
├── functions/              # Edge functions (kommer i steg 3)
└── config.toml
```

## Datamodell (oppsummert)

| Tabell | Rolle |
|--------|-------|
| `technicians` | Reparatører + admin. `id = auth.users.id`, rolle, provisjon, aktiv |
| `availability` | Fri / ferie / sykdom per reparatør |
| `devices` | iPhone-modeller |
| `repair_types` | Feiltyper |
| `prices` | Delekost, arbeidspris, estimert tid per modell+feiltype |
| `jobs` | Bookinger/ordre med ordrenummer, pris, status, tildelt reparatør |
| `assignment_log` | Full sporbarhet: begrunnelse + score for alle tre ved hver tildeling |
| `earnings` | Provisjon per jobb (arbeidspris × provisjon_prosent) |
| `notifications` | In-app varsler |
| `booking_rate_limit` | Spam-beskyttelse for booking-intake |

**Statusflyt:** `mottatt → bekreftet → under_arbeid → venter_pa_deler → ferdig → hentet`

**Ordrenummer:** `FIX-<år>-<løpenr>`, f.eks. `FIX-2026-00001` (genereres automatisk).

## RLS-prinsipper

- **Åpenhet er bevisst:** alle aktive reparatører kan lese *alle* rader i
  `jobs`, `earnings`, `technicians` og `assignment_log`.
- Kun **admin** kan endre priser, provisjonsprosent og opprette/deaktivere
  reparatører.
- Reparatør kan endre **kun** `status`, `notat` og `bekreftet_tidspunkt` på
  **egne** jobber (håndhevet av vakt-triggeren `jobs_guard_kolonner`).
- Omfordeling krever admin eller mottakers godkjenning (RPC i steg 3).
- Reparatør lagrer eget push-token via RPC `set_push_token(token)`.

## Ta i bruk

Med Supabase CLI:

```bash
supabase db push          # kjører migrasjonene i rekkefølge
supabase db reset         # nullstill + kjør migrasjoner + seed (lokalt)
```

Eller kjør SQL-filene manuelt i rekkefølge mot databasen (SQL-editor eller psql).

> Merk: Skjemaet forutsetter Supabase Auth (`auth.users`, `auth.uid()`).
> Hver reparatør opprettes som auth-bruker, og en rad i `technicians` med
> samme `id` kobler bruker til rolle og provisjon.
