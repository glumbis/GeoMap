# Omnium as one container: the API serves the web app and the database on one port.
#   docker run -p 3000:3000 ghcr.io/glumbis/geomap   -> http://localhost:3000
# Building it yourself downloads all open data (~750 MB) and builds data/geomap.duckdb (~150 MB):
#   docker build -t geomap .
# See docs/DEPLOY.md.

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci

# Data first, so code-only changes reuse this (slow) layer from the build cache.
# Ingest scripts only need db.ts from the API. Raw downloads are deleted after; only the database is kept.
COPY api/src/db.ts api/src/
COPY data/scripts data/scripts
RUN INGEST_SKIP=zz_omradescore npm run ingest && rm -rf data/raw

COPY . .
# The 500 m area grid scores every square with the API's own rules (datapoints.ts, profile.ts), so it needs the
# full API code and runs after it is copied in (~2 min). A change to the scoring rules re-scores the grid.
RUN npm run ingest zz_omradescore && rm -rf data/raw
RUN npm run build

FROM node:22-bookworm-slim
# Chromium prints the PDF report (api/src/pdf.ts).
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000 CHROME_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# The DuckDB spatial extension installed during ingest, so the server starts offline.
COPY --from=build --chown=node:node /root/.duckdb /home/node/.duckdb
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--import", "tsx", "api/src/index.ts"]
