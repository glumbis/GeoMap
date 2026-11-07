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

## Status (2026-11-07, updated by Lukas)

Phase 1 is done. Phase 2 is well along: 19 datasets loaded, and all 5 test addresses have full hazard data, a real score, an AI summary and info texts.
Scores now: #4 Grevlingåsen 75, #5 Holmenkollveien 75, #2 Rælingen 65, #3 Sandvika 65, #1 Arendalsgata 20. Backup Strandvegen 81: 40 (20-year flood zone is now high, see TEK17 note in `api/src/datapoints.ts`).

**Review 2026-11-07: done by Lukas**
- Scores no longer tie: stacked caps (`docs/PROFILE.md` → "Severity caps"). PROFILE.md now says what the overall number means, and that a capped score must not be labelled "God".
- "Not in a zone" only counts as good where NVE has mapped the area (`nve_kartlagt` ingest, `coverage` on a data point). Elsewhere quick clay and flood show "Ikke kartlagt her", neutral, not scored. #3, #4 and #5 are outside NVE's quick-clay and flood mapping.
- Info texts from `docs/TEXTS.md` are in the profile (`explanation`).
- Tests: `npm test` (rating rules, also in CI on every push) and `npm run test:addresses` (5 test addresses: hazards, scores, caps, summary facts; needs `npm run dev`).

What the demo still needs, most important first:
1. **Erik:** never call a capped score "God". In `web/src/app/address.ts` `scoreWord()`, when `rating.cappedBy` is present, show the cap reason instead of the word (rule in `docs/PROFILE.md` → "What the overall score means").
2. ~~**Erik:** show the AI summary on the address page (`GET /api/address/<id>/summary`, label "AI-generert" only when `aiGenerated` is true).~~ Done (`web/src/app/summary.ts`).
3. **Erik:** ~~quick clay and flood on the map~~ done (`web/src/features/hazards.ts`), plus flood low points, rockfall, debris slides, avalanches, radon, soil and bedrock in the "Kartlag" panel. Still open: road noise `/api/veistoy` and `/api/stoy_strategisk`.
4. **Erik:** search misses addresses. It asks Geonorge for 50 hits nationwide, then keeps Oslo/Akershus, so common street names give "no results". Geonorge filters on only one `kommunenummer` per request. Fix that works today: `treffPerSide=1000` plus `filtrer=adresser.adressetekst,adresser.kommunenummer,adresser.adressekode,adresser.nummer,adresser.bokstav,adresser.postnummer,adresser.poststed,adresser.kommunenavn,adresser.objtype` (about 0.5 s), then filter as now.
5. **Erik:** show "Ikke kartlagt her" (value `ikkeKartlagt`, effect neutral) as neutral grey, never green.
6. ~~**Sverre + Even:** check radon and soil type for the 5 test addresses against NGU's own map (radon: geo.ngu.no aktsomhetskart, soil: løsmassekart) and write the result in `docs/TEST_ADDRESSES.md`. The test notes say this is not checked yet.~~ Done 2026-11-07: all 5 match NGU (`docs/TEST_ADDRESSES.md`). Sverre added an independent radon check (NGU's v2 map service), bedrock, and distance to the nearest polygon edge: #1's bedrock is only 7 m from an edge, so don't use it in the demo.
7. ~~**Even:** update `docs/DEMO.md` and `docs/TEST_ADDRESSES.md`: scores above, Strandvegen 81 now 40, the bus caveat can go (Jegeråsen, 212 m, 161 weekday departures), and #3–#5 show "Ikke kartlagt her" for quick clay and flood. (FACTS.md rules for `ikkeKartlagt` are done, and the code matches them.)~~ Done 2026-11-07.

After these, stop adding data and move to phase 3 (demo).

## Roles

Each role lists: what you own, your tasks in order, and when a task is done.

### Lukas — lead, API, rating

**Owns:** `api/src/index.ts`, `api/src/db.ts`, `api/src/geojson.ts`, `api/src/routes/address.ts`, `api/src/rating.ts`, `api/src/summary.ts`, `docs/PROFILE.md`, `PLAN.md`, `AGENTS.md`.

1. ~~Scaffold the stack and push it.~~ Done.
2. ~~**Decide the address id**~~ Done: `<kommunenummer>-<adressekode>-<nummer><bokstav>`, see "Address id" in `docs/PROFILE.md`. Erik's tasks below say how to build it.
3. ~~**Profile endpoint, first version:** `GET /api/address/:id/profile`~~ Done (`api/src/profile.ts`, `api/src/routes/address.ts`). All 5 test addresses return valid profiles; everything not ingested yet is listed as `notLoaded`.
4. ~~**Data-point list for Sverre and Even**~~ Done: `api/src/datapoints.ts`. One entry per data point: id, label, category, source, critical/normal, table, how to find it (`within`, `nearest`, `around`) and a `read()` that turns rows into a value, score and warning.
5. ~~**Rating model** in `api/src/rating.ts`: category scores, overall score, severity caps and "worst category first" (see `suggestions.md`), "insufficient data" rules from `docs/PROFILE.md`.~~
   *Done when:* test address #1 (quick clay) scores clearly worse than #4 (quiet suburb), and every score explains why.
   Done 2026-11-07 with real data for all 5 test addresses: #4 Grevlingåsen 75, #5 Holmenkollveien 75, #2 Rælingen 65, #3 Sandvika 65, #1 Arendalsgata 20. Overall caps now stack (high 40, medium 75, minus 10 per extra serious warning), because a flat medium cap of 60 made 4 of 5 addresses tie at 60. Every capped score lists its warnings, worst first. Rules: "Severity caps" in `docs/PROFILE.md`.
6. ~~**AI summary:** `GET /api/address/:id/summary` (see "AI summary" above). Use Even's fact-sentence rules. Cache in table `summaries`.~~
   *Done when:* the summary for all 5 test addresses mentions every real hazard and invents nothing.
   Done 2026-11-07: fact sentences follow `docs/FACTS.md` (`RULES` in `api/src/summary.ts`), checked with real Haiku output on all 5 test addresses with every dataset loaded. Every hazard is mentioned, worst first, nothing invented. Cache key includes model and prompt.
7. ~~**Info texts in the profile:**~~ Done 2026-11-07: `explanation` = **Forklaring** + every matching **Når ...** text from `docs/TEXTS.md` (rules in `OUTCOMES`, `api/src/texts.ts`; `npm test` checks the two lists match).
8. ~~**Shorter AI summary:** 4–6 sentences.~~ Done 2026-11-07: the AI gets the facts in groups (warnings, checked and not found, location, missing data) with one sentence per group. The rating is left out because the page shows it. All 5 test addresses: 4–6 sentences, 75–100 words, every warning kept (all 5 for #1), nothing invented. Source names in brackets are stripped in code. Each fact in the response now has a `rank` (1–8, `docs/FACTS.md`).
9. **All the time:** review what lands on `main`, unblock people, and cut scope when time runs short.

### Sverre — data pipeline

**Owns:** `data/scripts/` (except files Even creates), dataset routes in `api/src/routes/<dataset>.ts`.

1. **Agree the table shape with Lukas** (first hour): every table has `geom` (EPSG:4326), `name`, `source`, plus the columns the profile needs (e.g. `faregrad` for hazard zones). Proposed table and column names are already in `api/src/datapoints.ts` (`kvikkleire.faregrad`, `flomsoner.gjentaksintervall`, `steinsprang`, `losmasser.jordart`, `radon.aktsomhet`, `veistoy.stoysone`, ...). Use them, or change the entry to match your table.
2. **NVE hazard zones first** (quick clay, flood, landslide/rockfall/avalanche). These make the demo. Test addresses #1 and #2 must fall inside the right zones.
   ~~Quick clay~~ done (`nve_kvikkleire`, `/api/nve_kvikkleire`, #1 checked). ~~Flood~~ done (`flomsoner`, `/api/flomsoner`, #2 checked). ~~Rockfall~~ done (`steinsprang`). ~~Debris slides~~ done (`jordflomskred`). ~~Avalanche~~ done (`snoskred`). ~~Storm surge~~ done (`stormflo`, Kartverket). Every hazard in the rating list is in.
3. **NGU ground data:** soil type (løsmasser), radon risk, bedrock.
   ~~Radon~~ done (`radon`). ~~Soil type~~ done (`losmasser`, NGU "lokalt"). ~~Bedrock~~ done (`berggrunn`, N50 + N250, flags alum shale).
4. **Addresses and buildings** (Kartverket), if the profile needs them beyond the Geonorge address API.
5. For each dataset: one ingest script (copy `data/scripts/kommuner.ts`), one route (copy `api/src/routes/kommuner.ts`), one entry in Lukas' data-point list, and a line in `SOURCES.md`.
   *Done when (per dataset):* `npm run ingest <name>` works from a clean clone, the layer shows on the map at `/api/<name>`, and the profile of a test address shows the data point.
6. Large layers: if a layer is too big to send as GeoJSON, simplify geometry on ingest (`ST_SimplifyPreserveTopology`) or aggregate at low zoom.

### Erik — frontend and design

**Owns:** everything in `web/`, and `docs/DESIGN.md`.

1. **Read `docs/DESIGN.md`** and adjust it if you disagree. It is yours. The brand colours are already in `web/src/style.css`.
2. **Start page:** blank paper page, logo, one big address search field with autocomplete (Geonorge `adresser/v1/sok`, keep only `objtype` `Vegadresse`). Picking an address goes to `/a/<id>`.
   Build the id from the search hit: `` `${kommunenummer}-${adressekode}-${nummer}${bokstav.toUpperCase()}` ``, e.g. `0301-10223-22` (Arendalsgata 22) or `0301-13729-64A` (Kirkeveien 64A). Details: "Address id" in `docs/PROFILE.md`.
   *Done when:* you can find each of the 5 test addresses by typing part of it, with mouse or keyboard, on a laptop screen.
3. **Address page skeleton:** fetch `/api/address/<id>/profile` and show the summary block and category cards. Render whatever categories the profile contains; never hard-code the list.
   The endpoint works now: try `http://localhost:5173/api/address/0301-10223-22/profile`. Field names and an example: "Field names" in `docs/PROFILE.md`. Until hazard data is ingested, the overall `rating.status` is `insufficientData` with a `reason`: show the reason, never a number. Summary: `GET /api/address/<id>/summary`; label it "AI-generert" only when `aiGenerated` is true.
4. **Map:** make the Kartverket basemap match the logo (see "The map" in `docs/DESIGN.md`), the orange pin, layer toggles grouped by category. Restyle the controls.
5. **Details:** expandable data points with explanation and source, "Ikke tilgjengelig" for missing data, "AI-generert" label on the summary, loading and error states.
6. **Polish for the demo:** the 5 test addresses look great on a laptop (laptop only for the MVP, see `docs/DESIGN.md`).

### Even — sources, municipal stats, texts, demo

**Owns:** `SOURCES.md` (your section), `docs/TEST_ADDRESSES.md`, `docs/TEXTS.md` (create it), `docs/FACTS.md` (create it), `docs/DEMO.md` (create it), and the ingest scripts you write.

1. ~~**Municipal stats:** ingest SSB numbers per municipality (and grunnkrets if you can): population, income, age, housing. Copy `data/scripts/kommuner.ts`; join to the `kommuner` table by `kommunenummer`.~~ Done per municipality (`ssb_kommuner`, `/api/ssb`). Grunnkrets later.
2. ~~**Easy datasets:** any CSV/GeoJSON source from `SOURCES.md` that Sverre isn't doing (schools, kindergartens, transport stops, noise). Agree with Sverre who takes what.~~ Done: `stops`, `schools`, `kindergartens`, `veistoy`.
3. ~~**Info texts** in `docs/TEXTS.md`: for each data point, 1–2 sentences in plain Norwegian on what it means for someone living there.~~ Done for all 14 current data points; add a section when a data point is added.
4. ~~**Fact-sentence rules** in `docs/FACTS.md`: one template sentence per data point and value, sorted by severity. Example: quick clay zone with faregrad "middels" → "Eiendommen ligger i en faresone for kvikkleireskred (NVE, faregrad middels)." Lukas turns these into code for the AI summary.~~ Done for all 14 current data points, checked against the 5 test profiles.
5. **Demo** in `docs/DEMO.md`: the story (start with #4 quiet suburb, then #1 quick clay), a 3-minute pitch script, screenshots, and a checklist to run before presenting.
   *Done when:* anyone on the team can give the demo from `docs/DEMO.md`.

## Agreed decisions

- Product name: **Omnium**. UI text in Norwegian (bokmål); code and docs in English.
- Rating: severity caps + always show the weakest category (`suggestions.md`). Confirmed by Lukas 2026-11-07, with stacked overall caps (see `docs/PROFILE.md`).
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
