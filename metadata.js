/* Extract page metadata without taking screenshots. */
(function () {
  const api = globalThis.browser || globalThis.chrome;
  let lastSignature = "";

  function meta(...selectors) {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const value = node?.getAttribute("content")?.trim();
      if (value) return value;
    }
    return "";
  }

  function absoluteUrl(value) {
    if (!value) return "";
    try { return new URL(value, location.href).href; } catch { return ""; }
  }

  function youtubeVideoId() {
    if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(location.hostname)) return "";
    try {
      const url = new URL(location.href);
      if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0];
      const fromQuery = url.searchParams.get("v");
      if (fromQuery) return fromQuery;
      const fromPath = url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/i);
      if (fromPath) return fromPath[1];
    } catch {}
    return "";
  }

  function favIcon() {
    // rel is a token list ("icon", "shortcut icon", "Icon"): match the token,
    // case-insensitively, instead of the exact attribute value.
    const node = document.querySelector('link[rel~="icon" i][href]') ||
      document.querySelector('link[rel~="apple-touch-icon" i][href]');
    return absoluteUrl(node?.getAttribute("href")?.trim() || "/favicon.ico");
  }

  // Only the title, preview image and favicon are read; nothing else from the page.
  function extract() {
    const youtubeId = youtubeVideoId();
    // YouTube thumbnails are stable, CDN-hosted and more useful than the
    // generic og:image (which is often a channel or player placeholder).
    const imageUrl = youtubeId
      ? `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`
      : absoluteUrl(meta('meta[property="og:image"]', 'meta[name="twitter:image"]', 'meta[property="twitter:image"]', 'meta[name="twitter:image:src"]'));
    const title = document.title?.trim() || meta('meta[property="og:title"]', 'meta[name="twitter:title"]') || location.href;
    return { title, imageUrl, favIconUrl: favIcon() };
  }

  function send(force = false) {
    const metadata = extract();
    const signature = JSON.stringify(metadata);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    api.runtime.sendMessage({ type: "PAGE_METADATA", metadata }).catch?.(() => {});
  }

  // The background asks again after in-page navigations, because it drops
  // the previous page's preview even when this page's tags look unchanged.
  api.runtime.onMessage.addListener((message) => {
    if (message?.type === "REQUEST_METADATA") send(true);
  });

  send();
  setTimeout(() => send(), 1200);
  setTimeout(() => send(), 4000);
  const titleNode = document.querySelector("title");
  if (titleNode) new MutationObserver(() => send()).observe(titleNode, { childList: true, subtree: true, characterData: true });
})();
