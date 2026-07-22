# FiXiPhone — nettside

Nettside for **fixiphone.no** — rask og trygg mobilreparasjon i Oslo
(iPhone, Samsung, iPad m.m.).

Statisk nettside bygget med ren HTML, CSS og JavaScript — ingen
byggeprosess eller avhengigheter. Kan hostes hvor som helst (GitHub Pages,
Netlify, Vercel, egen webserver).

## Struktur

```
.
├── index.html          # Hele nettsiden (én side, seksjonsbasert)
├── css/styles.css      # All styling (responsiv, mørk header + lyse seksjoner)
├── js/main.js          # Mobilmeny, prisfaner, skjemavalidering, animasjoner
├── assets/favicon.svg  # Favikon / logo
├── robots.txt
└── sitemap.xml
```

## Innhold på siden

- **Hero** med tydelig verdiforslag og CTA
- **Tillitslinje** med nøkkeltall
- **Tjenester** (skjerm, batteri, ladeport, kamera, vannskade m.m.)
- **Priser** med faner for iPhone / Samsung / iPad
- **Slik fungerer det** — 4 steg
- **Hvorfor FiXiPhone** + garantibadge
- **Anmeldelser**
- **FAQ** (accordion)
- **Kontakt/bestilling** med skjema (mailto-fallback uten backend)

## Kjøre lokalt

Åpne `index.html` direkte i nettleseren, eller start en enkel server:

```bash
python3 -m http.server 8000
# åpne http://localhost:8000
```

## Tilpasse

- **Kontaktinfo, adresse, åpningstider:** rediger i `index.html`
  (seksjonen `#kontakt` og `footer`) samt structured data i `<head>`.
- **Priser:** rediger `prices`-objektet øverst i `js/main.js`.
- **Farger/typografi:** juster CSS-variablene i `:root` i `css/styles.css`.

## Skjema

Kontaktskjemaet bruker en `mailto:`-fallback slik at siden fungerer uten
server. For ekte skjemainnsending kan du koble til en tjeneste som
Formspree, Netlify Forms eller et eget API i `js/main.js`.
