# Slik limer du inn bookingskjemaet i WordPress / Elementor

Bookingskjemaet (`booking-form/booking-form.html`) er selvstendig: all CSS og
JavaScript ligger inne i filen. Det poster **direkte** til Supabase Edge
Function `booking-intake` med `fetch` — altså **ut** fra nettsiden. Dette er
viktig fordi one.com blokkerer innkommende kall til `/wp-json/` via
mod_security. Formspree er ikke lenger involvert og kan fjernes.

## 1. Fyll inn de to verdiene i skjemaet

Åpne `booking-form.html` og finn `CONFIG` nederst i `<script>`:

```js
var CONFIG = {
  FUNCTION_URL: 'https://DITT-PROSJEKT.supabase.co/functions/v1/booking-intake',
  ANON_KEY: 'DIN_SUPABASE_ANON_KEY',
};
```

- **FUNCTION_URL** – finnes i Supabase → *Edge Functions* → `booking-intake`
  (formen er `https://<prosjekt-ref>.supabase.co/functions/v1/booking-intake`).
- **ANON_KEY** – Supabase → *Project Settings* → *API* → *anon public*.
  Denne nøkkelen er offentlig og trygg å ha i nettsidekoden.

## 2a. Lim inn i Elementor (anbefalt)

1. Rediger siden med Elementor.
2. Dra inn widgeten **HTML** der skjemaet skal stå.
3. Lim inn **hele innholdet** i `booking-form.html` i HTML-feltet.
4. Klikk **Oppdater/Publiser**.

> Elementor kjører JavaScript i HTML-widgeten som normalt, så skjemaet
> fungerer rett ut av boksen.

## 2b. Alternativ: Gutenberg (blokkredigering)

1. Rediger siden.
2. Legg til blokken **Egendefinert HTML**.
3. Lim inn hele innholdet i `booking-form.html`.
4. Oppdater siden.

## 2c. Alternativ: klassisk editor / shortcode

Hvis du bruker den klassiske editoren: bytt til **Tekst**-fanen (ikke
*Visuell*) og lim inn koden der. Unngå at editoren «renser» `<script>` —
plugin som *Code Embed* eller *Insert Headers and Footers* kan brukes hvis
temaet fjerner script-tagger.

## 3. Test

1. Åpne siden i nettleser.
2. Fyll ut og send en test-booking.
3. Du skal se en **kvitteringsskjerm med ordrenummer** (f.eks. `FIX-2026-00001`).
4. Sjekk at bekreftelses-e-post kommer til kunden, og at verkstedet får varsel.
5. Reparatøren som fikk jobben skal få push-varsel i appen.

## Feilsøking

| Symptom | Årsak / løsning |
|---------|-----------------|
| «Nettverksfeil» | Feil `FUNCTION_URL`, eller CORS. Opphavet må være `fixiphone.no` eller `ipimp.no` (sjekk at siden kjøres på https og riktig domene). |
| 401 / «Invalid JWT» | Mangler eller feil `ANON_KEY` i CONFIG. |
| «Ukjent modell» | Modellen finnes ikke i `devices`-tabellen. Kjør seed, eller legg til modellen i admin. |
| Ingen e-post | `RESEND_API_KEY` mangler i Edge Function-miljøet (bookingen lagres likevel). |
| Skjemaet vises men gjør ingenting | Temaet strippet `<script>`. Bruk en HTML-widget/plugin som tillater JavaScript. |

## CORS

Edge-funksjonen tillater kun opphavene `fixiphone.no`, `www.fixiphone.no`,
`ipimp.no` og `www.ipimp.no`. Skal skjemaet ligge på et annet domene, legg
domenet til i `supabase/functions/_shared/cors.ts` og re-deploy funksjonen.
