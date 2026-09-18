(function () {
  const api = globalThis.browser || globalThis.chrome;
  const grid = document.querySelector("#tab-grid");
  const empty = document.querySelector("#empty-state");
  const template = document.querySelector("#tab-card-template");
  const statusLine = document.querySelector("#status-line");
  const searchInput = document.querySelector("#tab-search");
  const clearSearchButton = document.querySelector("#clear-search");
  let currentState = { records: [], focusedWindowId: null };
  let activeFilter = "all";
  const DENSITY_KEY = "gtb-density";
  const THEME_KEY = "gtb-theme";

  function applyDensity(compact) {
    document.body.classList.toggle("compact", compact);
    const button = document.querySelector("#density-button");
    if (button) button.setAttribute("aria-pressed", String(compact));
    try { localStorage.setItem(DENSITY_KEY, compact ? "compact" : "comfortable"); } catch {}
  }

  try {
    if (localStorage.getItem(DENSITY_KEY) === "compact") {
      document.body.classList.add("compact");
      document.querySelector("#density-button")?.setAttribute("aria-pressed", "true");
    }
    if (localStorage.getItem(THEME_KEY) === "ice") {
      document.body.dataset.theme = "ice";
      document.querySelector("#theme-button")?.setAttribute("aria-pressed", "true");
    }
  } catch {}

  function invoke(namespace, method, ...args) {
    const fn = api[namespace]?.[method];
    if (!fn) return Promise.reject(new Error(`${namespace}.${method} is not available`));
    try {
      const result = fn.call(api[namespace], ...args);
      return result && typeof result.then === "function" ? result : Promise.resolve(result);
    } catch (error) { return Promise.reject(error); }
  }

  function escapeText(value) { return String(value || ""); }

  function hostFor(url) {
    try { return new URL(url).hostname.replace(/^www\./, "") || "yerel sayfa"; } catch { return "yerel sayfa"; }
  }

  function imageFor(record) {
    return record.imageUrl || record.cachedImageUrl || record.favIconUrl || "";
  }
  function normalizeSearch(value) {
    return String(value || "").normalize("NFC").toLocaleLowerCase("tr-TR").replace(/ı/g, "i");
  }

  function isSleeping(record) {
    return Boolean(record.discarded || !Number.isInteger(record.tabId));
  }


  function render() {
    const allRecords = currentState.records || [];
    const query = normalizeSearch(searchInput.value.trim());
    clearSearchButton.hidden = searchInput.value.length === 0;
    const searchKbd = document.querySelector("#search-kbd");
    if (searchKbd) searchKbd.hidden = searchInput.value.length !== 0;
    const records = allRecords.filter((record) => {
      const sleeping = isSleeping(record);
      if (activeFilter !== "all" && (activeFilter === "sleeping" ? !sleeping : sleeping)) return false;
      return !query || normalizeSearch(record.title).includes(query) || normalizeSearch(record.url).includes(query);
    }).sort((a, b) => {
      if (Boolean(a.favorite) !== Boolean(b.favorite)) return a.favorite ? -1 : 1;
      const aFocused = a.windowId === currentState.focusedWindowId;
      const bFocused = b.windowId === currentState.focusedWindowId;
      if (aFocused !== bFocused) return aFocused ? -1 : 1;
      if (a.windowId === b.windowId && Number.isInteger(a.index) && Number.isInteger(b.index) && a.index !== b.index) {
        return a.index - b.index;
      }
      return (b.lastSeen || 0) - (a.lastSeen || 0);
    });
    grid.replaceChildren();
    empty.hidden = records.length !== 0;
    document.querySelector("#tab-count").textContent = allRecords.length;
    document.querySelector("#sleeping-count").textContent = allRecords.filter(isSleeping).length;
    document.querySelector("#favorite-count").textContent = allRecords.filter((record) => record.favorite).length;
    statusLine.textContent = `${allRecords.length} sekmeden ${records.length} gösteriliyor.`;
    empty.querySelector("h2").textContent = query
      ? "Aramanızla eşleşen sekme yok"
      : activeFilter === "all" ? "Panoda sekme yok" : "Bu filtrede sekme yok";
    empty.querySelector("p").textContent = query
      ? "Başka bir harf/kelime deneyin veya aramayı temizleyin."
      : activeFilter === "all" ? "Bir sayfa açtığınızda otomatik olarak burada görünür." : "Diğer sekmeleri görmek için Tümü filtresini seçin.";

    for (const record of records) {
      const card = template.content.firstElementChild.cloneNode(true);
      card.dataset.id = record.id;
      card.querySelector(".card-domain").textContent = hostFor(record.url);
      card.querySelector(".card-title").textContent = escapeText(record.title || record.url || "Adsız sekme");
      card.querySelector(".card-url").textContent = escapeText(record.url);
      const image = card.querySelector(".card-image");
      const imageUrl = imageFor(record);
      if (imageUrl) {
        image.src = imageUrl;
        image.alt = record.title || "Sekme önizlemesi";
        const fallbackUrls = [record.cachedImageUrl, record.favIconUrl].filter((url) => url && url !== imageUrl);
        image.addEventListener("error", () => {
          const next = fallbackUrls.shift();
          if (next) image.src = next;
          else image.removeAttribute("src");
        });
      }
      const sleeping = isSleeping(record);
      card.classList.toggle("sleeping", sleeping);
      const status = card.querySelector(".tab-status");
      status.textContent = sleeping ? "UYKUDA" : "AKTİF";
      status.classList.toggle("sleeping", sleeping);
      const selected = card.querySelector(".selected-badge");
      selected.hidden = sleeping || !record.active;
      const audible = card.querySelector(".audible-badge");
      audible.hidden = !record.audible;
      const pinned = card.querySelector(".pinned-badge");
      pinned.hidden = !record.pinned;
      const favorite = card.querySelector(".favorite-button");
      favorite.textContent = record.favorite ? "★" : "☆";
      favorite.classList.toggle("active", Boolean(record.favorite));
      favorite.setAttribute("aria-label", record.favorite ? "Favoriden çıkar" : "Favoriye ekle");
      const discard = card.querySelector('[data-action="discard"]');
      discard.textContent = sleeping ? "Uyandır" : "Uyut";
      discard.title = sleeping ? "Sekmeyi uyandır" : "Sekmeyi uyut";
      discard.disabled = false;
      const pin = card.querySelector('[data-action="pin"]');
      pin.textContent = record.pinned ? "Kaldır" : "Sabitle";
      pin.title = record.pinned ? "Sabitlemeyi kaldır" : "Sekmeyi sabitle";
      pin.classList.toggle("pinned", Boolean(record.pinned));
      card.addEventListener("click", (event) => {
        if (event.target.closest("button[data-action]")) return;
        actionFor(card, "focus");
      });
      grid.append(card);
    }
  }

  async function load() {
    try {
      currentState = await invoke("runtime", "sendMessage", { type: "GET_STATE" });
      render();
    } catch (error) {
      statusLine.textContent = `Sekmeler yüklenemedi: ${error.message || "bilinmeyen hata"}`;
    }
  }

  async function actionFor(card, action) {
    const id = card.dataset.id;
    if (action === "close") {
      const record = currentState.records.find((item) => item.id === id);
      const title = record?.title || record?.url || "bu sekme";
      if (!globalThis.confirm(`“${title}” kapatılsın mı? Bu işlem sekmeyi panodan kaldırır.`)) return;
    }
    try {
      const result = await invoke("runtime", "sendMessage", { type: "TAB_ACTION", action, id });
      if (!result?.ok) {
        statusLine.textContent = result?.error || "İşlem tamamlanamadı.";
        return;
      }
      await load();
    } catch (error) {
      statusLine.textContent = error.message || "İşlem tamamlanamadı.";
    }
  }

  grid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (button) {
      const card = button.closest(".tab-card");
      if (card) actionFor(card, button.dataset.action);
    }
  });
  document.querySelector("#refresh-button").addEventListener("click", load);
  document.querySelector("#density-button")?.addEventListener("click", () => {
    applyDensity(!document.body.classList.contains("compact"));
  });
  document.querySelector("#theme-button")?.addEventListener("click", () => {
    const ice = document.body.dataset.theme !== "ice";
    if (ice) document.body.dataset.theme = "ice";
    else delete document.body.dataset.theme;
    document.querySelector("#theme-button")?.setAttribute("aria-pressed", String(ice));
    try { localStorage.setItem(THEME_KEY, ice ? "ice" : "graphite"); } catch {}
  });
  searchInput.addEventListener("input", render);
  function clearSearch() {
    searchInput.value = "";
    render();
    searchInput.focus();
  }
  clearSearchButton.addEventListener("click", clearSearch);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
    }
  });
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      setFilter(button.dataset.filter);
    });
  });

  function setFilter(name) {
    activeFilter = name;
    document.querySelectorAll(".filter-button").forEach((item) => {
      const selected = item.dataset.filter === name;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    render();
  }

  document.addEventListener("keydown", (event) => {
    if (event.target === searchInput || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "/") {
      event.preventDefault();
      searchInput.focus();
    } else if (event.key === "1") setFilter("all");
    else if (event.key === "2") setFilter("active");
    else if (event.key === "3") setFilter("sleeping");
  });
  api.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE_UPDATED") load();
  });
  load();
})();
