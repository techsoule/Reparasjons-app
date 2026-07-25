# Edge Functions

## booking-intake

Tar imot bookinger fra fixiphone-skjemaet, validerer, fordeler jobb, logger,
varsler og sender e-post. Returnerer ordrenummer.

### Flyt

1. CORS-sjekk (kun `fixiphone.no` / `ipimp.no`).
2. Honeypot (`firma`-felt) + rate limit per IP (maks 8 / 60 min).
3. Validerer alle felt (norsk telefon + e-post) — avviser ufullstendig med
   tydelig norsk feilmelding.
4. Slår opp modell, feiltyper og priser (`prices`).
5. Oppretter `jobs`-rad med generert ordrenummer.
6. Henter fordelingsdata (`hent_fordelingsdata`) og kjører
   fordelingsalgoritmen (`shared/allocation`).
7. Tildeler reparatør, skriver **alltid** til `assignment_log`, oppretter
   `earnings` og in-app `notifications`.
8. Sender push (Expo) + e-post til kunde og verksted (Resend) — ikke-fatalt.
9. Returnerer `{ ok: true, ordrenummer }`.

### Miljøvariabler

| Variabel | Beskrivelse |
|----------|-------------|
| `SUPABASE_URL` | Settes automatisk av Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Settes automatisk av Supabase |
| `RESEND_API_KEY` | API-nøkkel fra Resend (for e-post) |
| `FROM_EMAIL` | Avsender, f.eks. `Fixiphone <booking@fixiphone.no>` |
| `WORKSHOP_EMAIL` | Mottaker for verkstedvarsel (standard `kontakt@fixiphone.no`) |

Sett hemmeligheter:

```bash
supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL="Fixiphone <booking@fixiphone.no>" WORKSHOP_EMAIL=kontakt@fixiphone.no
```

### Deploy

```bash
supabase functions deploy booking-intake --no-verify-jwt
```

> `--no-verify-jwt` fordi skjemaet ikke er innlogget. Spam håndteres av
> honeypot + rate limit i selve funksjonen. Anon-nøkkelen sendes likevel
> som `apikey`-header fra skjemaet for at API-gatewayen skal rute kallet.

### Del kode

Funksjonen importerer fordelingsalgoritmen og valideringen fra `shared/`
(`../../../shared/...`) slik at samme kode brukes i app, tester og backend.
