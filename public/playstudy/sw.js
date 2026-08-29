const LEGACY_CACHES = /^playstudy-(?:v|shell-v)\d+(?:-|$)/;
const ROOT_CACHE_TO_KEEP = 'playstudy-shell-v26';
const APP_ROOT = new URL('../', self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== ROOT_CACHE_TO_KEEP && LEGACY_CACHES.test(key)).map((key) => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.map((client) => client.navigate(APP_ROOT)));
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => Response.redirect(APP_ROOT, 302)));
});
