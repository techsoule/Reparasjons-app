import { describe, it, expect } from 'vitest';
import {
  fordelJobb,
  nesteForTur,
  VEKT_KRONER,
  VEKT_MINUTTER,
  type TechnicianInput,
} from './allocation';

// Hjelper for å bygge en reparatør med fornuftige standardverdier
function tech(over: Partial<TechnicianInput> & { id: string }): TechnicianInput {
  return {
    navn: over.id,
    aktiv: true,
    total_kroner: 0,
    total_minutter: 0,
    sist_tildelt: null,
    utilgjengelig: false,
    ...over,
  };
}

describe('fordelJobb — grunnleggende', () => {
  it('tildeler til den med lavest score', () => {
    const t = [
      tech({ id: 'a', total_kroner: 1000, total_minutter: 100 }),
      tech({ id: 'b', total_kroner: 200, total_minutter: 20 }), // lavest
      tech({ id: 'c', total_kroner: 600, total_minutter: 60 }),
    ];
    const res = fordelJobb(t);
    expect(res.valgt_technician_id).toBe('b');
  });

  it('lager score_snapshot for ALLE tre (tillitsmekanisme)', () => {
    const t = [
      tech({ id: 'a', total_kroner: 1000 }),
      tech({ id: 'b', total_kroner: 500 }),
      tech({ id: 'c', total_kroner: 0 }),
    ];
    const res = fordelJobb(t);
    expect(res.score_snapshot).toHaveLength(3);
    for (const rad of res.score_snapshot) {
      expect(rad).toHaveProperty('score');
      expect(rad).toHaveProperty('norm_kroner');
      expect(rad).toHaveProperty('norm_minutter');
    }
    // begrunnelse skal være ikke-tom og nevne vinneren
    expect(res.begrunnelse.length).toBeGreaterThan(0);
    expect(res.begrunnelse).toContain('c');
  });

  it('bruker vekting 0.6 kroner / 0.4 minutter', () => {
    // a: mye kroner, lite tid. b: lite kroner, mye tid.
    // Normalisert: a = (1, 0), b = (0, 1)
    // score_a = 0.6, score_b = 0.4 → b vinner (lavere)
    const t = [
      tech({ id: 'a', total_kroner: 1000, total_minutter: 0 }),
      tech({ id: 'b', total_kroner: 0, total_minutter: 1000 }),
    ];
    const res = fordelJobb(t);
    const a = res.score_snapshot.find((s) => s.technician_id === 'a')!;
    const b = res.score_snapshot.find((s) => s.technician_id === 'b')!;
    expect(a.score).toBeCloseTo(VEKT_KRONER, 6);
    expect(b.score).toBeCloseTo(VEKT_MINUTTER, 6);
    expect(res.valgt_technician_id).toBe('b');
  });
});

describe('fordelJobb — kanttilfelle: ny reparatør uten historikk', () => {
  it('ny reparatør (alle nuller) får jobben foran erfarne', () => {
    const t = [
      tech({ id: 'erfaren1', total_kroner: 5000, total_minutter: 400 }),
      tech({ id: 'erfaren2', total_kroner: 4000, total_minutter: 350 }),
      tech({ id: 'ny', total_kroner: 0, total_minutter: 0 }), // score 0
    ];
    const res = fordelJobb(t);
    expect(res.valgt_technician_id).toBe('ny');
  });

  it('alle uten historikk → score 0 for alle, ingen deling på null', () => {
    const t = [
      tech({ id: 'a' }),
      tech({ id: 'b' }),
      tech({ id: 'c' }),
    ];
    const res = fordelJobb(t);
    for (const rad of res.score_snapshot) {
      expect(rad.score).toBe(0);
      expect(Number.isNaN(rad.score)).toBe(false);
    }
    // med helt lik score (0) og alle sist_tildelt=null faller valget
    // deterministisk på id → 'a'
    expect(res.valgt_technician_id).toBe('a');
  });
});

describe('fordelJobb — kanttilfelle: lik score', () => {
  it('ved lik score velges den som lengst tid siden sist fikk jobb', () => {
    const t = [
      tech({ id: 'a', total_kroner: 500, total_minutter: 50, sist_tildelt: '2026-07-20T10:00:00Z' }),
      tech({ id: 'b', total_kroner: 500, total_minutter: 50, sist_tildelt: '2026-07-01T10:00:00Z' }), // eldst
      tech({ id: 'c', total_kroner: 500, total_minutter: 50, sist_tildelt: '2026-07-15T10:00:00Z' }),
    ];
    const res = fordelJobb(t);
    expect(res.valgt_technician_id).toBe('b');
    expect(res.begrunnelse).toContain('Lik score');
  });

  it('sist_tildelt = null (aldri) vinner tie-break over de som har fått jobb', () => {
    const t = [
      tech({ id: 'a', total_kroner: 300, total_minutter: 30, sist_tildelt: '2026-07-01T10:00:00Z' }),
      tech({ id: 'b', total_kroner: 300, total_minutter: 30, sist_tildelt: null }), // aldri → vinner
    ];
    const res = fordelJobb(t);
    expect(res.valgt_technician_id).toBe('b');
  });

  it('helt lik score og lik sist_tildelt → deterministisk på id', () => {
    const t = [
      tech({ id: 'b2', total_kroner: 100, sist_tildelt: '2026-07-10T10:00:00Z' }),
      tech({ id: 'a1', total_kroner: 100, sist_tildelt: '2026-07-10T10:00:00Z' }),
    ];
    const res1 = fordelJobb(t);
    const res2 = fordelJobb([...t].reverse());
    expect(res1.valgt_technician_id).toBe('a1');
    expect(res2.valgt_technician_id).toBe('a1'); // uavhengig av rekkefølge
  });
});

describe('fordelJobb — kanttilfelle: utilgjengelighet', () => {
  it('hopper over reparatør som er utilgjengelig på jobbdatoen', () => {
    const t = [
      tech({ id: 'a', total_kroner: 0, total_minutter: 0, utilgjengelig: true }), // lavest, men utilgjengelig
      tech({ id: 'b', total_kroner: 500, total_minutter: 50 }),
      tech({ id: 'c', total_kroner: 800, total_minutter: 80 }),
    ];
    const res = fordelJobb(t);
    expect(res.valgt_technician_id).toBe('b');
    // a skal fortsatt være med i snapshot, men markert ikke-kvalifisert
    const a = res.score_snapshot.find((s) => s.technician_id === 'a')!;
    expect(a.kvalifisert).toBe(false);
    expect(a.utilgjengelig).toBe(true);
  });

  it('utilgjengelig reparatør med høye tall forskyver ikke normaliseringen', () => {
    // 'stor' er utilgjengelig med enorme tall; skal ikke påvirke skalaen
    const t = [
      tech({ id: 'stor', total_kroner: 100000, total_minutter: 9000, utilgjengelig: true }),
      tech({ id: 'a', total_kroner: 200, total_minutter: 20 }),
      tech({ id: 'b', total_kroner: 400, total_minutter: 40 }),
    ];
    const res = fordelJobb(t);
    const a = res.score_snapshot.find((s) => s.technician_id === 'a')!;
    // maks blant kvalifiserte er b (400/40), så a normaliseres mot det → 0.5
    expect(a.norm_kroner).toBeCloseTo(0.5, 6);
    expect(res.valgt_technician_id).toBe('a');
  });

  it('ALLE utilgjengelige → ingen tildeling, tydelig begrunnelse', () => {
    const t = [
      tech({ id: 'a', utilgjengelig: true }),
      tech({ id: 'b', utilgjengelig: true }),
      tech({ id: 'c', utilgjengelig: true }),
    ];
    const res = fordelJobb(t);
    expect(res.valgt_technician_id).toBeNull();
    expect(res.begrunnelse.toLowerCase()).toContain('ingen kvalifiserte');
    // snapshot skal fortsatt inneholde alle tre
    expect(res.score_snapshot).toHaveLength(3);
  });
});

describe('fordelJobb — kanttilfelle: inaktive', () => {
  it('inaktiv reparatør utelates som kandidat', () => {
    const t = [
      tech({ id: 'a', total_kroner: 0, aktiv: false }), // lavest, men inaktiv
      tech({ id: 'b', total_kroner: 500 }),
    ];
    const res = fordelJobb(t);
    expect(res.valgt_technician_id).toBe('b');
    const a = res.score_snapshot.find((s) => s.technician_id === 'a')!;
    expect(a.kvalifisert).toBe(false);
  });

  it('ingen aktive i det hele tatt → null', () => {
    const t = [tech({ id: 'a', aktiv: false }), tech({ id: 'b', aktiv: false })];
    const res = fordelJobb(t);
    expect(res.valgt_technician_id).toBeNull();
  });

  it('tomt utvalg → null', () => {
    const res = fordelJobb([]);
    expect(res.valgt_technician_id).toBeNull();
    expect(res.score_snapshot).toHaveLength(0);
  });
});

describe('nesteForTur', () => {
  it('returnerer den som står for tur uten å tildele', () => {
    const t = [
      tech({ id: 'a', total_kroner: 1000 }),
      tech({ id: 'b', total_kroner: 100 }),
      tech({ id: 'c', total_kroner: 500 }),
    ];
    const neste = nesteForTur(t);
    expect(neste?.technician_id).toBe('b');
  });

  it('returnerer null når ingen kvalifiserer', () => {
    const t = [tech({ id: 'a', utilgjengelig: true })];
    expect(nesteForTur(t)).toBeNull();
  });
});

describe('realistisk scenario — jevn fordeling over tid', () => {
  it('fordeler ~jevnt når jobber tildeles etter hverandre', () => {
    // Simuler 30 like jobber (arbeidspris 800, 45 min) tildelt sekvensielt.
    const state = [
      tech({ id: 'a' }),
      tech({ id: 'b' }),
      tech({ id: 'c' }),
    ];
    const antall: Record<string, number> = { a: 0, b: 0, c: 0 };
    let klokke = Date.parse('2026-07-01T08:00:00Z');

    for (let i = 0; i < 30; i++) {
      const res = fordelJobb(state);
      const valgt = res.valgt_technician_id!;
      antall[valgt]++;
      const idx = state.findIndex((s) => s.id === valgt);
      state[idx] = {
        ...state[idx],
        total_kroner: state[idx].total_kroner + 800,
        total_minutter: state[idx].total_minutter + 45,
        sist_tildelt: klokke,
      };
      klokke += 3600_000; // +1 time
    }

    // Perfekt jevnt = 10 hver. Tillat maks 1 avvik.
    for (const id of ['a', 'b', 'c']) {
      expect(antall[id]).toBeGreaterThanOrEqual(9);
      expect(antall[id]).toBeLessThanOrEqual(11);
    }
  });
});
