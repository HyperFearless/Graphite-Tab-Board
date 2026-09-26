# Graphite Tab Board

[![AMO version](https://img.shields.io/amo/v/graphite-tab-board?label=AMO&color=0060df)](https://addons.mozilla.org/firefox/addon/graphite-tab-board/)
[![Downloads](https://img.shields.io/amo/dw/graphite-tab-board?label=downloads&color=0060df)](https://addons.mozilla.org/firefox/addon/graphite-tab-board/)
[![License: MPL 2.0](https://img.shields.io/badge/license-MPL%202.0-blue.svg)](https://www.mozilla.org/MPL/2.0/)

Turn your new tab page into a persistent, searchable tab board. Sleep the tabs you are not using, pin the ones you always need, and find the rest by title, URL or domain — everything stays on your device.

**No accounts, no servers, no analytics, no build step, no dependencies.**

> Türkçe sürüm: [README.tr.md](README.tr.md) · Hata bildirimi: [Issues](https://github.com/HyperFearless/Graphite-Tab-Board/issues)

## Install

[![Get the Firefox extension](https://img.shields.io/badge/Get%20the%20Firefox%20extension-0060df?logo=firefox-browser)](https://addons.mozilla.org/firefox/addon/graphite-tab-board/)

From addons.mozilla.org, or search for **Graphite Tab Board** in the Firefox Add-ons Manager.

Requires **Firefox 109+** on desktop. Firefox for Android is not supported.

## Two themes, two languages

The default theme is **ice blue** on a dark base; the alternate **graphite mint** theme is
one click away and the choice is remembered. The interface ships in **English and Turkish**
and can be switched from the header.

## Features

- Responsive card grid scaling down from 8 → 7 → 6 → 5 → 4 → 3 → 2 columns (never collapses to a single column); with active/sleeping states.
- Normal tabs are stored with title, URL, favicon, metadata image, pin state, favorite state, active/audible/index info, and a durable record id.
- Favorites are sorted first; remaining cards follow the browser tab order in the focused window. Cards show active/sleeping, selected, audible, and pinned badges.
- Local, live title and URL search (including domains) works combined with All/Active/Sleeping filters. Turkish case matching accepts dotted and dotless I variants. Clear with × or Escape; counters stay global while the status line reports the visible result count. Search does not open tabs, wake tabs, or make network requests.
- Sticky search + filter block: the full-width search box and filter buttons stay pinned at the top while scrolling; the header card scrolls away.
- Density button (▤) switches to compact cards (small image, single-line title) and the selection is remembered locally.
- Theme button (◐) switches between ice blue (default) and graphite mint; the selection is remembered locally.
- Keyboard shortcuts: `/` focuses search, `1`/`2`/`3` switch the All/Active/Sleeping filters (not triggered while typing in the search box).
- Slim counters and tabular numbers; the ACTIVE badge is neutral gray, the mint accent is reserved for actions and focus only.
- Focus/wake, sleep (suspend), reload, pin/unpin, favorite, and close actions.
- Every close action on the board asks for confirmation, including active and sleeping cards. A tab closed directly in Firefox is deleted from persistent records and is not restored. The extension never closes any tab on its own.
- Firefox window-close removals are processed with a short delay: closing one of several normal windows deletes those records, while closing the last normal window keeps the cards offline to recover them on the next start.
- Metadata comes primarily from the YouTube thumbnail, then `og:image`, then `twitter:image`. The cached metadata image, favicon, and title provide graceful fallbacks; screenshots are never taken.
- Private windows are not supported: `incognito: not_allowed` in the manifest keeps the board and background out of private windows; no private tab is shown, saved, or restored.
- On browser/extension startup, missing saved normal tabs are restored where Firefox permits the URL; board tabs are excluded. Restored tabs keep their pinned state, and saved tabs sharing the same URL remain separate records instead of being merged.
- The toolbar button focuses the existing board tab or opens one.
- Firefox's new-tab redirect uses the same `dashboard.html` (and is accepted by Chromium-based loaders that support `chrome_url_overrides.newtab`).

## Privacy

Records are kept in `storage.local` and **never leave your device**. There are no accounts,
no analytics, no telemetry and no remote servers. The manifest declares
`data_collection_permissions: { "required": ["none"] }`.

Private browsing is not supported and the extension never runs there.

### Permissions

| Permission  | Why it is needed                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `tabs`      | Reads the title and URL of open tabs to build cards, and moves, pins and closes tabs.                    |
| `storage`   | Saves tab records and your view preferences locally.                                                      |
| `<all_urls>` | A content script reads **only** the page title, the `og:image` / `twitter:image` preview tag and the favicon. It never reads page content, form data or input values. |

The extension takes **no screenshots**. Card previews come from the page's own Open Graph
metadata, and YouTube cards use the public thumbnail endpoint.

## Development

The project has no build step and no dependencies — the files in this repository are the
files that ship. With a recent Node.js installation, validate the manifest and JavaScript
syntax and run the background regression tests:

```powershell
Get-Content .\manifest.json -Raw | ConvertFrom-Json | Out-Null
node --check .\background.js
node --check .\metadata.js
node --check .\dashboard.js
node --test .\background.test.cjs
```

To try it without publishing, load `manifest.json` as a temporary add-on via
`about:debugging` → *This Firefox* → *Load Temporary Add-on*.

## License

[Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/)

```
This Source Code Form is subject to the terms of the Mozilla Public
License, v. 2.0. If a copy of the MPL was not distributed with this
file, You can obtain one at https://mozilla.org/MPL/2.0/.
```

If you make changes to the extension source, those changes must be released under the MPL.