# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

CollectTrack is a zero-build vanilla HTML/CSS/JS PWA for tracking personal payment collections. There is no package.json, no bundler, no framework — the entire app lives in `index.html`.

## Development

No build step. Open `index.html` directly in a browser or serve with any static file server:

```bash
npx serve .
# or
python -m http.server
```

The service worker only activates over HTTPS or `localhost`. On plain `file://` the SW is skipped and cache-first behaviour won't work, but the app still functions.

## Architecture

All application code is in a single `<script>` block inside `index.html`. Key pieces:

- **Data source** — a Google Sheets spreadsheet published as CSV. The URL is hardcoded in `CSV_URL` near the top of the script. Expected columns (case-insensitive): `NAME`, `CATEGORY`, `AMOUNT`, `DATE`.
- **Amount format** — Colombian pesos with period as thousands separator (`$21.000`). `parseAmount()` strips `$` and `.` before parsing; `fmtAmount()` uses `toLocaleString('es-CO')` to re-format.
- **Offline cache** — two independent caches:
  - `localStorage` key `collecttrack_v1`: parsed row data (JSON), used to render stale data immediately on next load.
  - Service worker cache `collecttrack-v1` (in `sw.js`): static shell files (`index.html`, `manifest.json`, `icon.svg`). Google Sheets requests bypass the SW and always hit the network.
- **Category styling** — `CAT_STYLE` maps lowercase-slugified category keys to CSS class pairs (`badge` + `dot`). Any category not in the map falls back to `cat-default` / `dot-default`. To add a new category, add an entry to `CAT_STYLE` **and** the corresponding `.cat-*` / `.dot-*` CSS rules.
- **Data flow**: `loadData()` → renders cache → fetches CSV → `parseCsv()` → `populateFilters()` + `applyFilters()` + `updateKPIs()` + `renderSummary()`.

## PWA update behaviour

When `sw.js` or static assets change, bump the `CACHE` constant in `sw.js` (e.g. `collecttrack-v2`) so the activate handler evicts the old cache. Also bump `CACHE_KEY` in `index.html` if the localStorage data schema changes.
