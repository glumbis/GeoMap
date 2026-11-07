# Run Omnium anywhere

Omnium ships as **one Docker image** with everything inside: the web app, the API and the full database.
GitHub builds it on every push to `main` (`.github/workflows/docker.yml`) and publishes it as
`ghcr.io/glumbis/geomap:latest`.

## Run it (anyone, any computer with Docker)

```bash
docker run -p 3000:3000 ghcr.io/glumbis/geomap
```

Open http://localhost:3000. No Node, no ingest, no keys needed.
Optional: AI summaries with `-e ANTHROPIC_API_KEY=...` (without it the page shows the plain fact sentences).

## Live site

**https://omnium-e7ps.onrender.com** (Render free plan, Frankfurt, set up from `render.yaml`).
- Sleeps after 15 minutes without visitors; the first visit after that takes about a minute.
- **PDF report does not work there yet:** 512 MB is too little for Chromium next to the database, and a PDF
  request restarts the instance (the site is back after ~30 s). Everything else works.
- New image -> new deploy: GitHub calls Render's deploy hook after each build, once the hook is saved as the
  repo secret `RENDER_DEPLOY_HOOK` (Render: omnium -> Settings -> Deploy Hook; GitHub: repo -> Settings ->
  Secrets and variables -> Actions). Until then: Render -> omnium -> Manual Deploy.

## Put it on the internet

Any host that runs a Docker image works. Point it at `ghcr.io/glumbis/geomap:latest`, port `3000`
(the server also reads `PORT` if the host sets one). Health check: `/api/health`.
Needs about **1 GB RAM** (DuckDB + Chromium for the PDF report); 512 MB works if nobody downloads PDFs.

## How it fits together

```
 GitHub push to main
   └─ Actions: docker build
        1. npm ci
        2. npm run ingest   downloads ~750 MB of open data, builds data/geomap.duckdb (~150 MB), deletes the downloads
        3. npm run build    web app -> web/dist
        4. final image: Node 22 + Chromium + app + database
   └─ ghcr.io/glumbis/geomap:latest

 Container
   node api/src/index.ts on :3000
     /api/*      JSON API (DuckDB queries)
     /*          web app from web/dist (unknown paths get index.html, so /a/<id> links work)
```

- The data step is cached: a push that changes only code reuses the database layer and builds in a few minutes.
  A change in `data/scripts/` (or `api/src/db.ts`) rebuilds the database.
- To get fresh data from the sources: Actions -> "Docker image" -> Run workflow -> tick "fresh data".
- Build it yourself instead: `docker build -t geomap .` then `docker run -p 3000:3000 geomap`.

## Data: what and where

| What | Size | Where |
|---|---|---|
| Raw downloads (GeoJSON, zip, GTFS, JSON) | ~730 MB | `data/raw/` locally; thrown away in the image |
| Database, 34 tables, ~250 000 rows | ~150 MB | `data/geomap.duckdb` locally; `/app/data/` in the image |
| Image | ~620 MB download | GitHub Container Registry, public (free for public repos) |
| AI summaries | a few KB | table `summaries` in the database; lost when the container is replaced |

Nothing is stored outside the database file. The browser only gets what is in view or matches a search.
Map tiles come straight from Kartverket; address search from Geonorge.
