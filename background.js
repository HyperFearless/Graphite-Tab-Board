/* Graphite Tab Board - Firefox MV3 background service worker. */
const api = globalThis.browser || globalThis.chrome;

const STORAGE_KEY = "state";
const STATE_VERSION = 1;
const records = new Map();
const suppressedRemovals = new Set();
const pendingWindowRemovals = new Map();
const pendingWindowRemovalTimers = new Map();
const WINDOW_CLOSE_DEBOUNCE_MS = 350;
let bootPromise;

function extensionUrl(file = "dashboard.html") {
  return api.runtime.getURL(file);
}

function isDashboardUrl(url) {
  if (!url) return false;
  return url === extensionUrl("dashboard.html") ||
    url.startsWith(`${extensionUrl("dashboard.html")}#`);
}

function isDashboardTab(tab) {
  return isDashboardUrl(tab?.url) || isDashboardUrl(tab?.pendingUrl);
}

function isPersistableTab(tab) {
  return Boolean(tab && !tab.incognito && !isDashboardTab(tab));
}

function isTrackableTab(tab) {
  if (!tab || tab.incognito || isDashboardTab(tab)) return false;
  return Boolean(tab.url || tab.pendingUrl || tab.title);
}

function tabUrl(tab) {
  return tab?.url || tab?.pendingUrl || "";
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function now() {
  return Date.now();
}

function asRecord(tab, previous = {}, touch = false) {
  const url = tabUrl(tab) || previous.url || "about:blank";
  return {
    id: previous.id || makeId(),
    tabId: Number.isInteger(tab?.id) ? tab.id : (previous.tabId ?? null),
    windowId: Number.isInteger(tab?.windowId) ? tab.windowId : (previous.windowId ?? null),
    url,
    title: tab?.title || previous.title || url,
    favIconUrl: tab?.favIconUrl || previous.favIconUrl || "",
    imageUrl: previous.imageUrl || "",
    cachedImageUrl: previous.cachedImageUrl || previous.imageUrl || "",
    metadata: previous.metadata || {},
    pinned: Boolean(tab?.pinned ?? previous.pinned),
    favorite: Boolean(previous.favorite),
    discarded: Boolean(tab?.discarded ?? previous.discarded),
    active: Boolean(tab?.active ?? previous.active),
    audible: Boolean(tab?.audible ?? previous.audible),
    index: Number.isInteger(tab?.index) ? tab.index : (previous.index ?? 0),
    // lastSeen only moves on meaningful views (create/activate/focus).
    // Preserving it on noisy updates avoids write + resort churn.
    lastSeen: touch ? now() : (previous.lastSeen ?? now())
  };
}

const SAVE_DEBOUNCE_MS = 250;
let saveTimer = null;

async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await persist();
  notifyStateChanged();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist().then(() => notifyStateChanged()).catch((error) => console.error("Deferred save failed", error));
  }, SAVE_DEBOUNCE_MS);
}

const MEANINGFUL_FIELDS = ["url", "title", "favIconUrl", "pinned", "discarded", "active", "audible", "index", "windowId", "tabId"];

function sameMeaningful(a, b) {
  return MEANINGFUL_FIELDS.every((key) => (a[key] ?? null) === (b[key] ?? null));
}

async function persist() {
  const state = {
    version: STATE_VERSION,
    updatedAt: now(),
    records: [...records.values()]
  };
  await api.storage.local.set({ [STORAGE_KEY]: state });
}

function notifyStateChanged() {
  // There may be no dashboard page. A rejected broadcast is harmless.
  api.runtime.sendMessage({ type: "STATE_UPDATED" }).catch?.(() => {});
}



function findRecordByTabId(tabId) {
  for (const record of records.values()) {
    if (record.tabId === tabId) return record;
  }
}

async function loadState() {
  const stored = await api.storage.local.get([STORAGE_KEY]);
  const savedState = stored?.[STORAGE_KEY];
  if (savedState?.records && Array.isArray(savedState.records)) {
    for (const savedRecord of savedState.records) {
      if (!savedRecord?.id || savedRecord.private || isDashboardUrl(savedRecord.url)) continue;
      const { private: _private, ...record } = savedRecord;
      records.set(record.id, { ...record, tabId: record.tabId ?? null });
    }
  }
}

async function queryTabs(query = {}) {
  try {
    return await api.tabs.query(query);
  } catch {
    return [];
  }
}

async function queryNormalWindows() {
  try {
    const windows = await api.windows.getAll({ windowTypes: ["normal"] });
    // Incognito windows also report type "normal"; only non-private
    // windows count when deciding whether Firefox is really exiting.
    return windows.filter((window) => !window.incognito);
  } catch {
    try {
      const windows = await api.windows.getAll();
      return windows.filter((window) => !window.type || window.type === "normal").filter((window) => !window.incognito);
    } catch {
      // During browser shutdown Firefox may reject all window queries. In
      // that case retaining offline records is the safer recovery behavior.
      return [];
    }
  }
}

async function finalizeWindowRemoval(windowKey) {
  pendingWindowRemovalTimers.delete(windowKey);
  const buffered = pendingWindowRemovals.get(windowKey);
  pendingWindowRemovals.delete(windowKey);
  if (!buffered || buffered.size === 0) return;

  const normalWindows = await queryNormalWindows();
  const remainingNormalWindows = Number.isInteger(windowKey)
    ? normalWindows.filter((window) => window.id !== windowKey)
    : normalWindows;
  if (remainingNormalWindows.length > 0) {
    // Closing one of several normal windows is an intentional user close.
    for (const recordId of buffered.keys()) {
      records.delete(recordId);
    }
  } else {
    // If Firefox is exiting (the final normal window is gone), keep the
    // records offline so startup reconciliation can restore them later.
    for (const recordId of buffered.keys()) {
      const record = records.get(recordId);
      if (!record) continue;
      record.tabId = null;
      record.windowId = null;
      record.discarded = true;
    }
  }
  await persist();
  notifyStateChanged();
}

function bufferWindowRemoval(record, windowId) {
  const windowKey = Number.isInteger(windowId) ? windowId : "unknown";
  if (!pendingWindowRemovals.has(windowKey)) pendingWindowRemovals.set(windowKey, new Map());
  pendingWindowRemovals.get(windowKey).set(record.id, true);
  record.tabId = null;
  record.windowId = null;
  record.discarded = true;

  const priorTimer = pendingWindowRemovalTimers.get(windowKey);
  if (priorTimer) clearTimeout(priorTimer);
  const timer = setTimeout(() => {
    finalizeWindowRemoval(windowKey).catch((error) => console.error("Window close reconciliation failed", error));
  }, WINDOW_CLOSE_DEBOUNCE_MS);
  pendingWindowRemovalTimers.set(windowKey, timer);
}

async function reconcileNormalTabs() {
  const tabs = (await queryTabs({})).filter(isPersistableTab);
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const matched = new Set();
  const unmatched = [];

  // Reserve live IDs before URL matching, so an offline card cannot take
  // the tab that belongs to another saved card with the same URL.
  for (const record of records.values()) {
    const tab = byId.get(record.tabId);
    if (tab && !matched.has(tab.id)) {
      matched.add(tab.id);
      const next = asRecord(tab, record);
      records.set(record.id, next);
    } else {
      unmatched.push(record);
    }
  }

  const byUrl = new Map();
  for (const tab of tabs) {
    if (matched.has(tab.id)) continue;
    const url = tabUrl(tab);
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(tab);
  }
  for (const record of unmatched) {
    const tab = byUrl.get(record.url)?.pop();
    if (tab) {
      matched.add(tab.id);
      const next = asRecord(tab, record);
      records.set(record.id, next);
    } else {
      // Saved cards without a live match are restored individually.
      record.tabId = null;
      record.windowId = null;
      record.discarded = true;
    }
  }

  for (const tab of tabs) {
    if (!isTrackableTab(tab) || matched.has(tab.id)) continue;
    const next = asRecord(tab);
    records.set(next.id, next);
  }

  await persist();
  notifyStateChanged();
}

async function restoreMissingRecords() {
  const tabs = await queryTabs({});
  const candidateWindow = tabs.find((tab) => !tab.incognito)?.windowId;
  for (const record of records.values()) {
    if (record.tabId !== null && tabs.some((tab) => tab.id === record.tabId && isPersistableTab(tab))) continue;
    if (!record.url || isDashboardUrl(record.url) || record.url.startsWith("about:")) continue;
    try {
      const created = await api.tabs.create({
        url: record.url,
        active: false,
        pinned: Boolean(record.pinned),
        ...(Number.isInteger(candidateWindow) ? { windowId: candidateWindow } : {})
      });
      const next = asRecord(created, record, true);
      records.set(record.id, next);
    } catch {
      // Restricted URLs may not be restored by Firefox; keep their saved card.
      record.tabId = null;
      record.windowId = null;
    }
  }
  await persist();
}

async function boot() {
  await loadState();
  await reconcileNormalTabs();
  await restoreMissingRecords();
  return true;
}

function ensureBoot() {
  if (!bootPromise) bootPromise = boot().catch((error) => {
    console.error("Graphite Tab Board startup failed", error);
  });
  return bootPromise;
}


async function stateForRequest() {
  if (saveTimer) await flushSave();
  return {
    version: STATE_VERSION,
    focusedWindowId: await getFocusedWindowId(),
    records: [...records.values()]
  };
}

async function getTab(tabId) {
  try {
    return await api.tabs.get(tabId);
  } catch {
    return null;
  }
}

async function getFocusedWindowId() {
  try {
    const focused = await api.windows.getLastFocused({ windowTypes: ["normal"] });
    return Number.isInteger(focused?.id) ? focused.id : null;
  } catch {
    const active = await queryTabs({ active: true, lastFocusedWindow: true });
    return Number.isInteger(active[0]?.windowId) ? active[0].windowId : null;
  }
}

async function createOrGetTab(record) {
  const live = Number.isInteger(record.tabId) ? await getTab(record.tabId) : null;
  if (live && !live.incognito) return live;
  if (!record.url || isDashboardUrl(record.url)) return null;
  try {
    const created = await api.tabs.create({ url: record.url, active: true, pinned: Boolean(record.pinned) });
    const next = asRecord(created, record, true);
    records.set(record.id, next);
    await persist();
    return created;
  } catch {
    return null;
  }
}

async function focusTab(record) {
  const tab = await createOrGetTab(record);
  if (!tab) return { ok: false, error: "Tab could not be opened" };
  try {
    await api.tabs.update(tab.id, { active: true });
    if (Number.isInteger(tab.windowId)) await api.windows.update(tab.windowId, { focused: true });
  } catch {
    return { ok: false, error: "Tab could not be focused" };
  }
  return { ok: true };
}

async function handleTabAction(request) {
  const { action, id } = request;
  const record = records.get(id);
  if (!record) return { ok: false, error: "Tab record not found" };

  if (action === "focus") return focusTab(record);

  const live = Number.isInteger(record.tabId) ? await getTab(record.tabId) : null;
  if (action === "discard") {
    // The same card control is a wake action for discarded/missing tabs.
    if (record.discarded || !live) {
      const result = await focusTab(record);
      if (result.ok) {
        record.discarded = false;
        await persist();
        notifyStateChanged();
      }
      return result;
    }
    if (!live) return { ok: false, error: "Tab is not open" };
    if (live.active) return { ok: false, error: "The active tab cannot be discarded" };
    try {
      await api.tabs.discard(live.id);
      record.discarded = true;
    } catch (error) {
      return { ok: false, error: error?.message || "Tab could not be discarded" };
    }
  } else if (action === "reload") {
    const target = live || await createOrGetTab(record);
    if (!target) return { ok: false, error: "Tab is not open" };
    try { await api.tabs.reload(target.id); } catch { return { ok: false, error: "Tab could not be reloaded" }; }
  } else if (action === "pin") {
    if (!live) return { ok: false, error: "Tab is not open" };
    try {
      const updated = await api.tabs.update(live.id, { pinned: !live.pinned });
      record.pinned = Boolean(updated?.pinned ?? !live.pinned);
    } catch { return { ok: false, error: "Tab could not be pinned" }; }
  } else if (action === "favorite") {
    record.favorite = !record.favorite;
  } else if (action === "close") {
    if (live) {
      suppressedRemovals.add(live.id);
      try { await api.tabs.remove(live.id); } catch { suppressedRemovals.delete(live.id); }
    }
    records.delete(record.id);
  } else {
    return { ok: false, error: "Unknown tab action" };
  }

  await persist();
  notifyStateChanged();
  return { ok: true };
}

async function onMessage(request = {}, sender = {}) {
  if (sender.tab?.incognito) return { ok: false, error: "Private browsing is not supported" };
  await ensureBoot();
  if (request.type === "GET_STATE") return stateForRequest();
  if (request.type === "TAB_ACTION") return handleTabAction(request);
  if (request.type === "PAGE_METADATA") {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId)) return { ok: false };
    const tab = sender.tab || await getTab(tabId);
    if (!isPersistableTab(tab)) return { ok: true };
    let record = findRecordByTabId(tabId);
    if (!record) {
      record = asRecord(tab, {}, true);
      records.set(record.id, record);
    }
    const metadata = request.metadata || {};
    let changed = false;
    if (metadata.title && metadata.title !== record.title) { record.title = metadata.title; changed = true; }
    if (metadata.description && metadata.description !== record.metadata.description) { record.metadata.description = metadata.description; changed = true; }
    if (metadata.imageUrl && metadata.imageUrl !== record.imageUrl) {
      record.cachedImageUrl = record.imageUrl || record.cachedImageUrl || "";
      record.imageUrl = metadata.imageUrl;
      changed = true;
    }
    const nextUrl = tabUrl(tab);
    if (nextUrl && nextUrl !== record.url) { record.url = nextUrl; changed = true; }
    if (tab.favIconUrl && tab.favIconUrl !== record.favIconUrl) { record.favIconUrl = tab.favIconUrl; changed = true; }
    if (metadata.favIconUrl && metadata.favIconUrl !== record.favIconUrl) { record.favIconUrl = metadata.favIconUrl; changed = true; }
    if (!changed) return { ok: true };
    scheduleSave();
    return { ok: true };
  }
  return { ok: false, error: "Unknown request" };
}

api.runtime.onMessage.addListener(onMessage);

api.action.onClicked.addListener(async (currentTab) => {
  if (currentTab?.incognito) return;
  await ensureBoot();
  const dashboardTabs = (await queryTabs({ url: extensionUrl("dashboard.html") })).filter((tab) => !tab.incognito);
  const candidate = dashboardTabs.find((tab) => tab.windowId === currentTab?.windowId) || dashboardTabs[0];
  if (candidate) {
    try {
      await api.tabs.update(candidate.id, { active: true });
      if (Number.isInteger(candidate.windowId)) await api.windows.update(candidate.windowId, { focused: true });
      return;
    } catch {
      // Open a fresh dashboard below if the prior page disappeared.
    }
  }
  await api.tabs.create({ url: extensionUrl("dashboard.html"), active: true });
});

api.tabs.onCreated.addListener(async (tab) => {
  await ensureBoot();
  if (!isTrackableTab(tab)) return;
  if (findRecordByTabId(tab.id)) return;
  const record = asRecord(tab, {}, true);
  records.set(record.id, record);
  scheduleSave();
});

api.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.incognito) return;
  await ensureBoot();
  if (isDashboardTab(tab)) {
    const normalRecord = findRecordByTabId(tabId);
    if (normalRecord) {
      records.delete(normalRecord.id);
      await persist();
    }
    notifyStateChanged();
    return;
  }
  let record = findRecordByTabId(tabId);
  if (!record && !isTrackableTab(tab)) return;
  if (!record) {
    record = asRecord(tab, {}, true);
    records.set(record.id, record);
  } else {
    const next = asRecord(tab, record, false);
    if (changeInfo.discarded !== undefined) next.discarded = Boolean(changeInfo.discarded);
    if (sameMeaningful(record, next)) return;
    records.set(record.id, next);
  }
  scheduleSave();
});

api.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  await ensureBoot();
  const tabs = await queryTabs({ windowId });
  let changedNormal = false;
  for (const tab of tabs) {
    if (tab.incognito || isDashboardTab(tab)) continue;
    const record = findRecordByTabId(tab.id);
    if (!record) continue;
    const preview = asRecord(tab, record, false);
    if (sameMeaningful(record, preview)) continue;
    records.set(record.id, asRecord(tab, record, true));
    changedNormal = true;
  }
  if (changedNormal) scheduleSave();
  else notifyStateChanged();
});

api.windows.onFocusChanged?.addListener(async (windowId) => {
  if (!Number.isInteger(windowId) || windowId < 0) return;
  await ensureBoot();
  const tabs = await queryTabs({ windowId });
  let changedNormal = false;
  for (const tab of tabs) {
    if (tab.incognito || isDashboardTab(tab)) continue;
    const record = findRecordByTabId(tab.id);
    if (!record) continue;
    const preview = asRecord(tab, record, false);
    if (sameMeaningful(record, preview)) continue;
    records.set(record.id, asRecord(tab, record, true));
    changedNormal = true;
  }
  if (changedNormal) scheduleSave();
  else notifyStateChanged();
});

api.tabs.onRemoved.addListener(async (tabId, removeInfo = {}) => {
  await ensureBoot();
  if (suppressedRemovals.has(tabId)) {
    suppressedRemovals.delete(tabId);
    return;
  }
  const record = findRecordByTabId(tabId);
  if (!record) return;
  if (removeInfo.isWindowClosing) {
    bufferWindowRemoval(record, removeInfo.windowId ?? record.windowId);
    // Save the offline representation before Firefox finishes closing the
    // window; the debounced handler will decide whether to delete or retain.
    await persist();
    notifyStateChanged();
    return;
  }
  // A browser/user close is intentional. Do not keep it as a missing card
  // that would be restored on the next extension/browser startup.
  records.delete(record.id);
  await persist();
  notifyStateChanged();
});

api.runtime.onStartup?.addListener(() => {
  bootPromise = undefined;
  ensureBoot();
});

api.runtime.onInstalled?.addListener(() => {
  ensureBoot();
});

// Warm the worker when Firefox starts the extension in a new profile.
ensureBoot();
