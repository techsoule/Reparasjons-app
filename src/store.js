// Enkel, robust datalagring i JSON-fil (ingen native avhengigheter).
// Skriver atomisk (temp-fil + rename) slik at data ikke korrumperes ved krasj.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const DATA_FILE = join(DATA_DIR, 'db.json');

const EMPTY = { technicians: [], repairs: [], counters: { technician: 0, repair: 0, ticket: 1000 } };

function load() {
  if (!existsSync(DATA_FILE)) return structuredClone(EMPTY);
  try {
    const raw = readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

let state = load();

function persist() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, DATA_FILE);
}

export function getState() {
  return state;
}

export function save(mutator) {
  const result = mutator(state);
  persist();
  return result;
}

export function nextId(kind) {
  state.counters[kind] = (state.counters[kind] || 0) + 1;
  return state.counters[kind];
}

export function nextTicket() {
  state.counters.ticket = (state.counters.ticket || 1000) + 1;
  return 'R-' + state.counters.ticket;
}

// Kun for tester: nullstill i minnet.
export function _resetForTests() {
  state = structuredClone(EMPTY);
}
