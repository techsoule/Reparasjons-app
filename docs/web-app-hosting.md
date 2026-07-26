# Legg web-appen ut (gratis) og installer på iPhone

Web-appen er ferdig bygget i mappa `app/dist/` (og pakket som
`fixiphone-webapp.zip`). Den er en fullverdig app som kjører i nettleseren og
kan legges på hjemskjermen som et app-ikon — helt gratis, uten Apple-konto.

## Steg 1 — Legg den ut på nett (ca. 1 minutt, ingen konto nødvendig)

Enkleste vei er **Netlify Drop**:

1. Pakk ut `fixiphone-webapp.zip` på maskinen din (du får en mappe med bl.a.
   `index.html`).
2. Gå til **[app.netlify.com/drop](https://app.netlify.com/drop)**.
3. **Dra hele mappa** inn i det store feltet på siden.
4. Etter noen sekunder får du en **nettadresse** (f.eks.
   `https://fixiphone-app.netlify.app`). Det er appen deres, live.

> Vil du beholde adressen permanent og kunne bytte til et penere navn, lag en
> gratis Netlify-konto når den spør — men det er ikke påkrevd for å teste.
> Alternativer som funker like godt: Cloudflare Pages, Vercel, GitHub Pages.

## Steg 2 — Installer på iPhone (alle tre)

På hver iPhone:

1. Åpne nettadressen i **Safari**.
2. Trykk **Del-knappen** (firkanten med pil opp).
3. Velg **«Legg til på Hjem-skjerm»**.
4. Trykk **Legg til**.

Nå ligger **Fixiphone**-ikonet på hjemskjermen og åpner i fullskjerm, akkurat
som en vanlig app. Reparatørene logger inn med e-posten og passordet du satte i
Supabase.

## Oppdateringer

Når appen skal endres, bygger jeg på nytt (`npm run build:web` i `app/`), og du
drar den nye mappa inn på Netlify igjen (eller den oppdateres automatisk hvis du
kobler Netlify til GitHub-repoet). Brukerne får endringene neste gang de åpner
appen — ingen ny installasjon.

## Hva som virker på web-versjonen

- ✅ Innlogging, roller (reparatør/admin)
- ✅ Mine jobber, jobbdetalj, alle jobber, fordeling, inntjening, tilgjengelighet
- ✅ Sanntidsoppdatering (Supabase realtime)
- ✅ Manuell omfordeling
- ⏳ Push-varsler er foreløpig av på web (kan legges til senere med web-push,
  eller via den native app-en om dere vil ha 99 $/år-varianten)

## Bygge på nytt selv (valgfritt)

```bash
cd app
npm install
npm run build:web     # lager app/dist/
```
