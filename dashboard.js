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
  const cardById = new Map();
  const DENSITY_KEY = "gtb-density";
  const THEME_KEY = "gtb-theme";
  const LANG_KEY = "gtb-lang";
  const I18N = {
    tr: {
      title: "Graphite Sekme Panosu",
      eyebrow: "SEKME PANOSU",
      filterAll: "Tümü", filterActive: "Aktif", filterSleeping: "Uykuda",
      filterNavAria: "Sekme filtresi",
      searchAria: "Sekmelerde ara", searchPh: "Sekmelerde ara",
      clearSearch: "Aramayı temizle", searchKbdTitle: "Kısayol: /",
      summaryAria: "Sekme özeti", sumTabs: "sekme", sumSleeping: "uykuda", sumFav: "favori",
      loading: "Panon yükleniyor…",
      status: (a, b) => `${a} sekmeden ${b} gösteriliyor.`,
      emptySearchT: "Aramanızla eşleşen sekme yok",
      emptySearchD: "Başka bir harf/kelime deneyin veya aramayı temizleyin.",
      emptyAllT: "Panoda sekme yok",
      emptyAllD: "Bir sayfa açtığınızda otomatik olarak burada görünür.",
      emptyFilterT: "Bu filtrede sekme yok",
      emptyFilterD: "Diğer sekmeleri görmek için Tümü filtresini seçin.",
      badgeActive: "AKTİF", badgeSleeping: "UYKUDA",
      badgeSelected: "SEÇİLİ", badgeAudible: "SES", badgePinned: "SABİT",
      untitled: "Adsız sekme", previewAlt: "Sekme önizlemesi", localPage: "yerel sayfa",
      favAdd: "Favoriye ekle", favRemove: "Favoriden çıkar",
      wake: "Uyandır", sleep: "Uyut", wakeTitle: "Sekmeyi uyandır", sleepTitle: "Sekmeyi uyut",
      reload: "Yenile", reloadTitle: "Sekmeyi yenile", close: "Kapat", closeTitle: "Sekmeyi kapat",
      unpin: "Kaldır", pin: "Sabitle", unpinTitle: "Sabitlemeyi kaldır", pinTitle: "Sekmeyi sabitle",
      thisTab: "bu sekme",
      closeConfirm: (title) => `“${title}” kapatılsın mı? Bu işlem sekmeyi panodan kaldırır.`,
      actionFailed: "İşlem tamamlanamadı.",
      loadFailed: (msg) => `Sekmeler yüklenemedi: ${msg}`,
      unknownError: "bilinmeyen hata",
      footerA: "Normal sekmeler yerel olarak kaydedilir.",
      footerB: "Onayınız olmadan hiçbir sekme kapanmaz.",
      themeTitle: "Temayı değiştir", densityTitle: "Yoğun görünüm", refreshTitle: "Panoyu yenile",
      langTitle: "English'e geç", langLabel: "EN", statusStackAria: "Sekme durumu"
    },
    en: {
      title: "Graphite Tab Board",
      eyebrow: "TAB BOARD",
      filterAll: "All", filterActive: "Active", filterSleeping: "Sleeping",
      filterNavAria: "Tab filter",
      searchAria: "Search tabs", searchPh: "Search tabs",
      clearSearch: "Clear search", searchKbdTitle: "Shortcut: /",
      summaryAria: "Tab summary", sumTabs: "tabs", sumSleeping: "sleeping", sumFav: "favorites",
      loading: "Loading board…",
      status: (a, b) => `Showing ${b} of ${a} tabs.`,
      emptySearchT: "No tabs match your search",
      emptySearchD: "Try another word or clear the search.",
      emptyAllT: "No tabs on the board",
      emptyAllD: "Open a page and it will appear here automatically.",
      emptyFilterT: "No tabs in this filter",
      emptyFilterD: "Select the All filter to see other tabs.",
      badgeActive: "ACTIVE", badgeSleeping: "SLEEPING",
      badgeSelected: "SELECTED", badgeAudible: "AUDIO", badgePinned: "PINNED",
      untitled: "Untitled tab", previewAlt: "Tab preview", localPage: "local page",
      favAdd: "Add to favorites", favRemove: "Remove from favorites",
      wake: "Wake", sleep: "Sleep", wakeTitle: "Wake tab", sleepTitle: "Sleep tab",
      reload: "Reload", reloadTitle: "Reload tab", close: "Close", closeTitle: "Close tab",
      unpin: "Unpin", pin: "Pin", unpinTitle: "Unpin tab", pinTitle: "Pin tab",
      thisTab: "this tab",
      closeConfirm: (title) => `Close “${title}”? This removes the tab from the board.`,
      actionFailed: "Action could not be completed.",
      loadFailed: (msg) => `Tabs could not be loaded: ${msg}`,
      unknownError: "unknown error",
      footerA: "Normal tabs are stored locally.",
      footerB: "No tab closes without your confirmation.",
      themeTitle: "Change theme", densityTitle: "Dense view", refreshTitle: "Refresh board",
      langTitle: "Türkçe'ye geç", langLabel: "TR", statusStackAria: "Tab status"
    }
  };
  let lang = "tr";
  try {
    if (localStorage.getItem(LANG_KEY) === "en") lang = "en";
  } catch {}
  function t(key) { return I18N[lang][key]; }

  function applyLang(next) {
    lang = next;
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
    document.documentElement.lang = lang;
    document.title = t("title");
    document.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.dataset.i18n;
      if (typeof I18N[lang][key] === "string") node.textContent = I18N[lang][key];
    });
    const searchBox = document.querySelector(".search-box");
    if (searchBox) searchBox.setAttribute("aria-label", t("searchAria"));
    searchInput.setAttribute("aria-label", t("searchAria"));
    searchInput.placeholder = t("searchPh");
    const searchKbd = document.querySelector("#search-kbd");
    if (searchKbd) searchKbd.title = t("searchKbdTitle");
    clearSearchButton.setAttribute("aria-label", t("clearSearch"));
    clearSearchButton.title = t("clearSearch");
    document.querySelector(".filter-group")?.setAttribute("aria-label", t("filterNavAria"));
    document.querySelectorAll(".filter-button").forEach((button) => {
      const map = { all: t("filterAll"), active: t("filterActive"), sleeping: t("filterSleeping") };
      const num = { all: "1", active: "2", sleeping: "3" }[button.dataset.filter];
      button.title = `${map[button.dataset.filter]} (${num})`;
    });
    document.querySelector(".summary")?.setAttribute("aria-label", t("summaryAria"));
    const themeButton = document.querySelector("#theme-button");
    if (themeButton) { themeButton.title = t("themeTitle"); themeButton.setAttribute("aria-label", t("themeTitle")); }
    const densityButton = document.querySelector("#density-button");
    if (densityButton) { densityButton.title = t("densityTitle"); densityButton.setAttribute("aria-label", t("densityTitle")); }
    const refreshButton = document.querySelector("#refresh-button");
    if (refreshButton) { refreshButton.title = t("refreshTitle"); refreshButton.setAttribute("aria-label", t("refreshTitle")); }
    const langButton = document.querySelector("#lang-button");
    if (langButton) {
      langButton.textContent = t("langLabel");
      langButton.title = t("langTitle");
      langButton.setAttribute("aria-label", t("langTitle"));
    }
    template.content.querySelector(".selected-badge").textContent = t("badgeSelected");
    template.content.querySelector(".audible-badge").textContent = t("badgeAudible");
    template.content.querySelector(".pinned-badge").textContent = t("badgePinned");
    template.content.querySelector(".status-stack")?.setAttribute("aria-label", t("statusStackAria"));
    template.content.querySelector(".favorite-button")?.setAttribute("aria-label", t("favAdd"));
    render();
  }

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
    if (localStorage.getItem(THEME_KEY) === "graphite") {
      document.body.dataset.theme = "graphite";
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
    try { return new URL(url).hostname.replace(/^www\./, "") || t("localPage"); } catch { return t("localPage"); }
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


  function buildCard(record) {
    const card = template.content.firstElementChild.cloneNode(true);
    card.dataset.id = record.id;
    const favicon = card.querySelector(".card-favicon");
    if (favicon) {
      favicon.addEventListener("error", () => {
        favicon._src = "";
        favicon.removeAttribute("src");
        favicon.hidden = true;
      });
    }
    const image = card.querySelector(".card-image");
    image.addEventListener("error", () => {
      const next = (card._fallbacks || []).shift();
      if (next) {
        card._src = next;
        image.src = next;
      } else {
        card._src = "";
        image.removeAttribute("src");
      }
    });
    card.addEventListener("click", (event) => {
      if (event.target.closest("button[data-action]")) return;
      actionFor(card, "focus");
    });
    syncCard(card, record);
    return card;
  }

  function syncCard(card, record) {
    card.querySelector(".card-domain").textContent = hostFor(record.url);
    const favicon = card.querySelector(".card-favicon");
    if (favicon) {
      const favIconUrl = record.favIconUrl || "";
      if (favIconUrl !== favicon._src) {
        favicon._src = favIconUrl;
        if (favIconUrl) favicon.src = favIconUrl;
        else favicon.removeAttribute("src");
      }
      favicon.hidden = !favIconUrl;
    }
    card.querySelector(".card-title").textContent = escapeText(record.title || record.url || t("untitled"));
    card.querySelector(".card-url").textContent = escapeText(record.url);
    const image = card.querySelector(".card-image");
    const imageUrl = imageFor(record);
    if (imageUrl !== card._src) {
      card._src = imageUrl;
      card._fallbacks = [record.cachedImageUrl, record.favIconUrl].filter((url) => url && url !== imageUrl);
      if (imageUrl) image.src = imageUrl;
      else image.removeAttribute("src");
    }
    image.alt = record.title || t("previewAlt");
    const sleeping = isSleeping(record);
    card.classList.toggle("sleeping", sleeping);
    const status = card.querySelector(".tab-status");
    status.textContent = sleeping ? t("badgeSleeping") : t("badgeActive");
    status.classList.toggle("sleeping", sleeping);
    card.querySelector(".selected-badge").hidden = sleeping || !record.active;
    card.querySelector(".audible-badge").hidden = !record.audible;
    card.querySelector(".pinned-badge").hidden = !record.pinned;
    const favorite = card.querySelector(".favorite-button");
    favorite.textContent = record.favorite ? "★" : "☆";
    favorite.classList.toggle("active", Boolean(record.favorite));
    favorite.setAttribute("aria-label", record.favorite ? t("favRemove") : t("favAdd"));
    favorite.title = record.favorite ? t("favRemove") : t("favAdd");
    const discard = card.querySelector('[data-action="discard"]');
    discard.textContent = sleeping ? t("wake") : t("sleep");
    discard.title = sleeping ? t("wakeTitle") : t("sleepTitle");
    discard.disabled = false;
    const pin = card.querySelector('[data-action="pin"]');
    pin.textContent = record.pinned ? t("unpin") : t("pin");
    pin.title = record.pinned ? t("unpinTitle") : t("pinTitle");
    pin.classList.toggle("pinned", Boolean(record.pinned));
    card.querySelector('[data-action="reload"]').textContent = t("reload");
    card.querySelector('[data-action="reload"]').title = t("reloadTitle");
    card.querySelector('[data-action="close"]').textContent = t("close");
    card.querySelector('[data-action="close"]').title = t("closeTitle");
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
    empty.hidden = records.length !== 0;
    document.querySelector("#tab-count").textContent = allRecords.length;
    document.querySelector("#sleeping-count").textContent = allRecords.filter(isSleeping).length;
    document.querySelector("#favorite-count").textContent = allRecords.filter((record) => record.favorite).length;
    statusLine.textContent = t("status")(allRecords.length, records.length);
    empty.querySelector("h2").textContent = query
      ? t("emptySearchT")
      : activeFilter === "all" ? t("emptyAllT") : t("emptyFilterT");
    empty.querySelector("p").textContent = query
      ? t("emptySearchD")
      : activeFilter === "all" ? t("emptyAllD") : t("emptyFilterD");

    // Keyed render: reuse card nodes by record id. Only added/removed cards
    // touch the DOM; order changes are cheap append-moves, not rebuilds.
    const visibleIds = new Set(records.map((record) => record.id));
    for (const [id, element] of cardById) {
      if (!visibleIds.has(id)) {
        element.remove();
        cardById.delete(id);
      }
    }
    for (const record of records) {
      let card = cardById.get(record.id);
      if (!card) {
        card = buildCard(record);
        cardById.set(record.id, card);
      } else {
        syncCard(card, record);
      }
      grid.append(card);
    }
  }

  async function load() {
    try {
      currentState = await invoke("runtime", "sendMessage", { type: "GET_STATE" });
      render();
    } catch (error) {
      statusLine.textContent = t("loadFailed")(error.message || t("unknownError"));
    }
  }

  async function actionFor(card, action) {
    const id = card.dataset.id;
    if (action === "close") {
      const record = currentState.records.find((item) => item.id === id);
      const title = record?.title || record?.url || t("thisTab");
      if (!globalThis.confirm(t("closeConfirm")(title))) return;
    }
    try {
      const result = await invoke("runtime", "sendMessage", { type: "TAB_ACTION", action, id });
      if (!result?.ok) {
        statusLine.textContent = result?.error || t("actionFailed");
        return;
      }
      await load();
    } catch (error) {
      statusLine.textContent = error.message || t("actionFailed");
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
    const graphite = document.body.dataset.theme !== "graphite";
    if (graphite) document.body.dataset.theme = "graphite";
    else delete document.body.dataset.theme;
    document.querySelector("#theme-button")?.setAttribute("aria-pressed", String(graphite));
    try { localStorage.setItem(THEME_KEY, graphite ? "graphite" : "ice"); } catch {}
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
  document.querySelector("#lang-button")?.addEventListener("click", () => {
    applyLang(lang === "tr" ? "en" : "tr");
  });
  api.runtime.onMessage.addListener((message) => {
    if (message?.type === "STATE_UPDATED") load();
  });
  statusLine.textContent = t("loading");
  applyLang(lang);
  load();
})();
