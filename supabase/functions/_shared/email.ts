// E-post via Resend. Ikke-fatal: feil her skal ikke miste bookingen.

const RESEND_API = 'https://api.resend.com/emails';

interface SendArgs {
  til: string;
  emne: string;
  html: string;
}

async function sendEpost({ til, emne, html }: SendArgs): Promise<void> {
  const key = Deno.env.get('RESEND_API_KEY');
  const fra = Deno.env.get('FROM_EMAIL') ?? 'Fixiphone <booking@fixiphone.no>';
  if (!key) {
    console.warn('RESEND_API_KEY mangler — hopper over e-post');
    return;
  }
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fra, to: til, subject: emne, html }),
  });
  if (!res.ok) {
    console.error('Resend-feil', res.status, await res.text());
  }
}

interface Kvittering {
  ordrenummer: string;
  kunde_navn: string;
  modell: string;
  feiltyper: string[];
  onsket_tidspunkt: string | null;
  totalpris: number;
  telefon: string;
  epost: string;
  kommentar: string | null;
}

/** Bekreftelse til kunden. */
export async function sendKundeBekreftelse(k: Kvittering): Promise<void> {
  const html = `
    <div style="font-family:Poppins,Arial,sans-serif;color:#1a1a1a;max-width:520px">
      <h2 style="color:#2b7de9;margin:0 0 8px">Takk for din bestilling!</h2>
      <p>Hei ${escapeHtml(k.kunde_navn)}, vi har mottatt forespørselen din.</p>
      <table style="border-collapse:collapse;width:100%;margin:16px 0">
        <tr><td style="padding:6px 0"><b>Ordrenummer</b></td><td>${k.ordrenummer}</td></tr>
        <tr><td style="padding:6px 0"><b>Modell</b></td><td>${escapeHtml(k.modell)}</td></tr>
        <tr><td style="padding:6px 0"><b>Reparasjon</b></td><td>${k.feiltyper.map(escapeHtml).join(', ')}</td></tr>
        <tr><td style="padding:6px 0"><b>Ønsket tidspunkt</b></td><td>${escapeHtml(k.onsket_tidspunkt ?? 'Ikke oppgitt')}</td></tr>
        <tr><td style="padding:6px 0"><b>Estimert pris</b></td><td>${k.totalpris} kr</td></tr>
      </table>
      <p>Vi tar kontakt for å bekrefte tidspunkt. Har du spørsmål, svar på denne e-posten
      eller ring oss.</p>
      <p style="color:#666;font-size:13px">Fixiphone – Kristiansand</p>
    </div>`;
  await sendEpost({ til: k.epost, emne: `Bekreftelse ${k.ordrenummer} – Fixiphone`, html });
}

/** Varsel til verkstedet om ny booking. */
export async function sendVerkstedVarsel(k: Kvittering, tildeltNavn: string | null): Promise<void> {
  const verksted = Deno.env.get('WORKSHOP_EMAIL') ?? 'kontakt@fixiphone.no';
  const html = `
    <div style="font-family:Poppins,Arial,sans-serif;color:#1a1a1a;max-width:520px">
      <h2 style="color:#2b7de9;margin:0 0 8px">Ny booking: ${k.ordrenummer}</h2>
      <table style="border-collapse:collapse;width:100%;margin:12px 0">
        <tr><td style="padding:4px 0"><b>Kunde</b></td><td>${escapeHtml(k.kunde_navn)}</td></tr>
        <tr><td style="padding:4px 0"><b>Telefon</b></td><td>${escapeHtml(k.telefon)}</td></tr>
        <tr><td style="padding:4px 0"><b>E-post</b></td><td>${escapeHtml(k.epost)}</td></tr>
        <tr><td style="padding:4px 0"><b>Modell</b></td><td>${escapeHtml(k.modell)}</td></tr>
        <tr><td style="padding:4px 0"><b>Reparasjon</b></td><td>${k.feiltyper.map(escapeHtml).join(', ')}</td></tr>
        <tr><td style="padding:4px 0"><b>Ønsket tid</b></td><td>${escapeHtml(k.onsket_tidspunkt ?? 'Ikke oppgitt')}</td></tr>
        <tr><td style="padding:4px 0"><b>Estimert pris</b></td><td>${k.totalpris} kr</td></tr>
        <tr><td style="padding:4px 0"><b>Tildelt</b></td><td>${escapeHtml(tildeltNavn ?? 'Ikke tildelt – må fordeles manuelt')}</td></tr>
        <tr><td style="padding:4px 0"><b>Kommentar</b></td><td>${escapeHtml(k.kommentar ?? '')}</td></tr>
      </table>
    </div>`;
  await sendEpost({ til: verksted, emne: `Ny booking ${k.ordrenummer}`, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
