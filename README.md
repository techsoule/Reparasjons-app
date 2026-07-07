# 🔧 Reparasjons-app

Et enkelt fordelingssystem for reparasjonsverksted. Registrer innkommende
reparasjoner, legg inn teknikerne dine, og la appen **fordele jobbene automatisk**
etter spesialitet og arbeidsmengde. Følg opp alt på en Kanban-tavle.

## Funksjoner

- **Reparasjoner** – registrer kunde, enhet, problem, kategori og prioritet (lav → haster)
- **Teknikere** – navn, spesialiteter (iPhone, Samsung, Laptop …), kapasitet og aktiv/inaktiv
- **Automatisk fordeling** – ett klikk fordeler alle ufordelte jobber:
  - Reparasjoner med høyest prioritet fordeles først
  - Velger tekniker med riktig spesialitet
  - Balanserer arbeidsmengden og respekterer kapasitet
- **Kanban-tavle** – dra og slipp kort mellom Mottatt → Tildelt → Under arbeid → Ferdig → Levert
- **Dashbord** – nøkkeltall og arbeidsmengde per tekniker
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
server.js              HTTP-server og API-ruter
src/
  distribution.js      Algoritme for å fordele reparasjoner
  repository.js        Forretningslogikk (teknikere, reparasjoner)
  store.js             Datalagring i JSON-fil
  seed.js              Eksempeldata
public/                Frontend (index.html, app.js, styles.css)
test/                  Tester
```

### Miljøvariabler

| Variabel   | Standard        | Beskrivelse              |
|------------|-----------------|--------------------------|
| `PORT`     | `3000`          | Port serveren lytter på  |
| `DATA_DIR` | `./data`        | Hvor `db.json` lagres    |
