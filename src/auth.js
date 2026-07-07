// Enkel passordbeskyttelse med signert cookie – ingen ekstra avhengigheter.
// Aktiveres kun når miljøvariabelen APP_PASSWORD er satt.

import crypto from 'node:crypto';

const PASSWORD = process.env.APP_PASSWORD || '';
const SECRET = process.env.APP_SECRET || PASSWORD || 'reparasjons-app-secret';

export const authEnabled = Boolean(PASSWORD);

// Token som legges i cookien. Kan ikke forfalskes uten å kjenne passordet/hemmeligheten.
function token() {
  return crypto.createHmac('sha256', SECRET).update('v1:' + PASSWORD).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function isAuthed(req) {
  if (!authEnabled) return true;
  return parseCookies(req).ra_auth === token();
}

// Beskytt alt bortsett fra selve innloggingen.
export function guard(req, res, next) {
  if (!authEnabled) return next();
  if (req.path === '/login' || req.path === '/api/login' || req.path === '/api/logout') return next();
  if (isAuthed(req)) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Ikke innlogget' });
  return res.redirect('/login');
}

export function login(req, res) {
  const { password } = req.body || {};
  if (PASSWORD && password === PASSWORD) {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.set('Set-Cookie', `ra_auth=${token()}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax${secure ? '; Secure' : ''}`);
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Feil passord' });
}

export function logout(req, res) {
  res.set('Set-Cookie', 'ra_auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ ok: true });
}
