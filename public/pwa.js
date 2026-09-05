document.documentElement.setAttribute("data-pwa-boot", "started");
(() => {
  // Bump this key when the install identity changes so a removed/broken old icon
  // never prevents the user from installing the current app again.
  const INSTALLED_KEY = "playstudy_pwa_installed_v3";
  const rootMeta = document.querySelector('meta[name="playstudy-root"]')?.content || "/";
  const rootUrl = new URL(rootMeta, location.href);
  const standalone = () =>
    matchMedia("(display-mode: standalone)").matches ||
    matchMedia("(display-mode: fullscreen)").matches ||
    window.navigator.standalone === true;
  const rememberInstalled = () => {
    try {
      localStorage.setItem(INSTALLED_KEY, "1");
    } catch {
      // Storage can be unavailable in private or restricted browser modes.
    }
  };
  const installedKnown = () => {
    if (standalone()) return true;
    try {
      return localStorage.getItem(INSTALLED_KEY) === "1";
    } catch {
      return false;
    }
  };

  if (standalone()) rememberInstalled();

  let installPrompt = null;
  let registration = null;
  let registrationError = null;

  const notify = () => {
    const status = window.playStudyPWA.status();
    document.documentElement.dataset.pwaMode = status.standalone ? "standalone" : "browser";
    document.documentElement.dataset.pwaInstall = status.canPrompt ? "ready" : "manual";
    document.documentElement.dataset.pwaWorker = status.serviceWorker || (status.serviceWorkerError ? "error" : "registering");
    window.dispatchEvent(new CustomEvent("playstudy-pwa-change", { detail: status }));
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    rememberInstalled();
    notify();
  });

  window.playStudyPWA = {
    status() {
      return {
        standalone: standalone(),
        installed: installedKnown(),
        canPrompt: Boolean(installPrompt),
        serviceWorker: registration?.active?.state || registration?.installing?.state || null,
        serviceWorkerScope: registration?.scope || null,
        serviceWorkerError: registrationError ? String(registrationError) : null,
        isIOS: /iphone|ipad|ipod/i.test(navigator.userAgent),
        isSafari: /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|chrome|android/i.test(navigator.userAgent)
      };
    },
    async install() {
      if (installedKnown()) return { outcome: "installed" };
      if (!installPrompt) return { outcome: "manual" };
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      notify();
      return choice;
    },
    async update() {
      await registration?.update();
    },
    async repair() {
      await register();
      if (!registration) throw new Error("起動準備ができません。Chromeで開いて通信を確認してください。");
      await registration.update();
      const cacheName = `playstudy-shell-${encodeURIComponent(rootUrl.pathname)}-v34`;
      const shellUrl = new URL("playstudy/index.html", rootUrl).href;
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const cache = await caches.open(cacheName);
        if (registration.active?.state === "activated" && !registration.installing && !registration.waiting && await cache.match(shellUrl)) {
          return { ready: true, url: rootUrl.href };
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error("起動データを読み込めませんでした。通信を確認してもう一度お試しください。");
    }
  };

  notify();
  const register = async () => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) {
      registrationError = new Error("Service Worker is unavailable in this browser");
      notify();
      return;
    }
    try {
      const workerUrl = new URL("sw.js", rootUrl);
      registration = await navigator.serviceWorker.register(workerUrl.pathname, {
        scope: rootUrl.pathname,
        updateViaCache: "none"
      });
      const trackWorker = (worker) => worker?.addEventListener("statechange", notify);
      registration.addEventListener("updatefound", () => {
        trackWorker(registration.installing);
        notify();
      });
      trackWorker(registration.installing);
      trackWorker(registration.waiting);
      trackWorker(registration.active);
      registration.update().catch((error) => { registrationError = error; notify(); });
    } catch (error) {
      registrationError = error;
    }
    notify();
  };

  register();

  // An early script error must not leave an unresponsive startup screen.
  setTimeout(() => {
    const message = document.querySelector("[data-boot-message]");
    if (!message) return;
    message.textContent = "起動を完了できませんでした";
    const retry = document.querySelector(".boot-retry");
    if (retry) {
      retry.textContent = "起動を修復";
      retry.href = new URL("recover.html", rootUrl).href;
    }
  }, 12000);
})();
