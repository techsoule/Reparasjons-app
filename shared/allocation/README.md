# Fordelingsalgoritme

Ren, frittstående TypeScript-modul uten avhengigheter. Deles mellom
Supabase Edge Function (Deno) og appen (React Native).

## Slik virker den

For hver **aktiv** reparatør beregnes rullerende sum siste 30 dager:
`total_kroner` (arbeidspris) og `total_minutter` (estimert tid). Disse
sendes inn — modulen er ren og gjør ingen databasekall.

1. Filtrer bort inaktive og reparatører markert utilgjengelig på jobbdatoen.
2. Normaliser `total_kroner` og `total_minutter` til 0–1 (mot maks blant de
   **kvalifiserte**, så en utilgjengelig storjobber ikke forskyver skalaen).
3. `score = norm_kroner × 0.6 + norm_minutter × 0.4`.
4. Ny jobb går til **lavest** score.
5. **Tie-break** ved lik score: den som lengst tid siden sist fikk jobb
   (`sist_tildelt`); `null` (aldri) vinner. Helt likt → deterministisk på id.
6. Returnerer alltid en **`score_snapshot`** for *alle* reparatører +
   en norsk **`begrunnelse`** — dette lagres i `assignment_log` og er
   tillitsmekanismen i appen.

Hvis ingen kvalifiserer (alle inaktive/utilgjengelige) returneres
`valgt_technician_id: null` med begrunnelse om at jobben må tildeles manuelt.

## API

```ts
import { fordelJobb, nesteForTur } from './allocation';

const res = fordelJobb(technicians); // AllocationResult
// res.valgt_technician_id | res.begrunnelse | res.score_snapshot

const neste = nesteForTur(technicians); // hvem står for tur (uten å tildele)
```

## Tester

```bash
npm test          # kjører vitest én gang
npm run test:watch
```

Dekker kanttilfellene: alle utilgjengelige, lik score, ny reparatør uten
historikk, inaktive, tomt utvalg, samt et sekvensielt scenario som
verifiserer jevn fordeling (~10/10/10 over 30 jobber).
