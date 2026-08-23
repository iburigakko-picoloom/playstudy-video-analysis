const CACHE_PREFIX = "playstudy-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v22`;
const SCOPE_URL = new URL(self.registration.scope);
const scopedUrl = (path = "") => new URL(path.replace(/^\//, ""), SCOPE_URL).toString();
const ROOT_URL = scopedUrl("");
const SHELL_URL = scopedUrl("launch/");
const APP_SHELL = [
  SHELL_URL,
  ROOT_URL,
  scopedUrl("manifest.webmanifest"),
  scopedUrl("pwa.js?v=22"),
  scopedUrl("playstudy/styles.css?v=22"),
  scopedUrl("playstudy/player-gestures.js?v=22"),
  scopedUrl("playstudy/app.js?v=22"),
  scopedUrl("playstudy/icons/icon-192.png"),
  scopedUrl("playstudy/icons/icon-512.png"),
  scopedUrl("playstudy/icons/icon-maskable-512.png"),
  scopedUrl("playstudy/icons/apple-touch-icon.png")
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map((url) => new Request(url, {
      cache: "reload",
      credentials: "same-origin"
    })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith("playstudy-") && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (!response.ok) throw new Error(`Navigation failed with ${response.status}`);
    if (new URL(request.url).pathname === new URL(fallbackUrl).pathname) {
      await cache.put(fallbackUrl, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(fallbackUrl)) || new Response(
      "<!doctype html><html lang=\"ja\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>PlayStudy</title><body><main><h1>PlayStudy</h1><p>オフライン起動の準備中です。通信が戻ったら、もう一度開いてください。</p></main></body></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE_URL.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const preload = await event.preloadResponse;
      if (preload?.ok) {
        if (url.pathname === new URL(SHELL_URL).pathname) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(SHELL_URL, preload.clone());
        }
        return preload;
      }
      return networkFirst(request, SHELL_URL);
    })());
    return;
  }

  if (APP_SHELL.includes(url.toString())) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: false });
      const refresh = fetch(new Request(request, { cache: "no-cache" }))
        .then(async (response) => {
          if (response.ok) await cache.put(request, response.clone());
          return response;
        });
      if (cached) {
        event.waitUntil(refresh.catch(() => undefined));
        return cached;
      }
      return refresh;
    })());
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
