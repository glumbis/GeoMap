# Plan

## Product
Search any address in Oslo and Akershus. See **all** public info about the property on one map and one page:
ground conditions, hazards, environment, plans, buildings, transport, services, municipal stats.
Each address gets an **overall rating** plus category scores. Simple at first glance, deep when you dig.

Users: homebuyers, curious people, geologists, developers, skiers, government. One UI for all:
- **Top:** address, overall rating, 4–6 category scores, 3 key warnings.
- **Below:** expandable sections per category with the raw data and its source.
- **Map:** layer toggles for every dataset.

Scope first: Oslo + Akershus. Clip all data to these two counties on ingest.

## Rating (draft, Lukas owns)
Categories, each 0–100. Overall = weighted average.
- **Ground & geology:** soil type, quick clay, bedrock depth, radon.
- **Natural hazards:** flood, landslide, rockfall, avalanche, storm surge.
- **Environment:** noise, air quality, polluted ground, sun.
- **Location:** public transport, schools, kindergartens, shops, health.
- **Nature & leisure:** green areas, trails, ski tracks, water.
- **Area:** municipal and neighbourhood stats (income, crime, prices).

Every score must show *why*: list the data points behind it.

## AI summary (Lukas owns)
A short plain-language summary on top of each address page, written by Claude Haiku 5.5 (`claude-haiku-5-5`).

How it works:
1. `GET /api/address/:id/summary` loads the address profile (data points, scores, sources).
2. Template step: rules turn each data point into a fact sentence, sorted by severity. Example: quick clay zone → "Eiendommen ligger i en faresone for kvikkleireskred (NVE, faregrad middels)." Even writes these rules.
3. AI step: send the fact sentences + scores to Haiku with `@anthropic-ai/sdk`. Prompt: "Write 4–6 sentences in plain Norwegian. Use only these facts. Most serious risks first. No advice. If data is missing, say so."
4. Cache the result in DuckDB table `summaries` (address id, text, created). Generate once per address.
5. If the API call fails, return the template sentences instead.

Rules:
- Call the AI only from `api/`. Key in `.env` as `ANTHROPIC_API_KEY`. Never send it to the browser or commit it.
- The UI labels the text "AI-generert" and shows the facts and sources below it.
- Test with Even's 5 test addresses. Check the summary invents nothing.
- Cost: about $0.0005 per address. Negligible for the hackathon.

## Roles

### Lukas — lead, API, rating
- Day 1: scaffold `web/` and `api/` from AGENTS.md. Add run commands to AGENTS.md. Push within the first hour, so others can start.
- Build `api/src/db.ts` and the core endpoint `GET /api/address/:id/profile`: one call returns all data at a point, grouped by category.
- Build the rating model in `api/src/rating.ts`.
- Build the AI summary endpoint (see "AI summary" above).
- Review and merge. Unblock others. Decide when scope must shrink.

### Sverre — data pipeline
- Owns `data/scripts/`. One script per dataset: download, clip to Oslo + Akershus, convert to EPSG:4326, load into DuckDB.
- Start with the heavy, high-value sets: addresses/property (Kartverket), NGU ground data, NVE hazard zones.
- Add one `api/src/routes/<dataset>.ts` per dataset you load (bbox + search, GeoJSON out).
- Agree table columns with Lukas early. Every table: `geom`, `name`, `source`.

### Erik — frontend and design
- Owns `web/`. Map, layer toggle panel, address search bar with autocomplete (Geonorge `adresser/v1/sok`).
- Address page/side panel: rating, category cards, expandable details.
- Design is the priority. Clean, few colours, readable on mobile. Sketch it before coding.

### Even — sources, municipal stats, demo
- Before coding: lead the hunt for data, fill `SOURCES.md` most.
- During: easy ingests (CSV/GeoJSON) and SSB/municipal stats per municipality and grunnkrets. Use Sverre's scripts as template.
- Write the info texts: what each data point means, in plain Norwegian.
- Write the summary template rules: one fact sentence per data point (input for the AI summary and its fallback).
- Own the demo: test addresses, pitch script, screenshots.

## Before coding (everyone)
1. Accept the GitHub collaborator invite. Clone the repo.
2. Install Node 22+, Git, your coding agent, and the DuckDB CLI (good for poking at data).
3. Find data. Add every source to `SOURCES.md` under your own heading (avoids merge conflicts). Check format, licence, coverage, and whether it is free.
4. Download a sample of the top sources. Check it opens and its coordinate system.
5. Erik: sketch the address page and map UI (paper or Figma). Share it with the group.
6. Lukas + Sverre: agree on the table schema and the profile endpoint shape.
7. Even: pick 5 test addresses with interesting data (quick clay, flood zone, noisy road, quiet suburb, ski area).
8. Agree on the rating categories and weights.

## Where to look
- **Geonorge** (geonorge.no): the national catalog. Most things below are found here. Search by topic.
- **Kartverket**: addresses, property boundaries (matrikkel), buildings, elevation, place names, trails.
- **NGU**: soil (løsmasser), bedrock, radon risk, groundwater wells, **NADAG** (national ground survey database), quick clay.
- **NVE**: flood zones, landslide/quick clay hazard zones, avalanche and rockfall risk.
- **Miljødirektoratet**: polluted ground (grunnforurensning), noise maps, protected nature (Naturbase).
- **Riksantikvaren**: cultural heritage (Kulturminnesøk).
- **Statens vegvesen (NVDB)**: roads, traffic volume, speed limits.
- **SSB**: statistics per municipality and grunnkrets (population, income, age, housing).
- **Entur**: public transport stops and routes.
- **NILU** (luftkvalitet.info): air quality.
- **Udir / Barnehagefakta**: schools and kindergartens.
- **Kommuneplan / reguleringsplaner**: zoning plans (Oslo kommune, Akershus municipalities, Geonorge plan data).
- **Oslo kommune open data, Akershus fylkeskommune**: local datasets.
- **Energimerking (Enova)**: building energy labels.
- **Nkom**: broadband coverage.
- **Skiforeningen / Turrutebasen**: ski tracks and trails.
- **PVGIS / met.no**: sun and climate.

Not free (note them, skip for now): sales prices per property, grunnbok/heftelser via Ambita.
