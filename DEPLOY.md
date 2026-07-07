# 🚀 Ta appen «live» – steg for steg

Denne guiden tar deg fra kode til en fungerende nettadresse du kan bruke på PC
og mobil i verkstedet. Anbefalt vei er **Render** – enklest for en fast adresse
med trygg lagring. Regn med ca. 10 minutter.

> **Viktig om data:** Appen lagrer alt i en fil (`data/db.json`). På gratis-planer
> slettes filsystemet ved hver omstart, og da mister du data. Derfor bruker
> oppsettet under en **persistent disk** (Render Starter, ca. US$7/mnd). Det er
> forskjellen på «en demo» og «et system bedriften kan stole på».

---

## Alternativ A – Render (anbefalt)

### 1. Lag konto
Gå til [render.com](https://render.com) og registrer deg (logg gjerne inn med
GitHub-kontoen som eier `techsoule/reparasjons-app`).

### 2. Opprett tjenesten fra repoet
- Trykk **New +** → **Blueprint**.
- Velg repoet **techsoule/reparasjons-app** og branchen du vil bruke.
- Render leser `render.yaml` automatisk og setter opp alt (Node, disk, helsesjekk).
- Trykk **Apply**.

### 3. Sett passordet
- Åpne tjenesten → fanen **Environment**.
- Ved `APP_PASSWORD`: skriv inn et passord dere deler på verkstedet (f.eks. et
  langt uttrykk bare dere kjenner). Trykk **Save Changes**.
- Tjenesten bygger på nytt automatisk.

### 4. Ferdig
- Etter et par minutter får du en adresse som `https://reparasjons-app.onrender.com`.
- Åpne den, logg inn med passordet, og legg til teknikere + reparasjoner.
- På mobilen: åpne adressen i nettleseren og trykk **«Legg til på hjemskjerm»**,
  så oppfører den seg som en app-ikon.

---

## Alternativ B – Railway (også enkelt, med volum)

1. Gå til [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Velg repoet. Railway bruker `Dockerfile` automatisk.
3. Under **Variables**, legg til:
   - `APP_PASSWORD` = ditt passord
   - `DATA_DIR` = `/data`
4. Under **Settings → Volumes**: legg til et volum montert på `/data`
   (så data ikke slettes).
5. Trykk **Deploy**, og åpne den genererte adressen.

---

## Alternativ C – Egen server / VPS (mest kontroll)

```bash
git clone https://github.com/techsoule/reparasjons-app.git
cd reparasjons-app
npm install
export APP_PASSWORD="ditt-passord"
export DATA_DIR="/var/lib/reparasjons-app"   # en mappe som ikke slettes
npm start
```

Sett gjerne opp en `systemd`-tjeneste + en reverse proxy (Caddy/Nginx) med
HTTPS. Eller bruk Docker:

```bash
docker build -t reparasjons-app .
docker run -d -p 80:3000 \
  -e APP_PASSWORD="ditt-passord" \
  -v reparasjonsdata:/data \
  --name reparasjons-app reparasjons-app
```

---

## Personvern (GDPR)

Appen lagrer kundenavn og telefonnummer. Når den ligger på nett:

- **Ha alltid `APP_PASSWORD` satt** – da kreves innlogging.
- Bruk HTTPS (Render/Railway gir dette automatisk).
- Slett reparasjoner dere ikke lenger trenger.
- Ta gjerne jevnlig sikkerhetskopi av `data/db.json` (last den ned fra serveren).

## Sikkerhetskopi

Hele databasen er én fil. På Render/Railway kan du laste den ned via
disk-/volum-verktøyene, eller kopiere `data/db.json` fra serveren. Legg den et
trygt sted med jevne mellomrom.
