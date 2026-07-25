// CORS — kun tillatte opphav (fixiphone.no og ipimp.no, med/uten www)
const TILLATTE_OPPHAV = [
  'https://fixiphone.no',
  'https://www.fixiphone.no',
  'https://ipimp.no',
  'https://www.ipimp.no',
];

export function corsHeaders(origin: string | null): Record<string, string> {
  const tillatt = origin && TILLATTE_OPPHAV.includes(origin) ? origin : TILLATTE_OPPHAV[0];
  return {
    'Access-Control-Allow-Origin': tillatt,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}
