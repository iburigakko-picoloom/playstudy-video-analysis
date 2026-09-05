const SCOPE_URL = new URL(self.registration.scope);
// Cache Storage is shared by all PWAs on an origin, even with different scopes.
const CACHE_PREFIX = `playstudy-shell-${encodeURIComponent(SCOPE_URL.pathname)}-`;
const CACHE_NAME = `${CACHE_PREFIX}v34`;
const scopedUrl = (path = "") => new URL(path.replace(/^\//, ""), SCOPE_URL).toString();
const SHELL_URL = scopedUrl("playstudy/index.html");
const APP_SHELL = [
  SHELL_URL,
  scopedUrl("manifest.webmanifest"),
  scopedUrl("pwa.js?v=34"),
  scopedUrl("playstudy/styles.css?v=34"),
  scopedUrl("playstudy/player-gestures.js?v=34"),
  scopedUrl("playstudy/app.js?v=34"),
  scopedUrl("playstudy/icons/icon-192.png"),
  scopedUrl("playstudy/icons/icon-512.png"),
  scopedUrl("playstudy/icons/icon-maskable-512.png"),
  scopedUrl("playstudy/icons/apple-touch-icon.png")
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll is atomic and rejects duplicate requests. Only activate a complete shell.
    await cache.addAll(APP_SHELL.map((url) => new Request(url, {
      cache: "reload", credentials: "same-origin"
    })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.registration.navigationPreload?.disable();
    await self.clients.claim();
  })());
});

async function appNavigation() {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(SHELL_URL);
  if (cached) return cached;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(new Request(SHELL_URL, { cache: "reload", signal: controller.signal }));
    if (!response.ok) throw new Error(`Navigation failed with ${response.status}`);
    return response;
  } catch {
    return new Response(
      '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PlayStudy</title><body><main><h1>PlayStudy</h1><p>起動に必要なデータを読み込めませんでした。通信を確認して再度開いてください。</p><a href="">もう一度開く</a></main></body></html>',
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } finally {
    clearTimeout(timeout);
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE_URL.origin) return;
  const relativePath = url.pathname.startsWith(SCOPE_URL.pathname)
    ? url.pathname.slice(SCOPE_URL.pathname.length) : null;
  // Root-scoped historical installs must not intercept the project-scoped PWA.
  if (request.mode === "navigate" && ["", "index.html", "launch", "launch/", "launch/index.html", "playstudy", "playstudy/", "playstudy/index.html"].includes(relativePath)) {
    event.respondWith(appNavigation());
    return;
  }
  if (APP_SHELL.includes(url.toString())) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      // Keep HTML and versioned assets together until the next worker installs.
      return (await cache.match(request)) || fetch(request);
    })());
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
