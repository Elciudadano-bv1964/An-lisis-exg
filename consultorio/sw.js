/* Memoria interna de la app: abre sin señal y se actualiza sola en segundo plano cuando hay internet.
   La página se pide primero a internet (siempre la última versión); si no hay señal o tarda, se usa la copia guardada.
   No toca los avisos de telemonitoreo (servidor de avisos), que van directo a internet. */
const CACHE = 'consultorio-v1.0.0';
const BASE = ['./', './index.html', './version.json', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('consultorio-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
function guardar(req, res) { if (res && res.ok && res.type === 'basic') { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); } return res; }
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin || !u.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  if (r.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('.html')) {
    // primero internet (última versión), con 4 s de espera; sin señal, la copia guardada
    e.respondWith(new Promise(ok => {
      let listo = false; const usarCopia = () => caches.match(r, { ignoreSearch: true }).then(c => c || caches.match('./index.html')).then(c => { if (c && !listo) { listo = true; ok(c); } });
      const t = setTimeout(usarCopia, 4000);
      fetch(r).then(res => { clearTimeout(t); guardar(r, res); if (!listo) { listo = true; ok(res); } }).catch(() => { clearTimeout(t); usarCopia().then(() => { if (!listo) { listo = true; ok(new Response('Sin conexión', { status: 503 })); } }); });
    })); return; }
  if (u.pathname.endsWith('/version.json')) { e.respondWith(fetch(r, { cache: 'no-store' }).then(res => guardar(r, res)).catch(() => caches.match(r))); return; }   // el número de versión siempre se consulta a internet
  // íconos y manifiesto: copia guardada al instante y se renueva en segundo plano
  e.respondWith(caches.match(r).then(c => { const red = fetch(r).then(res => guardar(r, res)).catch(() => c); return c || red; }));
});

// descarga completa de la versión nueva en segundo plano (pedida por la página cuando hay wifi); se usa al reabrir
self.addEventListener('message', e => { if (!e.data || e.data.tipo !== 'descargar') return; const puerto = e.ports && e.ports[0];
  caches.open(CACHE).then(c => Promise.all(BASE.map(u => fetch(new Request(u, { cache: 'reload' })).then(res => { if (res.ok) return c.put(u, res); throw new Error(u); }))))
    .then(() => puerto && puerto.postMessage({ ok: true })).catch(() => puerto && puerto.postMessage({ ok: false })); });
