const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = readFileSync(join(__dirname, "background.js"), "utf8");
const url = "https://example.org/shared";
const tab = (id, extra = {}) => ({ id, windowId: 10, url, title: "Example", incognito: false, pinned: false, active: false, index: id, ...extra });
const record = (id, extra = {}) => ({ id, tabId: null, windowId: null, url, pinned: false, ...extra });

async function start(saved = [], initialTabs = [], initialWindows = [{ id: 10, type: "normal", incognito: false }]) {
  const listeners = {};
  const event = (name) => ({ addListener(fn) { listeners[name] = fn; } });
  const tabs = initialTabs.map((value) => ({ ...value }));
  const created = [];
  const timers = new Map();
  let storage = { state: { records: saved } };
  let windows = initialWindows;
  let nextId = Math.max(100, ...tabs.map((value) => value.id)) + 1;
  const api = {
    runtime: {
      getURL: (file) => `moz-extension://test/${file}`,
      sendMessage: async () => {},
      onMessage: event("message"), onStartup: event("startup"), onInstalled: event("installed")
    },
    storage: { local: { get: async () => structuredClone(storage), set: async (value) => { storage = structuredClone(value); } } },
    tabs: {
      query: async (query = {}) => tabs.filter((value) => query.windowId === undefined || value.windowId === query.windowId),
      get: async (id) => { const value = tabs.find((value) => value.id === id); if (!value) throw new Error("Missing tab"); return value; },
      create: async (options) => { const value = tab(nextId++, options); tabs.push(value); created.push(options); return value; },
      update: async (id, options) => Object.assign(tabs.find((value) => value.id === id), options),
      onCreated: event("created"), onUpdated: event("updated"), onActivated: event("activated"), onRemoved: event("removed")
    },
    windows: { getAll: async () => windows, getLastFocused: async () => windows[0], update: async () => {}, onFocusChanged: event("focused") },
    action: { onClicked: event("clicked") }
  };
  const context = vm.createContext({ browser: api, console: { error: (...args) => { throw new Error(args.join(" ")); } }, setTimeout: (fn) => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: (id) => timers.delete(id) });
  vm.runInContext(source, context);
  await vm.runInContext("ensureBoot()", context);
  return {
    tabs, created, listeners,
    state: () => listeners.message({ type: "GET_STATE" }),
    storage: () => storage,
    setWindows: (value) => { windows = value; },
    flushClose: (windowId) => vm.runInContext(`finalizeWindowRemoval(${windowId})`, context)
  };
}

test("two live tabs with the same URL remain distinct across reconciliation", async () => {
  const app = await start([], [tab(1), tab(2)]);
  const first = await app.state();
  assert.equal(first.records.length, 2);
  assert.equal(new Set(first.records.map((value) => value.tabId)).size, 2);
  await app.listeners.startup();
  const second = await app.state();
  assert.equal(second.records.length, 2);
  assert.equal(app.created.length, 0);
});

test("live ID matches are reserved before offline URL matches", async () => {
  const app = await start([record("offline"), record("live", { tabId: 1, favorite: true })], [tab(1)]);
  const state = await app.state();
  assert.equal(state.records.find((value) => value.id === "live").tabId, 1);
  assert.equal(state.records.find((value) => value.id === "live").favorite, true);
  assert.notEqual(state.records.find((value) => value.id === "offline").tabId, 1);
  assert.equal(app.created.length, 1);
});

test("each missing same-URL record is restored with its own pin state", async () => {
  const app = await start([record("pinned", { pinned: true }), record("plain")]);
  const state = await app.state();
  assert.equal(app.created.length, 2);
  assert.equal(new Set(state.records.map((value) => value.tabId)).size, 2);
  assert.equal(state.records.find((value) => value.id === "pinned").pinned, true);
  assert.equal(state.records.find((value) => value.id === "plain").pinned, false);
  await app.listeners.startup();
  await app.state();
  assert.equal(app.created.length, 2);
});

test("changed browser IDs match same-URL cards one-to-one without extra tabs", async () => {
  const app = await start([record("a", { tabId: 50 }), record("b", { tabId: 51 })], [tab(1), tab(2)]);
  const state = await app.state();
  assert.equal(state.records.length, 2);
  assert.equal(new Set(state.records.map((value) => value.tabId)).size, 2);
  assert.equal(app.created.length, 0);
});

test("manual focus restores a missing pinned tab as pinned", async () => {
  const app = await start([record("pin", { pinned: true })]);
  app.tabs.length = 0;
  const result = await app.listeners.message({ type: "TAB_ACTION", action: "focus", id: "pin" });
  assert.equal(result.ok, true);
  assert.equal(app.created.at(-1).pinned, true);
  assert.equal((await app.state()).records[0].pinned, true);
});

test("private tabs and metadata are excluded from state and storage", async () => {
  const secret = tab(2, { incognito: true, url: "https://example.org/private" });
  const app = await start([record("legacy-private", { private: true })], [tab(1), secret]);
  await app.listeners.created(secret);
  await app.listeners.updated(secret.id, {}, secret);
  const result = await app.listeners.message({ type: "PAGE_METADATA", metadata: { title: "Secret" } }, { tab: secret });
  assert.equal(result.ok, false);
  const state = await app.state();
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].tabId, 1);
  assert.equal("privateMode" in state, false);
  assert.equal(JSON.stringify(app.storage()).includes("Secret"), false);
  assert.equal(app.created.length, 0);
  const manifest = JSON.parse(readFileSync(join(__dirname, "manifest.json"), "utf8"));
  assert.equal(manifest.incognito, "not_allowed");
});

test("last non-private window retains cards when a private window remains", async () => {
  const app = await start([], [tab(1)]);
  app.setWindows([{ id: 20, type: "normal", incognito: true }]);
  await app.listeners.removed(1, { windowId: 10, isWindowClosing: true });
  await app.flushClose(10);
  const state = await app.state();
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].tabId, null);
  assert.equal(app.storage().state.records.length, 1);
});

test("closing one of several non-private windows still removes its cards", async () => {
  const app = await start([], [tab(1)]);
  app.setWindows([{ id: 20, type: "normal", incognito: false }]);
  await app.listeners.removed(1, { windowId: 10, isWindowClosing: true });
  await app.flushClose(10);
  assert.equal((await app.state()).records.length, 0);
});
