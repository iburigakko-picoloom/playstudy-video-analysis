// Retire only this legacy registration. Other PlayStudy installs share storage.
// Do not navigate live clients: doing so can interrupt startup on Android.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister());
});
