# GeoMap (product name: Omnium)

Hackathon web app: all public info about any property in Norway (start: Oslo + Akershus). Search an address, see data, stats and a rating.
See `PLAN.md` for product, roles and tasks, `docs/DESIGN.md` for look and page flow, `docs/PROFILE.md` for the address profile. Collect data sources in `SOURCES.md`.
4 people, each working with a coding agent. Speed over polish. `README.md` is the guide for humans; this file is for agents.

## You do the chores for your human
The team wants to think about the product, not about tooling. **You (the agent) do every routine step yourself, without being asked.** Don't tell your human to run a command you can run. Explain what you did in plain, short English.

**At the start of every session:**
1. Find out who your human is (Lukas, Sverre, Erik or Even). If you don't know, ask once and remember it for the session.
2. Check the tools: Node 22+ and git. If something is missing, install it if you can (on Windows: `winget install OpenJS.NodeJS.LTS`, `winget install Git.Git`), otherwise give the one exact command.
3. Sync: commit or stash their open work, then `git pull --rebase`.
4. If `package-lock.json` changed or `node_modules` is missing: `npm install`.
5. If `data/geomap.duckdb` is missing, or the pull added or changed files in `data/scripts/`: stop the dev server, then `npm run ingest` (or just the changed scripts).
6. Start `npm run dev` in the background if it isn't running, and give them the link http://localhost:5173.
7. Tell them in 3–5 lines: what teammates pushed since last time (`git log`), and their own next task from their role in `PLAN.md`.

**While working:**
- Stay in your human's folders (see "Roles" in `PLAN.md`). If a task needs a change in someone else's file, say so and suggest the message to send them.
- Anything people see follows `docs/DESIGN.md` and uses the CSS variables in `web/src/style.css`.
- When a piece works: run `npm run typecheck` and `npm test`. If you touched data, data points, rating, profile or summary, also run `npm run test:addresses` (needs `npm run dev`). Then commit (small, clear message), `git pull --rebase`, `git push` to `main`. Do this yourself; tell your human what you pushed. Never push code that fails typecheck or tests, or breaks `npm run dev`. If a data change makes an address test fail on purpose, update `api/test/addresses.test.ts` and `docs/TEST_ADDRESSES.md` in the same commit.
- Merge conflicts: resolve them yourself. In a file your human doesn't own, keep the owner's version and redo your change on top.
- Keep the docs true as you go: add new sources to `SOURCES.md` (under your human's heading), new commands to "Run it" below, and cross out finished tasks in `PLAN.md` (`~~task~~`) in your human's role only.
- Need a key (e.g. `ANTHROPIC_API_KEY`)? Ask your human for it and put it in `.env` yourself. Never commit `.env`, keys or data files.
- Check your work the way a user would: open the page or call the endpoint, try the 5 test addresses in `docs/TEST_ADDRESSES.md`.

## Run it
Needs Node 22+. From the repo root:
```bash
npm run setup               # npm install + build the database (first time, or after big data changes)
npm install                 # after pulling new dependencies
npm run ingest              # rebuild data/geomap.duckdb from every script in data/scripts/ (or: npm run ingest kommuner)
npm run dev                 # API on :3000 + web on http://localhost:5173 (open this)
```
- `npm run typecheck` checks api + web. `npm run build` builds the web app to `web/dist/`.
- `npm test`: rating rules, no database needed (also runs in CI on every push, `.github/workflows/ci.yml`).
- `npm run test:addresses`: checks the 5 test addresses (hazards, scores, caps, summary facts) against the running API. Needs `npm run dev`.
- Stop `npm run dev` before running an ingest: DuckDB lets only one process write the file.
- AI summaries need `ANTHROPIC_API_KEY` in `.env` (copy `.env.example`). Everything else runs without keys.
- Check the API: `http://localhost:5173/api/health` lists loaded tables. Address profile: `http://localhost:5173/api/address/0301-10223-22/profile`.
- In the browser console (dev only), `map` is the MapLibre map.

## Add things (no shared file to edit)
- **Dataset:** `data/scripts/<name>.ts` (copy `kommuner.ts`). Helpers in `data/scripts/lib.ts`: `download`, `getJson`, `rawPath`. Use `conn` from `api/src/db.ts`. Clip to Oslo + Akershus with `WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))`.
- **Endpoint:** `api/src/routes/<name>.ts` exporting a Hono app is auto-mounted at `/api/<name>`. For a map layer, one line: `export default new Hono().get("/", (c) => layer(c, "<table>"));` (`api/src/geojson.ts` handles bbox, q, limit and GeoJSON). Throw `HTTPException` for JSON errors.
- **Data point in the address profile:** one entry in `DATA_POINTS` in `api/src/datapoints.ts` (and its source in `SOURCES`). Rating and web app pick it up. Then tell Even, who adds its info text to `docs/TEXTS.md` and its fact sentence to `docs/FACTS.md`; Lukas adds the matching rule to `RULES` in `api/src/summary.ts`. Until then the summary uses a plain fallback sentence and the data point has no info text.
- **Map feature:** `web/src/features/<name>.ts` exporting `default function (map: Map)` is auto-loaded after the map loads (copy `kommuner.ts`).

## Stack
- TypeScript everywhere. Node 22+.
- `web/`: Vite + TypeScript (no framework) + MapLibre GL JS.
- `api/`: Node + Hono + DuckDB (`@duckdb/node-api`) with the `spatial` extension.
- One DuckDB file holds all data. No database server, no Docker.
- AI summaries: Claude Haiku 5.5 (`claude-haiku-5-5`) via `@anthropic-ai/sdk`, called only from `api/`. See `PLAN.md`.

## Why this shape
- Large data cannot ship to the browser. The browser asks the API for only what is in view or matches a search.
- DuckDB reads CSV, Parquet, GeoJSON, Shapefile and GeoPackage directly, and runs fast spatial + text queries.

## Layout (create as needed)
```
web/                 frontend
  src/main.ts        map setup + Kartverket basemap
  src/app/           pages: start.ts (search), address.ts (address page), router.ts, map.ts, search.ts
  src/features/      one file per feature: export default function (map: Map)
  src/style.css      brand colour tokens (CSS variables), from the logo
  public/            logo.png, logo-mark.png (favicon)
api/                 backend
  src/index.ts       Hono app, auto-mounts every file in src/routes/, JSON errors
  src/routes/        one file per dataset/endpoint
  src/db.ts          shared DuckDB connection (opens data/geomap.duckdb), query() helper
  src/geojson.ts     layer(): standard bbox/q/limit GeoJSON endpoint for a table
  src/datapoints.ts  categories, sources and data points of the address profile (one entry each)
  src/profile.ts     builds the address profile (rating.ts scores it, address.ts looks up ids)
  src/texts.ts       reads info texts from docs/TEXTS.md at startup (restart the API after editing it)
  src/summary.ts     AI summary: fact sentences (rules from docs/FACTS.md) + Claude Haiku, cached in table summaries
docs/
  PROFILE.md         standard for the address profile (read before touching rating, profile or the address panel)
  DESIGN.md          look, page flow, map style (read before touching anything people see)
  TEST_ADDRESSES.md  the 5 addresses we test and demo with
  TEXTS.md           info text per data point (shown when a data point is opened)
  FACTS.md           fact-sentence rules for the AI summary
  DEMO.md            demo story, pitch, readiness table and checklist
  brand/             original logo
data/
  scripts/           one ingest script per dataset: download -> data/raw/ -> table in geomap.duckdb
                     (run.ts runs them, lib.ts has helpers)
  raw/               downloaded files (gitignored)
  geomap.duckdb      built database (gitignored)
```

## Data rules
- Never commit data files. Commit the script that downloads and loads them, so anyone can rebuild.
- One table per dataset. Always include a `geom` GEOMETRY column in EPSG:4326 (lng, lat). Convert with `ST_Transform` on ingest (Norwegian data is often EPSG:25833 or 4258).
- Add a `name`/text column for search.
- Ingest scripts must be re-runnable: `CREATE OR REPLACE TABLE`.

## API conventions
- **Every API response is JSON.** No HTML, CSV or plain text. This keeps every endpoint usable the same way by the web app, other agents and scripts.
  - Map layers return GeoJSON (it is JSON). Everything else returns plain JSON objects.
  - Field names in `camelCase`. Coordinates as numbers in EPSG:4326 (`lng`, `lat`). Dates as ISO 8601 strings.
  - Errors are JSON too: an error code and a readable message, with a matching HTTP status.
- **Missing data is left out, never faked.** No empty values, zeros or guesses standing in for data we do not have. Leave it out. In the address profile, list it as missing (see `docs/PROFILE.md`) so the UI can show it as "Unavailable".
- **No guessing scores.** A score is computed only from data we actually have. If too much important data is missing, say "insufficient data" with a reason instead of giving a number.
- The address profile (`GET /api/address/:id/profile`) follows the standard in `docs/PROFILE.md`. Change the standard there first, then the code.
- `GET /api/<dataset>?bbox=minLng,minLat,maxLng,maxLat&q=text&limit=1000` returns GeoJSON FeatureCollection.
- Always apply `limit` (default 1000). Filter by bbox with `ST_Intersects(geom, ST_MakeEnvelope(...))`.
- Web dev server proxies `/api` to the API (Vite `server.proxy`), so no CORS setup.
- Huge point layers: at low zoom return clustered/aggregated results, or pre-build PMTiles into `data/`.

## Team rules
- New work goes in new files (`web/src/features/`, `api/src/routes/`, `data/scripts/`). Avoid editing others' files; this keeps merge conflicts small.
- Small commits. `git pull --rebase` before `git push`. Push straight to `main`.
- Never commit API keys. Prefer free, keyless Norwegian open data.
- Keep it simple: add a dependency only if it saves real work.
- Keep "Run it" above up to date when commands change.

## Norwegian geodata (free, CORS-enabled, no key)
- Kartverket tiles: `https://cache.kartverket.no/v1/wmts/1.0.0/{layer}/default/webmercator/{z}/{y}/{x}.png` (layers: `topo`, `topograatone`, `toporaster`, `sjokartraster`). Attribution: "© Kartverket".
- Addresses: `https://ws.geonorge.no/adresser/v1/` (`sok`, `punktsok`)
- Place names: `https://ws.geonorge.no/stedsnavn/v1/`
- Municipalities/counties: `https://ws.geonorge.no/kommuneinfo/v1/`
- Elevation: `https://ws.geonorge.no/hoydedata/v1/`
- Bulk downloads: https://www.geonorge.no/ (many datasets as GeoJSON, GML, FGDB, GeoPackage).
- MapLibre uses `[lng, lat]`.
