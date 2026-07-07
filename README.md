# 🔧 Reparasjons-app

Et enkelt fordelingssystem for reparasjonsverksted. Registrer innkommende
reparasjoner, legg inn teknikerne dine, og la appen **fordele jobbene automatisk**
etter spesialitet og arbeidsmengde. Følg opp alt på en Kanban-tavle.

## Funksjoner

- **Reparasjoner** – registrer kunde, enhet, problem, kategori, prioritet, pris og varighet
- **Teknikere** – navn, spesialiteter (iPhone, Samsung, Laptop …), kapasitet og egen arbeidstid
- **Automatisk fordeling** – ett klikk fordeler alle ufordelte jobber:
  - Reparasjoner med høyest prioritet fordeles først
  - Velger tekniker med riktig spesialitet
  - **Balanserer inntjeningen** – neste jobb går til den som har tjent minst
    denne måneden, slik at alle teknikere ender likt over tid
  - Respekterer kapasitet
- **Kalender** – hver fordelt jobb planlegges automatisk inn på første ledige
  tidspunkt i teknikerens eget arbeidsvindu (søndager hoppes over). Egen
  kalenderfane i appen + `.ics`-abonnement per tekniker for Google/Apple/Outlook
- **Arbeidstid med mandagsregel** – teknikeren velger sitt tidsrom for dagen;
  endringer kan gjøres hver mandag (endringer andre dager trer i kraft
  førstkommende mandag)
- **Varsler** – teknikeren velger «Jeg er …» og aktiverer varsler; når en jobb
  tildeles i deres tidsrom dyttes et nettleservarsel i sanntid (SSE)
- **Kanban-tavle** – dra og slipp kort mellom Mottatt → Tildelt → Under arbeid → Ferdig → Levert
- **Dashbord** – nøkkeltall, arbeidsmengde og månedsinntjening per tekniker
- **Lokal lagring** – data lagres i `data/db.json` (ingen database å sette opp)

## Kom i gang

```bash
npm install        # installer avhengigheter (kun Express)
npm run seed       # (valgfritt) legg inn eksempeldata
npm start          # start appen
```

Åpne deretter **http://localhost:3000** i nettleseren.

> Vil du starte uten eksempeldata? Hopp over `npm run seed` – appen starter da tom.

## Bruk

1. Gå til **Teknikere** og legg inn de ansatte med spesialiteter og kapasitet.
2. På **Tavle**, trykk **+ Ny reparasjon** for hver innkommende jobb.
3. Trykk **⚡ Fordel automatisk** – jobbene fordeles til teknikerne.
4. Dra kortene videre etter hvert som arbeidet går fremover.

## Test

```bash
npm test
```

Tester dekker kjernelogikken for fordeling (spesialitet, kapasitet, prioritet, balansering).

## Teknisk

- **Backend:** Node.js + Express, REST-API under `/api`
- **Frontend:** Ren HTML/CSS/JavaScript – ingen byggesteg
- **Lagring:** JSON-fil med atomisk skriving (`src/store.js`)
- **Fordelingslogikk:** `src/distribution.js` (ren, testbar funksjon)

### Mappestruktur

```
server.js              HTTP-server, API-ruter, SSE-varsler og ICS-kalenderfeed
src/
  distribution.js      Algoritme for å fordele reparasjoner (inntektsbalansert)
  scheduling.js        Finner ledige tidspunkt i teknikerens arbeidsdag
  repository.js        Forretningslogikk (teknikere, reparasjoner, kalender)
  store.js             Datalagring i JSON-fil
  seed.js              Eksempeldata
public/                Frontend (index.html, app.js, styles.css)
test/                  Tester
```

### Om varslene

Varslene bruker Server-Sent Events + nettleserens Notification-API: teknikeren
åpner appen (også i en bakgrunnsfane), velger seg selv under «Teknikere» og
trykker «Aktiver varsler». Ekte push til mobil når appen er helt lukket krever
at appen publiseres på en offentlig HTTPS-adresse (f.eks. Render) — si ifra om
du vil ha det, så legges Web Push (VAPID) til.

### Miljøvariabler

| Variabel   | Standard        | Beskrivelse              |
|------------|-----------------|--------------------------|
| `PORT`     | `3000`          | Port serveren lytter på  |
| `DATA_DIR` | `./data`        | Hvor `db.json` lagres    |
