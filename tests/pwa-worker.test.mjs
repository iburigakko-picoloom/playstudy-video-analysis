import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function loadWorker({ scope = "https://example.test/app/", fetchImpl, stores = new Map() } = {}) {
  const listeners = new Map();
  const fetches = [];
  let activated = false;
  const fetcher = async (request) => {
    fetches.push(request.url);
    return fetchImpl ? fetchImpl(request) : new Response("app asset");
  };
  const cacheStorage = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async addAll(requests) {
          // Match the browser contract: the old repeated ROOT_URL must fail install.
          const keys = requests.map((request) => request.url);
          if (new Set(keys).size !== keys.length) throw new Error("Duplicate cache request");
          const responses = await Promise.all(requests.map(fetcher));
          if (responses.some((response) => !response.ok)) throw new Error("Failed cache request");
          requests.forEach((request, index) => entries.set(request.url, responses[index].clone()));
        },
        async match(key) { return entries.get(typeof key === "string" ? key : key.url)?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const context = vm.createContext({
    URL, Request, Response, Error, AbortController,
    setTimeout: (fn, delay) => setTimeout(fn, Math.min(delay, 30)), clearTimeout,
    fetch: fetcher, caches: cacheStorage,
    self: {
      registration: { scope, navigationPreload: { async disable() {} } },
      clients: { async claim() {} },
      async skipWaiting() { activated = true; },
      addEventListener(type, handler) { listeners.set(type, handler); },
    },
  });
  vm.runInContext(workerSource, context);
  return {
    stores, fetches,
    get activated() { return activated; },
    async lifecycle(type) {
      let promise;
      listeners.get(type)({ waitUntil(value) { promise = value; } });
      await promise;
    },
    async navigate(path = "") {
      let promise;
      listeners.get("fetch")({
        request: { method: "GET", mode: "navigate", url: new URL(path, scope).href },
        respondWith(value) { promise = value; },
      });
      return promise;
    },
  };
}

test("installs the entire app without duplicate cache requests", async () => {
  const worker = loadWorker();
  await worker.lifecycle("install");
  assert.equal(worker.activated, true);
  assert.equal(new Set(worker.fetches).size, worker.fetches.length);
  assert(worker.fetches.some((url) => url.endsWith("/playstudy/index.html")));
  assert(worker.fetches.some((url) => url.includes("/playstudy/app.js?")));
});

test("failed app asset keeps the new worker from activating", async () => {
  const worker = loadWorker({ fetchImpl: async (request) => new Response("", { status: request.url.includes("app.js") ? 404 : 200 }) });
  await assert.rejects(worker.lifecycle("install"), /Failed cache request/);
  assert.equal(worker.activated, false);
});

test("all historical launch URLs open offline without a network request", async () => {
  let offline = false;
  const worker = loadWorker({ fetchImpl: async () => {
    if (offline) throw new Error("offline");
    return new Response("installed app");
  } });
  await worker.lifecycle("install");
  offline = true;
  worker.fetches.length = 0;
  for (const path of ["", "index.html", "launch/", "launch/index.html", "playstudy/", "playstudy/index.html"]) {
    assert.equal(await (await worker.navigate(path)).text(), "installed app");
  }
  assert.deepEqual(worker.fetches, []);
});

test("installed navigation does not wait for a stalled mobile connection", async () => {
  let stalled = false;
  const worker = loadWorker({ fetchImpl: () => stalled ? new Promise(() => {}) : Promise.resolve(new Response("installed app")) });
  await worker.lifecycle("install");
  stalled = true;
  const result = await Promise.race([
    worker.navigate().then((response) => response.text()),
    new Promise((resolve) => setTimeout(() => resolve("timed out"), 100)),
  ]);
  assert.equal(result, "installed app");
});

test("root and project PWAs keep independent complete caches", async () => {
  const stores = new Map();
  const rootWorker = loadWorker({ scope: "https://example.test/", stores });
  const projectWorker = loadWorker({ scope: "https://example.test/playstudy-video-analysis/", stores });
  await rootWorker.lifecycle("install");
  await projectWorker.lifecycle("install");
  await rootWorker.lifecycle("activate");
  await projectWorker.lifecycle("activate");
  assert.equal(stores.size, 2);
  assert.equal((await rootWorker.navigate()).status, 200);
  assert.equal((await projectWorker.navigate()).status, 200);
  assert.equal(await rootWorker.navigate("playstudy-video-analysis/"), undefined);
});

test("uncached launch shows a recoverable error when offline or stalled", async () => {
  for (const fetchImpl of [
    async () => { throw new Error("offline"); },
    (request) => new Promise((resolve, reject) => request.signal.addEventListener("abort", () => reject(new Error("timeout")))),
  ]) {
    const worker = loadWorker({ fetchImpl });
    const response = await worker.navigate();
    assert.equal(response.status, 503);
    assert.match(await response.text(), /もう一度開く/);
  }
});
