// Etterbehandler web-bygget (dist/) til en installerbar PWA:
//  - kopierer app-ikoner
//  - skriver manifest + service worker
//  - injiserer iOS-meta-tagger og SW-registrering i index.html
// Kjøres av «npm run build:web» etter «expo export -p web».
const fs = require('fs');
const path = require('path');

const dist = path.resolve(__dirname, '..', 'dist');
const assets = path.resolve(__dirname, '..', 'assets');

if (!fs.existsSync(dist)) {
  console.error('Fant ikke dist/ — kjør «expo export -p web» først.');
  process.exit(1);
}

// 1. Kopier ikoner til dist-rot
for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  fs.copyFileSync(path.join(assets, f), path.join(dist, f));
}

// 2. Web-manifest
const manifest = {
  name: 'Fixiphone',
  short_name: 'Fixiphone',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#ffffff',
  theme_color: '#2b7de9',
  lang: 'no',
  description: 'Intern reparasjons-app for Fixiphone',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// 3. Enkel service worker (kreves for «installerbar» app; nettverk-først)
const sw = `self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* nettverk-først, ingen caching av JS */ });
`;
fs.writeFileSync(path.join(dist, 'sw.js'), sw);

// 4. Injiser i index.html
const indexPath = path.join(dist, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const head = `
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Fixiphone" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
`;
const swReg = `
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
      }
    </script>
`;

if (!html.includes('apple-mobile-web-app-capable')) {
  html = html.replace('</head>', head + '  </head>');
}
if (!html.includes("serviceWorker")) {
  html = html.replace('</body>', swReg + '  </body>');
}
fs.writeFileSync(indexPath, html);

console.log('PWA-etterbehandling ferdig:', dist);
