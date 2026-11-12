// Guarda la app para que abra sin internet. Cambie VERSION cada vez que publique cambios.
const VERSION = 'alcancia-v17';
const ARCHIVOS = ['./', 'index.html', 'estilos.css', 'logica.js', 'nube.js', 'app.js', 'manifest.webmanifest', 'icono.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la red (para recibir cambios); si no hay internet, lo guardado.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Solo se guardan los archivos de la app y la librería del CDN; la base de datos siempre va directo.
  if (url.origin !== self.location.origin && url.hostname !== 'cdn.jsdelivr.net') return;
  e.respondWith(
    // no-cache: siempre pregunta al servidor si hay versión nueva (GitHub guarda 10 min si no)
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        const copia = r.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
