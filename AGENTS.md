# GeoMap

Hackathon web map of Norway. 4 people, each working with coding agents. Speed over polish.

## Stack
- Vite + TypeScript (no framework) + MapLibre GL JS
- Static site, no backend. Deployed to GitHub Pages on push to `main`.

## Commands
- `npm install`
- `npm run dev` — local dev server
- `npm run build` — typecheck + build. Must pass before pushing.

## Structure
- `src/main.ts` — map setup and Kartverket basemap. Touch rarely.
- `src/features/` — one file per feature. Each exports `default function (map: Map)`.
- `src/features/index.ts` — register new features here (one line each).
- `src/features/address-click.ts` — example feature to copy.

## Rules
- Put new work in a new file under `src/features/`. Avoid editing others' features; this keeps merge conflicts small.
- Small commits. `git pull --rebase` before `git push`. Push straight to `main`.
- Prefer free, keyless Norwegian open data APIs. Never commit API keys.
- Keep it simple: no new dependencies unless they save real work.

## Norwegian geodata (free, CORS-enabled, no key)
- Kartverket tiles: `https://cache.kartverket.no/v1/wmts/1.0.0/{layer}/default/webmercator/{z}/{y}/{x}.png` (layers: `topo`, `topograatone`, `toporaster`, `sjokartraster`)
- Addresses: `https://ws.geonorge.no/adresser/v1/` (`sok`, `punktsok`)
- Place names: `https://ws.geonorge.no/stedsnavn/v1/`
- Municipalities/counties: `https://ws.geonorge.no/kommuneinfo/v1/`
- Elevation: `https://ws.geonorge.no/hoydedata/v1/`
- Dataset catalog: https://www.geonorge.no/ — many datasets offer WMS/WFS/GeoJSON.
- Coordinates: MapLibre uses `[lng, lat]` (EPSG:4326). Geonorge APIs often default to EPSG:4258/25833; pass `utkoordsys=4326` or `koordsys=4326` where supported.
