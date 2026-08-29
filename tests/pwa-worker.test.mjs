import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function loadWorker(fetchImpl, cachedResponse = new Response("cached shell")) {
  const listeners = new Map();
  const puts = [];
  const cache = {
    async addAll() {},
    async match() { return cachedResponse.clone(); },
    async put(key, value) { puts.push([String(key), value.clone()]); },
  };
  const context = vm.createContext({
    URL,
    Request,
    Response,
    Error,
    fetch: fetchImpl,
    caches: {
      async open() { return cache; },
      async keys() { return []; },
      async delete() { return true; },
    },
    self: {
      registration: {
        scope: "https://example.test/app/",
        navigationPreload: { async enable() {} },
      },
      clients: { async claim() {} },
      async skipWaiting() {},
      addEventListener(type, handler) { listeners.set(type, handler); },
    },
  });
  vm.runInContext(workerSource, context);
  return {
    networkFirst: vm.runInContext("networkFirst", context),
    puts,
  };
}

test("navigation 404 falls back to the cached app shell", async () => {
  const { networkFirst } = loadWorker(async () => new Response("missing", { status: 404 }));
  const response = await networkFirst(
    new Request("https://example.test/app/playstudy/index.html"),
    "https://example.test/app/",
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "cached shell");
});

test("navigation network failure falls back to the cached app shell", async () => {
  const { networkFirst } = loadWorker(async () => { throw new Error("offline"); });
  const response = await networkFirst(
    new Request("https://example.test/app/"),
    "https://example.test/app/",
  );
  assert.equal(await response.text(), "cached shell");
});

test("successful navigation refreshes the canonical cached shell", async () => {
  const { networkFirst, puts } = loadWorker(async () => new Response("fresh shell", { status: 200 }));
  const response = await networkFirst(
    new Request("https://example.test/app/"),
    "https://example.test/app/",
  );
  assert.equal(await response.text(), "fresh shell");
  assert.equal(puts.length, 1);
  assert.equal(puts[0][0], "https://example.test/app/");
  assert.equal(await puts[0][1].text(), "fresh shell");
});

test("ordinary subpath browsing cannot replace the cached root shell", async () => {
  const { networkFirst, puts } = loadWorker(async () => new Response("root page", { status: 200 }));
  const response = await networkFirst(
    new Request("https://example.test/app/playstudy/index.html"),
    "https://example.test/app/",
  );
  assert.equal(await response.text(), "root page");
  assert.equal(puts.length, 0);
});
