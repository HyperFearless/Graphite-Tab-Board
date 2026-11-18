const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const source = readFileSync(join(__dirname, "background.js"), "utf8");
const url = "https://example.org/shared";
const tab = (id, extra = {}) => ({ id, windowId: 10, url, title: "Example", incognito: false, pinned: false, active: false, index: id, ...extra });
const record = (id, extra = {}) => ({ id, tabId: null, windowId: null, url, pinned: false, ...extra });
// A set session flag means the event page is waking up, not starting fresh.
const WAKE = { session: { bootedSession: true } };

async function start(saved = [], initialTabs = [], initialWindows = [{ id: 10, type: "normal", incognito: false }], options = {}) {
  const listeners = {};
  const event = (name) => ({ addListener(fn) { listeners[name] = fn; } });
  const tabs = initialTabs.map((value) => ({ ...value }));
  const created = [];
  const timers = new Map();
  let storage = { state: { records: saved } };
  const session = options.session ? { ...options.session } : null;
  let windows = initialWindows;
  let nextId = Math.max(100, ...tabs.map((value) => value.id)) + 1;
  const api = {
    runtime: {
      getURL: (file) => `moz-extension://test/${file}`,
      sendMessage: async () => {},
      onMessage: event("message"), onStartup: event("startup"), onInstalled: event("installed")
    },
    storage: {
      local: { get: async () => structuredClone(storage), set: async (value) => { storage = structuredClone(value); } },
      ...(session ? { session: { get: async () => ({ ...session }), set: async (value) => { Object.assign(session, value); } } } : {})
    },
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
  // Firefox fires runtime.onStartup right after the script's own top-level
  // boot started; run both together so a second, concurrent boot shows up.
  await Promise.all([vm.runInContext("ensureBoot()", context), listeners.startup()]);
  return {
    tabs, created, listeners,
    state: () => listeners.message({ type: "GET_STATE" }),
    storage: () => storage,
    setWindows: (value) => { windows = value; },
    flushClose: (windowId) => vm.runInContext(`finalizeWindowRemoval(${windowId})`, context),
    runStaleCheck: () => vm.runInContext("markStaleRecordsOffline()", context)
  };
}

const metadataFrom = (app, metadata, sender = app.tabs[0]) =>
  app.listeners.message({ type: "PAGE_METADATA", metadata }, { tab: sender });

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

test("each missing same-URL record is restored once with its own pin state", async () => {
  const app = await start([record("pinned", { pinned: true }), record("plain")]);
  const state = await app.state();
  assert.equal(app.created.length, 2);
  assert.equal(new Set(state.records.map((value) => value.tabId)).size, 2);
  assert.equal(state.records.find((value) => value.id === "pinned").pinned, true);
  assert.equal(state.records.find((value) => value.id === "plain").pinned, false);
  await app.listeners.startup();
  await app.listeners.installed();
  await app.state();
  assert.equal(app.created.length, 2);
});

test("restored tabs open unloaded, except pinned ones", async () => {
  const app = await start([record("pinned", { pinned: true }), record("plain", { title: "Saved title" })]);
  const pinned = app.created.find((options) => options.pinned);
  const plain = app.created.find((options) => !options.pinned);
  assert.equal(pinned.discarded, undefined);
  assert.equal(plain.discarded, true);
  assert.equal(plain.title, "Saved title");
  assert.equal(plain.active, false);
  const state = await app.state();
  assert.equal(state.records.find((value) => value.id === "plain").discarded, true);
});

test("changed browser IDs match same-URL cards one-to-one without extra tabs", async () => {
  const app = await start([record("a", { tabId: 50 }), record("b", { tabId: 51 })], [tab(1), tab(2)]);
  const state = await app.state();
  assert.equal(state.records.length, 2);
  assert.equal(new Set(state.records.map((value) => value.tabId)).size, 2);
  assert.equal(app.created.length, 0);
});

test("a fresh start ignores a previous-session tab ID that now belongs to another page", async () => {
  const pageA = "https://example.org/a";
  const pageB = "https://example.org/b";
  const app = await start([record("x", { tabId: 1, url: pageA }), record("y", { tabId: 7, url: pageB })], [tab(1, { url: pageB })]);
  const state = await app.state();
  const x = state.records.find((value) => value.id === "x");
  const y = state.records.find((value) => value.id === "y");
  assert.equal(y.tabId, 1);
  assert.equal(x.url, pageA);
  assert.notEqual(x.tabId, 1);
  assert.equal(app.created.length, 1);
  assert.equal(app.created[0].url, pageA);
});

test("waking from suspension never reopens a tab closed while asleep", async () => {
  const app = await start([record("gone", { tabId: 1, windowId: 10 })], [], undefined, WAKE);
  assert.equal(app.created.length, 0);
  await app.listeners.removed(1, { windowId: 10 });
  assert.equal((await app.state()).records.length, 0);
  assert.equal(app.created.length, 0);
});

test("records left stale after a wake go offline without reopening", async () => {
  const other = "https://example.org/other";
  const app = await start([record("stale", { tabId: 1, windowId: 10 })], [tab(5, { url: other })], undefined, WAKE);
  await app.runStaleCheck();
  const state = await app.state();
  const stale = state.records.find((value) => value.id === "stale");
  assert.equal(stale.tabId, null);
  assert.equal(stale.discarded, true);
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

test("Firefox's favicon is not overridden by the page-declared one", async () => {
  const app = await start([], [tab(1, { favIconUrl: "https://example.org/firefox.png" })]);
  await metadataFrom(app, { favIconUrl: "https://example.org/favicon.ico" });
  assert.equal((await app.state()).records[0].favIconUrl, "https://example.org/firefox.png");
});

test("the page-declared favicon fills in when Firefox has none", async () => {
  const app = await start([], [tab(1)]);
  await metadataFrom(app, { favIconUrl: "https://example.org/icon.svg" });
  assert.equal((await app.state()).records[0].favIconUrl, "https://example.org/icon.svg");
});

test("navigating to another page drops the previous preview; hash changes keep it", async () => {
  const app = await start([], [tab(1)]);
  await metadataFrom(app, { imageUrl: "https://example.org/a.jpg" });
  const sameDocument = { ...app.tabs[0], url: `${url}#section` };
  await app.listeners.updated(1, { url: sameDocument.url }, sameDocument);
  assert.equal((await app.state()).records[0].imageUrl, "https://example.org/a.jpg");
  const otherPage = { ...app.tabs[0], url: "https://example.org/next" };
  await app.listeners.updated(1, { url: otherPage.url }, otherPage);
  const moved = (await app.state()).records[0];
  assert.equal(moved.imageUrl, "");
  assert.equal(moved.cachedImageUrl, "");
});

test("a new host also drops the previous favicon", async () => {
  const app = await start([], [tab(1)]);
  await metadataFrom(app, { favIconUrl: "https://example.org/icon.svg" });
  const otherHost = { ...app.tabs[0], url: "https://other.example/" };
  await app.listeners.updated(1, { url: otherHost.url }, otherHost);
  assert.equal((await app.state()).records[0].favIconUrl, "");
});

test("unsafe preview and favicon URLs from pages are ignored", async () => {
  const app = await start([], [tab(1)]);
  await metadataFrom(app, { imageUrl: "javascript:alert(1)", favIconUrl: "file:///etc/passwd" });
  const saved = (await app.state()).records[0];
  assert.equal(saved.imageUrl, "");
  assert.equal(saved.favIconUrl, "");
});

test("page descriptions are neither collected nor kept from older storage", async () => {
  const app = await start([record("old", { tabId: 1, metadata: { description: "Old description" } })], [tab(1)]);
  await metadataFrom(app, { description: "Page description" });
  const serialized = JSON.stringify(app.storage());
  assert.equal(serialized.includes("description"), false);
});

test("failed actions report a stable error code", async () => {
  const app = await start([record("offline", { url: "about:config" })]);
  const pin = await app.listeners.message({ type: "TAB_ACTION", action: "pin", id: "offline" });
  assert.equal(pin.ok, false);
  assert.equal(pin.code, "NOT_OPEN");
  const missing = await app.listeners.message({ type: "TAB_ACTION", action: "pin", id: "nope" });
  assert.equal(missing.code, "RECORD_NOT_FOUND");
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
