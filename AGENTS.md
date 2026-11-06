# GeoMap

Hackathon web map: all public info about any property in Norway (start: Oslo + Akershus). Search an address, see data, stats and a rating.
See `PLAN.md` for product, roles and rating. Collect data sources in `SOURCES.md`.
4 people, each working with coding agents. Speed over polish. The repo starts empty on purpose.

## Stack
- TypeScript everywhere. Node 22+.
- `web/`: Vite + TypeScript (no framework) + MapLibre GL JS.
- `api/`: Node + Hono + DuckDB (`@duckdb/node-api`) with the `spatial` extension.
- One DuckDB file holds all data. No database server, no Docker.

## Why this shape
- Large data cannot ship to the browser. The browser asks the API for only what is in view or matches a search.
- DuckDB reads CSV, Parquet, GeoJSON, Shapefile and GeoPackage directly, and runs fast spatial + text queries.

## Layout (create as needed)
```
web/                 frontend
  src/main.ts        map setup + Kartverket basemap
  src/features/      one file per feature: export default function (map: Map)
api/                 backend
  src/index.ts       Hono app, registers routes
  src/routes/        one file per dataset/endpoint
  src/db.ts          shared DuckDB connection (opens data/geomap.duckdb)
data/
  scripts/           one ingest script per dataset: download -> data/raw/ -> table in geomap.duckdb
  raw/               downloaded files (gitignored)
  geomap.duckdb      built database (gitignored)
```

## Data rules
- Never commit data files. Commit the script that downloads and loads them, so anyone can rebuild.
- One table per dataset. Always include a `geom` GEOMETRY column in EPSG:4326 (lng, lat). Convert with `ST_Transform` on ingest (Norwegian data is often EPSG:25833 or 4258).
- Add a `name`/text column for search.
- Ingest scripts must be re-runnable: `CREATE OR REPLACE TABLE`.

## API conventions
- `GET /api/<dataset>?bbox=minLng,minLat,maxLng,maxLat&q=text&limit=1000` returns GeoJSON FeatureCollection.
- Always apply `limit` (default 1000). Filter by bbox with `ST_Intersects(geom, ST_MakeEnvelope(...))`.
- Web dev server proxies `/api` to the API (Vite `server.proxy`), so no CORS setup.
- Huge point layers: at low zoom return clustered/aggregated results, or pre-build PMTiles into `data/`.

## Team rules
- New work goes in new files (`web/src/features/`, `api/src/routes/`, `data/scripts/`). Avoid editing others' files; this keeps merge conflicts small.
- Small commits. `git pull --rebase` before `git push`. Push straight to `main`.
- Never commit API keys. Prefer free, keyless Norwegian open data.
- Keep it simple: add a dependency only if it saves real work.
- Put the commands to run the project in this file once they exist.

## Norwegian geodata (free, CORS-enabled, no key)
- Kartverket tiles: `https://cache.kartverket.no/v1/wmts/1.0.0/{layer}/default/webmercator/{z}/{y}/{x}.png` (layers: `topo`, `topograatone`, `toporaster`, `sjokartraster`). Attribution: "© Kartverket".
- Addresses: `https://ws.geonorge.no/adresser/v1/` (`sok`, `punktsok`)
- Place names: `https://ws.geonorge.no/stedsnavn/v1/`
- Municipalities/counties: `https://ws.geonorge.no/kommuneinfo/v1/`
- Elevation: `https://ws.geonorge.no/hoydedata/v1/`
- Bulk downloads: https://www.geonorge.no/ (many datasets as GeoJSON, GML, FGDB, GeoPackage).
- MapLibre uses `[lng, lat]`.
