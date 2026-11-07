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

The product is called **Omnium**. Look and page flow: `docs/DESIGN.md`. In short: a calm, almost empty start page with one big address field; picking an address opens the address page (rating, warnings, AI summary, category cards, map).

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

## How we work together

The stack is set up (see `AGENTS.md` → "Run it"). Each person owns some folders. You can read everything, but only change files you own, unless you agree with the owner first.

Your coding agent does the routine work for you: setup, pulling, committing, pushing, checking things. You tell it what to build and check the result. Start each session with: **"I'm <name>. Get me up to date and tell me my next task."**

We build in three phases. Don't polish phase 1 work before phase 1 works end to end.

1. **Skeleton (first hours):** search an address → see the address page with real data from at least one dataset and a (rough) rating. Ugly is fine.
2. **Fill (most of the time):** more datasets, better rating, AI summary, real design.
3. **Demo (last part):** stop adding data. Fix bugs, polish the 5 test addresses, rehearse.

**The contract between people** is the address profile (`docs/PROFILE.md`) and the table rules in `AGENTS.md`. If you need to change one, tell the owner first.

## Roles

Each role lists: what you own, your tasks in order, and when a task is done.

### Lukas — lead, API, rating

**Owns:** `api/src/index.ts`, `api/src/db.ts`, `api/src/geojson.ts`, `api/src/routes/address.ts`, `api/src/rating.ts`, `api/src/summary.ts`, `docs/PROFILE.md`, `PLAN.md`, `AGENTS.md`.

1. ~~Scaffold the stack and push it.~~ Done.
2. **Decide the address id** and write it into `docs/PROFILE.md`. Suggestion: `<kommunenummer>-<adressekode>-<nummer><bokstav>` from the Geonorge address search (unique, readable, and you can look it up again with `adresser/v1/sok?kommunenummer=..&adressekode=..&nummer=..&bokstav=..`). Tell Erik.
   *Done when:* Erik knows what to put in the URL.
3. **Profile endpoint, first version:** `GET /api/address/:id/profile` in `api/src/routes/address.ts`. Look up the address point, then for every loaded table ask "what is at or near this point?". Return the shape from `docs/PROFILE.md`, even if only the municipality is filled in. Everything not loaded yet goes in "missing" with reason "not loaded".
   *Done when:* the 5 test addresses in `docs/TEST_ADDRESSES.md` return valid profiles, and Erik can build against it.
4. **Make adding data points easy for Sverre and Even:** one small list (in `address.ts` or its own file) where each data point is one entry: id, label, category, table, how to query it, critical or normal. Adding a dataset to the profile should mean adding one entry.
5. **Rating model** in `api/src/rating.ts`: category scores, overall score, severity caps and "worst category first" (see `suggestions.md`), "insufficient data" rules from `docs/PROFILE.md`.
   *Done when:* test address #1 (quick clay) scores clearly worse than #4 (quiet suburb), and every score explains why.
6. **AI summary:** `GET /api/address/:id/summary` (see "AI summary" above). Use Even's fact-sentence rules. Cache in table `summaries`.
   *Done when:* the summary for all 5 test addresses mentions every real hazard and invents nothing.
7. **All the time:** review what lands on `main`, unblock people, and cut scope when time runs short.

### Sverre — data pipeline

**Owns:** `data/scripts/` (except files Even creates), dataset routes in `api/src/routes/<dataset>.ts`.

1. **Agree the table shape with Lukas** (first hour): every table has `geom` (EPSG:4326), `name`, `source`, plus the columns the profile needs (e.g. `faregrad` for hazard zones).
2. **NVE hazard zones first** (quick clay, flood, landslide/rockfall/avalanche). These make the demo. Test addresses #1 and #2 must fall inside the right zones.
3. **NGU ground data:** soil type (løsmasser), radon risk, bedrock.
4. **Addresses and buildings** (Kartverket), if the profile needs them beyond the Geonorge address API.
5. For each dataset: one ingest script (copy `data/scripts/kommuner.ts`), one route (copy `api/src/routes/kommuner.ts`), one entry in Lukas' data-point list, and a line in `SOURCES.md`.
   *Done when (per dataset):* `npm run ingest <name>` works from a clean clone, the layer shows on the map at `/api/<name>`, and the profile of a test address shows the data point.
6. Large layers: if a layer is too big to send as GeoJSON, simplify geometry on ingest (`ST_SimplifyPreserveTopology`) or aggregate at low zoom.

### Erik — frontend and design

**Owns:** everything in `web/`, and `docs/DESIGN.md`.

1. **Read `docs/DESIGN.md`** and adjust it if you disagree. It is yours. The brand colours are already in `web/src/style.css`.
2. **Start page:** blank paper page, logo, one big address search field with autocomplete (Geonorge `adresser/v1/sok`). Picking an address goes to `/a/<id>`.
   *Done when:* you can find each of the 5 test addresses by typing part of it, with mouse or keyboard, on desktop and on a phone-sized screen.
3. **Address page skeleton:** fetch `/api/address/<id>/profile` and show the summary block and category cards. Render whatever categories the profile contains; never hard-code the list.
4. **Map:** make the Kartverket basemap match the logo (see "The map" in `docs/DESIGN.md`), the orange pin, layer toggles grouped by category. Restyle the controls.
5. **Details:** expandable data points with explanation and source, "Ikke tilgjengelig" for missing data, "AI-generert" label on the summary, loading and error states.
6. **Polish for the demo:** the 5 test addresses look great on a laptop and a phone.

### Even — sources, municipal stats, texts, demo

**Owns:** `SOURCES.md` (your section), `docs/TEST_ADDRESSES.md`, `docs/TEXTS.md` (create it), `docs/FACTS.md` (create it), `docs/DEMO.md` (create it), and the ingest scripts you write.

1. **Municipal stats:** ingest SSB numbers per municipality (and grunnkrets if you can): population, income, age, housing. Copy `data/scripts/kommuner.ts`; join to the `kommuner` table by `kommunenummer`.
2. **Easy datasets:** any CSV/GeoJSON source from `SOURCES.md` that Sverre isn't doing (schools, kindergartens, transport stops, noise). Agree with Sverre who takes what.
3. **Info texts** in `docs/TEXTS.md`: for each data point, 1–2 sentences in plain Norwegian on what it means for someone living there.
4. **Fact-sentence rules** in `docs/FACTS.md`: one template sentence per data point and value, sorted by severity. Example: quick clay zone with faregrad "middels" → "Eiendommen ligger i en faresone for kvikkleireskred (NVE, faregrad middels)." Lukas turns these into code for the AI summary.
5. **Demo** in `docs/DEMO.md`: the story (start with #4 quiet suburb, then #1 quick clay), a 3-minute pitch script, screenshots, and a checklist to run before presenting.
   *Done when:* anyone on the team can give the demo from `docs/DEMO.md`.

## Agreed decisions

- Product name: **Omnium**. UI text in Norwegian (bokmål); code and docs in English.
- Rating: severity caps + always show the weakest category (`suggestions.md`, Lukas to confirm).
- Missing data is never shown as good, and is never faked (`docs/PROFILE.md`).

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
