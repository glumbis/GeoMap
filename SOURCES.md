# Sources (temporary)

Dump every dataset or API you find here. Rough notes are fine; an agent will clean this up later.
Write under **your own heading only**. This avoids merge conflicts.

Copy this template per source:

```
- **Name:** 
  - Owner: (NGU, NVE, Kartverket, ...)
  - URL: (download page or API docs)
  - What: (one line)
  - Format/access: (API, WMS, WFS, GeoJSON, GeoPackage, CSV, ...)
  - Coverage: (Norway, Oslo, Akershus, ...)
  - Licence/cost: (NLOD, CC BY, free, paid, ...)
  - CRS: (EPSG:25833, 4326, ...)
  - Category: (ground, hazard, environment, location, nature, area)
  - Priority: (high, medium, low)
  - Notes:
```

## Lukas
owner: geonorge but maybe different for specific sets? (probably not)
https://kartkatalog.geonorge.no/?view=grid
Lots of different datasets all in one place
covers all of norway

https://www.ngu.no/geologiske-kart/datasett
Info on all soil and ground. In different datasets easy to install, incorporate all of them, in rating make radon, uran and things like kvikkleire and bad soil important for the rating and flag and warn against possible high values or bad soil.

https://kartkatalog.nve.no/#metadata
Good data on slides, avalanches, and more. These should be important but probably dont impact most places. 

**NVE mapped areas (coverage)**, in use: `data/scripts/nve_kartlagt.ts` -> tables `kvikkleire_kartlagt`, `flom_kartlagt`.
`https://kart.nve.no/enterprise/rest/services/SkredKvikkleire2/MapServer/2` (KvikkleireKartlagtOmrade) and
`https://kart.nve.no/enterprise/rest/services/Flomsoner2/MapServer/0` (FlomsoneAnalyseomraade). NLOD 2.0, credit "NVE", no key.
Where NVE has looked for quick clay and computed flood zones. Outside these areas "no zone" means "not mapped", not "safe".

https://www.kulturminnesok.no/ 
Cultural heritage and monument. Couldnt find an easy download site or database, but take a look and see if its possible. This is only one service as the other cultural history and herritage info was only available to employees of the government. 
## Sverre
Terms for all Kartverket free data: CC BY 4.0, credit "© Kartverket". Details in `SOURCES_SUMMARY.md`.

**Loaded:**
- **NVE Kvikkleire faresoner** (see Even's entry below for the source) → table `nve_kvikkleire`, script `data/scripts/nve_kvikkleire.ts`, API `/api/nve_kvikkleire` (2026-11-07).
  - 628 current zones in Oslo + Akershus, one row per zone (NVE's split parts are merged).
  - Columns: `id` (NVE skredomrid), `name`, `faregrad` (Lav/Middels/Høy/Ingen), `konsekvens`, `risikoklasse` (0–5), `kommune`, `reportUrl`, `source`, `geom`.
  - Checked: test address #1 is in "Myraløkka" (Høy, risikoklasse 5), backup Kjelsåsveien 162 is in "Kjelsås" (Middels), and #2–#5 are in no zone.
  - Licence NLOD, credit "NVE". Only mapped zones: outside a zone can mean "not mapped".
- **NVE Flomsoner** (see Even's entry below for the source) → table `flomsoner`, script `data/scripts/flomsoner.ts`, API `/api/flomsoner` (2026-11-07).
  - 10, 20, 50, 100 and 200-year zones (layers 13–17 of `Flomsoner2`), flooded land only (no river/lake polygons). Left out: 500/1000-year and climate-adjusted zones.
  - 2427 rows, one per NVE part (not merged: merged zones were up to 374k vertices). Outlines simplified to ~1 m.
  - Columns: `id`, `name`, `flomsoneId`, `gjentaksintervall` (years), `lowPoint` (lavpunkt: below flood level, not directly connected to the river), `statusDate`, `source`, `geom`.
  - Checked: test address #2 is in the 200-year zone `fs002_37` and not in the 10-year zone. Backup Strandvegen 81 is in both the 20- and 200-year zone (confirmed against NVE). #1, #3, #4 and #5 are in no zone.
  - Licence NLOD, credit "NVE". Only mapped rivers: outside a zone can mean "not mapped".
- **NGU Radon aktsomhet, version 2 (Sept 2026)** → table `radon`, script `data/scripts/radon.ts`, API `/api/radon` (2026-11-07).
  - Source: NGU OGC API Features `https://geo.ngu.no/api/features/radonaktsomhet` (GeoJSON, no key). Version 2 replaced the 2014 map and uses new classes: `lav`, `middels`, `høy`, `megetHøy`, `usikker`.
  - 681 areas in Oslo + Akershus (204 meget høy, 195 høy, 147 lav, 135 middels). Outlines simplified to ~5 m.
  - Columns: `id`, `name` (Lav/Middels/Høy/Meget høy/Usikker), `aktsomhet` (NGU code), `method`, `updated`, `source`, `geom`.
  - Checked: #1 and #3 meget høy, #4 and #5 høy, #2 middels.
  - Licence NLOD, credit "NGU / DSA". Susceptibility, not a measurement.
- **NGU Løsmasser lokalt** → table `losmasser`, script `data/scripts/losmasser.ts`, API `/api/losmasser` (2026-11-07).
  - Use **lokalt**, not detaljert or regionalt: NGU's coverage layer says neither of those has data for Oslo + Akershus (checked against the OGC API). Metadata: https://kartkatalog.geonorge.no/metadata/4d50a95c-e220-44c5-8bed-393c38fff6d4
  - Source: NGU county downloads (Atom feed), Oslo + Akershus GeoPackage zips in EUREF89 lng/lat, read straight from the zip. Mostly 1:50 000.
  - 30 589 polygons, de-duplicated across the county border. Outlines simplified to ~1 m.
  - Columns: `id` (NGU lokalId), `name` (soil type), `losmassetype` (NGU code), `marineClay` (type 41: thick marine clay, where quick clay can occur), `scale`, `source`, `geom`.
  - Checked: #1 thick marine clay (fits its quick clay zone), #2 river deposits, #3 weathered material, #4 fill, #5 bare rock.
  - Licence NLOD, credit "NGU".
- **NVE Steinsprang aktsomhetsområder** (see Even's entry below for the source) → table `steinsprang`, script `data/scripts/steinsprang.ts`, API `/api/steinsprang` (2026-11-07).
  - Source: NVE ArcGIS REST `SkredSteinAktR`, layer 1 (utløsningsområde = release) and layer 2 (utløpsområde = runout). Layer 0 is a raster and is skipped.
  - 2836 areas (1505 release, 1331 runout), quality "Nokså god" (overview map from a terrain model). Outlines simplified to ~2 m.
  - Columns: `id`, `name`, `zone` ('utløsning' | 'utløp'), `quality`, `source`, `geom`.
  - Checked: none of the 5 test addresses is in an area (nearest: #3, ~500 m). 6 random sample points all match NVE. A real hit: Ringeriksveien 284, Bærum (`3201-1002-284`) is in a runout area, confirmed against NVE.
  - Licence NLOD, credit "NVE".
- **NVE Jord- og flomskred aktsomhetsområder** → table `jordflomskred`, script `data/scripts/jordflomskred.ts`, API `/api/jordflomskred` (2026-11-07).
  - Source: NVE ArcGIS REST `JordFlomskredAktsomhet` layer 1 (runout areas). 6470 areas. Outlines simplified to ~2 m.
  - Columns: `id`, `name`, `source`, `geom`. About 2% of public transport stops lie inside one.
  - Checked: no test address is in an area; 4 random sample points match NVE. A real hit: Bekkelagsterrassen 29A, Oslo (`0301-10444-29A`), confirmed against NVE.
- **NVE Aktsomhetskart snøskred (NAKSIN 2023, S2)** → table `snoskred`, script `data/scripts/snoskred.ts`, API `/api/snoskred` (2026-11-07).
  - Source: NVE ArcGIS REST `SnoskredAktsomhet`, layer 3 (with forest effect, 1175 areas) and layer 2 (without forest effect, 6764 areas). S2 is the safety class for homes. Outlines simplified to ~2 m.
  - Columns: `id`, `name`, `forestEffect` (true = zone with today's forest, false = zone if the forest is gone), `source`, `geom`.
  - Data point: inside a with-forest zone = medium warning; only inside the without-forest zone = low warning ("only if the forest is cut").
  - Checked: no test address is in a zone; 4 random sample points match NVE. Real hits: General Ruges vei 150, Oslo (`0301-12212-150`, both zones) and Sætre terrasse 34, Asker (`3203-1434-34`, without-forest only), confirmed against NVE.
  - Licence NLOD, credit "NVE".
- **NGU Berggrunn N50 + N250** → table `berggrunn`, script `data/scripts/berggrunn.ts`, API `/api/berggrunn` (2026-11-07).
  - Source: NGU county downloads (Atom feeds), file geodatabases in zips, EUREF89 lng/lat, read straight from the zip. N50: https://kartkatalog.geonorge.no/metadata/a5c76d05-33bd-4a1d-b28b-81575092e468, N250: https://kartkatalog.geonorge.no/metadata/7c39be66-77b6-4b74-b58d-53b6bee90067
  - N50 (1:50 000) covers only ~60% of Oslo + Akershus (gaps in Ullensaker, Nes, Lillestrøm, Aurskog-Høland, Ås, Enebakk, Nordre Follo, Vestby). N250 (1:250 000) fills exactly those gaps, cut so the two never overlap. 3466 polygons, 100% of the area.
  - Rock names for N50 come from NGU's style file in the zip (122 codes); N250 has them in `hovedbergart_navn`.
  - Columns: `id`, `name` (rock type), `rockCode`, `legend` (NGU's full description), `alumShale`, `color` (NGU map colour), `scale` (50000 | 250000), `source`, `geom`.
  - `alumShale` (96 polygons): NGU's legend says "alunskifer", or carbon-rich shale with stinkkalk (the classic alum shale beds). About 1.4% of transit stops lie on it.
  - Checked: #1 Kalkstein, #2 Glimmersgneis, #3 and #4 Leirskifer, #5 Syenitt (Grefsensyenitt). Real alum shale hit: Edelvoldveien 16, Asker (`3203-1386-16`). Real N250 hit: Storgata 18, Jessheim (`3209-12100-18`).
  - Licence NLOD, credit "NGU".
- **Kartverket Stormflo og havnivå** (entry below) → table `stormflo`, script `data/scripts/stormflo.ts`, API `/api/stormflo` (2026-11-07).
  - Source: Geonorge county downloads (FGDB in a zip, EPSG:25833), Oslo + Akershus. https://kartkatalog.geonorge.no/metadata/fbb95c67-623f-430a-9fa5-9cfcea8366b3
  - Three scenarios from DSB's guidance (2024): 20-year storm surge today, 200-year today (homes = safety class F2), 200-year in 2100 with sea level rise. Left out: 1000-year, 2150 and "øvre estimat".
  - Kartverket's polygons include the sea itself. Today's sea (mean high water) is cut away, so each row is only the land that floods. Outlines simplified to 1 m before the cut (ingest ~40 s).
  - Columns: `id`, `name`, `years` (20 | 200), `climate` ('nå' | '2100'), `waterLevelCm` (above NN2000: 140–160 cm for 20-year, 160–190 for 200-year today, 220–240 in 2100), `source`, `geom`.
  - Checked: no test address is in a zone. Real hits match Kartverket's ground height (hoydedata API): Drammensveien 281, Oslo (`0301-11290-281`, 20-year today, ground 1.51 m vs water 1.6 m); Frognerstranda 6 (`0301-12047-6`, 2100); Scheens vei 1, Bærum; Nessetveien 55, Nesodden.
  - Licence CC BY 4.0, credit "© Kartverket".
- **Avinor Støysoner Avinors lufthavner** (entry below) → table `flystoy`, script `data/scripts/flystoy.ts`, API `/api/flystoy`, data point `aircraftNoise` (2026-11-07).
  - Source: Geonorge county download for Akershus (GeoPackage in a zip, EPSG:25833, layer `Støy`). Oslo has no Avinor airport, so only Gardermoen (ENGM) is in the study area. Avinor's calculation year 2022, file updated 2026-10-12.
  - T-1442 airport zones: red = Lden 62 dB or more, yellow = 52–62 dB. 1 red and 2 yellow (multi)polygons, simplified to 1 m.
  - Columns: `id`, `name`, `stoysone` ('rød' | 'gul'), `airportCode`, `airport`, `year`, `source`, `geom`.
  - Avinor maps every airport it runs, so no zone = "Ikke i flystøysone" (not "unknown").
  - Street addresses inside (Kartverket address file, 2026-11-07): 357 red, 1,637 yellow, in Ullensaker, Nannestad, Gjerdrum and Eidsvoll. Checked: Brigadevegen 35, Ullensaker (`3209-2340-35`) red; Korsmogutua 7, Gjerdrum (`3230-1104-7`) yellow; no test address is in a zone.
  - Licence: open data, no conditions.
- **NVE Flom aktsomhetsområder** (entry below) → table `flomaktsomhet`, script `data/scripts/flomaktsomhet.ts`, API `/api/flomaktsomhet`, data point `floodAwareness` (2026-11-07).
  - Source: NVE ArcGIS REST `FlomAktsomhet`, layer 1 `Flom_aktsomhetsomrade`, GeoJSON in EPSG:4326. 25,986 polygons in Oslo + Akershus, simplified to ~1 m.
  - National coverage along all rivers, so it answers where `flomsoner` is "Ikke kartlagt her". Low warning ("check before building"), score 50.
  - Checked: #2 Rælingen is inside (matches its 200-year flood zone); #1, #3, #4, #5 are not.
- **NGU Mulighet for marin leire** (entry below) → table `marin_leire`, script `data/scripts/marin_leire.ts`, API `/api/marin_leire`, data point `marineClay` (2026-11-07).
  - Source: NGU county downloads for Oslo and Akershus (FGDB in a zip, EPSG:25833, layer `MuligMarinLeireFlate`), via `nedlasting.ngu.no/api/fileproxy/...` (Atom feed of dataset 641a81c2). NGU's OGC API ignores `bbox`, so the download is used. Data from 2024-06, file 2026-10-26.
  - Classes and `level`: sværtStor 5, sværtStorMenUsammenhengendeEllerTynt 4, stor 3, middels 2, liten 1, stortSettFraværende 0 (`ikkeAngitt` dropped). Scored, no warning (quickClay warns). No polygon = above the marine limit or not classified: neutral.
  - Checked: #1 Arendalsgata "svært ofte" (inside the quick-clay zone), #2 and #4 "ofte", #3 and #5 "stort sett aldri".
- **Bane NOR Støysoner for jernbanenett** (entry below) → table `banestoy`, script `data/scripts/banestoy.ts`, API `/api/banestoy`, data point `railNoise` (2026-11-07).
  - Source: Geonorge county downloads for Oslo and Akershus (FGDB in a zip, EPSG:25833, layer `stoysonerjernbanenett_stoy`). Bane NOR's calculation year 2016, file updated 2025-03-12.
  - T-1442 railway zones: red = Lden 68 dB or more (medium warning), yellow = 58–68 dB (low warning). 156 red and 1,122 yellow polygons on 8 lines (Hoved- og Gardermobanen, Østfoldbanen, Dovrebanen, Gjøvikbanen, ...), simplified to 1 m. No metro or tram (Sporveien).
  - Columns: `id`, `name`, `stoysone` ('rød' | 'gul'), `line`, `year`, `source`, `geom`.
  - Street addresses inside (Kartverket address file): 370 red, 4,346 yellow; most in Oslo, Lillestrøm and Nordre Follo. Checked: Arups gate 10A, Oslo (`0301-10261-10A`) red, Linjeveien 32, Oslo (`0301-14353-32`) yellow; no test address is in a zone.
- **OpenStreetMap: grocery stores, pharmacies, doctors** (entry below) → table `tjenester`, script `data/scripts/tjenester.ts`, API `/api/tjenester`, data points `groceryStore`, `pharmacy`, `doctor` (2026-11-07).
  - Source: Overpass API (keyless; falls back to overpass.kumi.systems), points and building centres in the study bbox, clipped to Oslo + Akershus.
  - `kind`: 'dagligvare' (shop=supermarket, plus shop=convenience except kiosk/fuel chains such as 7-Eleven, Narvesen, Mix) = 836; 'apotek' (amenity=pharmacy) = 261; 'lege' (amenity=doctors or healthcare=doctor, general practice or no speciality) = 355. Specialist-only practices and clinics are left out.
  - Scored by straight-line distance like schools and kindergartens: grocery 400/800/1500/3000 m, pharmacy and doctor 800/1500/3000/5000 m.
  - Checked: #1 Extra Bjølsen 92 m, Apotek 1 Sagene 167 m; #4 Kiwi Hosle 519 m, Apotek 1 Hosle 494 m; #5 Holmenkollveien is the far one (grocery 2.2 km, pharmacy 3.1 km). OSM is volunteer data, thinnest for doctors.
  - Licence ODbL 1.0, credit "© OpenStreetMap contributors".
- **NVE Aktsomhetskart for kvikkleireskred** (entry below) → tables `kvikkleire_aktsomhet` + `kvikkleire_aktsomhet_dekning`, script `data/scripts/kvikkleire_aktsomhet.ts`, API `/api/kvikkleire_aktsomhet`, data point `quickClayAwareness` (2026-11-07).
  - Source: NVE ArcGIS REST `KvikkleireskredAktsomhet`, layer 0 (areas, 6,443 in Oslo + Akershus, simplified to ~2 m) and layer 1 (assessed map sheets: all 27 in the area are `grundigKartlagtMedFunn`), GeoJSON in EPSG:4326.
  - Coarse areas where a quick-clay slide is possible. Low warning ("check the ground before building"), score 50. Outside the assessed sheets: "Ikke kartlagt her".
  - Checked: #1 Arendalsgata, #2 Rælingen and #4 Grevlingåsen are inside (matches NVE's own map service); #3 and #5 are not.
- **Kartverket/SSB Befolkning på grunnkretsnivå** (entry below) → table `grunnkretser`, script `data/scripts/grunnkretser.ts`, API `/api/grunnkretser`, data points `neighbourhood` and `neighbourhoodAge` (2026-11-07).
  - Source: Geonorge county downloads for Oslo and Akershus (FGDB in a zip, EPSG:25833, layer `befolkningpagrunnkrets`), numbers from 1 January 2025. 2,119 grunnkretser, 1,461,820 people.
  - Columns: `id` (grunnkretsnummer), `name`, `kommunenummer`, `year`, `population`, `under20`, `over70`, `areaKm2`, `perKm2`, `pctUnder20`, `pctOver70`, `source`, `geom`. SSB hides age groups of 1–2 people, so age sums can be slightly low.
  - Info only (never scored). The age share is left out under 20 inhabitants. These are also the grunnkrets polygons Even's grunnkrets stats can join to (`id` = grunnkretsnummer).
  - Checked: #1 Sagene rode 6 (851 people, 15,569 per km²), #4 Hosle nord 06 (220), #5 Tryvann (29).
- Shared helpers in `data/scripts/lib.ts`: `studyBbox()`, `arcgisFeatures()` (pages any ArcGIS REST layer, e.g. NVE, as GeoJSON) and `readZipEntry()` (reads one file out of a downloaded zip).

- **Name:** Eiendom REST-API (property lookup)
  - Owner: Kartverket
  - URL: https://api.kartverket.no/eiendom/v1/ (docs: https://ws.geonorge.no/eiendom/v1/)
  - What: properties at a point (`/punkt`), parcel polygons as GeoJSON (`/punkt/omrader`), position of a matrikkelnummer (`/geokoding`)
  - Format/access: REST/JSON, GeoJSON, no key
  - Coverage: Norway
  - Licence/cost: CC BY 4.0, free
  - CRS: choose with `koordsys` / `utkoordsys` (4258, 25833, ...)
  - Category: location (property base)
  - Priority: high
  - Notes: tested, works. Includes parcel accuracy class; the property map can be inaccurate.

- **Name:** Matrikkelen bulk datasets (Eiendomskart Teig, Adresse, Bygningspunkt)
  - Owner: Kartverket
  - URL: https://kartkatalog.geonorge.no/?theme=Eiendom&organizations=Kartverket
  - What: parcel polygons, all official addresses, building points (type, number, status)
  - Format/access: download GML/SOSI (choose area + projection), some WMS/WFS/Atom
  - Coverage: Norway (order Oslo + Akershus)
  - Licence/cost: CC BY 4.0, free
  - CRS: chosen at order time, pick EPSG:25833 or 4258
  - Category: location (property base)
  - Priority: high
  - Notes: no owners, prices or mortgages (grunnbok is not open).

- **Name:** Administrative enheter (kommuner, fylker) + Statistiske enheter grunnkretser
  - Owner: Kartverket
  - URL: https://kartkatalog.geonorge.no/metadata/administrative-enheter-kommuner/041f1e6e-bdbc-4091-b48f-8a5990f3cc5b , https://kartkatalog.geonorge.no/metadata/statistiske-enheter-grunnkretser/51d279f8-e2be-4f5e-9f72-1a53f7535ec1
  - What: municipal/county boundaries; grunnkrets areas for SSB stats
  - Format/access: download
  - Coverage: Norway
  - Licence/cost: CC BY 4.0, free
  - CRS: chosen at order time
  - Category: area
  - Priority: high
  - Notes: use for clipping to Oslo + Akershus (current 2024 boundaries) and joining SSB stats.

- **Name:** Stormflo og havnivå
  - Owner: Kartverket
  - URL: https://kartkatalog.geonorge.no/?text=stormflo
  - What: areas at risk of storm surge and sea level rise
  - Format/access: download, WFS, WMS, REST API
  - Coverage: Norwegian coast
  - Licence/cost: CC BY 4.0 (check dataset page)
  - CRS: check on download
  - Category: hazard
  - Priority: high
  - Notes: relevant for Oslofjord addresses.

- **Name:** ClimateCharts.net
  - Owner: TU Dresden (data: CRU TS v4.07, NOAA GHCN-Monthly)
  - URL: https://climatecharts.net/
  - What: climate chart (monthly temperature + precipitation) for any point
  - Format/access: web app only, no API or download; charts as PNG/SVG
  - Coverage: world, 0.5° grid (~a dozen cells over Oslo + Akershus)
  - Licence/cost: charts CC BY 4.0, cite Zepner et al. (2020)
  - CRS: lat/lon grid
  - Category: nature
  - Priority: low (too coarse; use as design model for our climate chart)
  - Notes: use seNorge_2018 (MET Norway, 1 km, CC BY 4.0, thredds.met.no) for the data instead. See `SOURCES_SUMMARY.md` section 5.

## Erik

## Even
Checked on 2026-11-06. Grunnkretser, addresses, buildings and stormflo are under Sverre, so they are not repeated here.
**Watch out (all SSB/municipal stats):** Akershus was split from Viken in 2024 and municipality numbers changed (e.g. Bærum 3024 -> 3201, Rælingen 3027 -> 3224). Stats from before 2024 may use the old numbers and will not join to the current boundaries.

### Natural hazards (NVE)
NVE data can be queried as real data (not only WMS pictures) through ArcGIS REST: `https://kart.nve.no/enterprise/rest/services/<service>/MapServer/<layer>/query` with a point geometry and `inSR=4326`. Tested on 2026-11-06 for the test addresses (`docs/TEST_ADDRESSES.md`). Bulk download: https://nedlasting.nve.no/gis/

- **Name:** Kvikkleire (faresoner)
  - Owner: NVE
  - URL: https://kartkatalog.geonorge.no/metadata/kvikkleire/a29b905c-6aaa-4283-ae2c-d167624c08a8
  - What: mapped quick clay hazard zones with faregrad (Lav/Middels/Høy), konsekvens and risiko class (1–5)
  - Format/access: ArcGIS REST `SkredKvikkleire2` layer 0 (tested), WMS, download via nedlasting.nve.no
  - Coverage: Norway, only where NVE has mapped. Many zones in Oslo, Lillestrøm, Bærum
  - Licence/cost: NLOD, free
  - CRS: REST accepts/returns any (use `inSR=4326`, `outSR=4326`)
  - Category: hazard
  - Priority: high
  - Notes: fields `skredomrnavn`, `faregrad`, `risiko`, `kommnr`. "Not in a zone" can mean "not mapped": combine with the aktsomhet map below.

- **Name:** Aktsomhetskart for kvikkleireskred
  - Owner: NVE
  - URL: https://kartkatalog.geonorge.no/metadata/aktsomhetskart-for-kvikkleireskred/dabd2a2c-36d5-4ed7-a4c9-d49808a2b848
  - What: susceptibility areas where quick clay slides are possible (wider, less detailed than faresoner)
  - Format/access: ArcGIS REST `KvikkleireskredAktsomhet`, WMS, download
  - Coverage: Norway (below marine limit)
  - Licence/cost: NLOD, free
  - CRS: any via REST
  - Category: hazard
  - Priority: high
  - Notes: use as fallback where faresoner are not mapped.

- **Name:** Flomsoner
  - Owner: NVE
  - URL: https://kartkatalog.geonorge.no/metadata/flomsoner/e95008fc-0945-4d66-8bc9-e50ab3f50401
  - What: mapped flood zones for 10, 20, 50, 100, 200, 500, 1000-year floods (+ climate-adjusted 200-year)
  - Format/access: ArcGIS REST `Flomsoner2` (layer 13 = 10-year ... layer 17 = 200-year, 21 = 200-year climate; tested), WMS, download
  - Coverage: Norway, only mapped rivers (e.g. Nitelva/Leira/Glomma around Lillestrøm, Rælingen)
  - Licence/cost: NLOD, free
  - CRS: any via REST
  - Category: hazard
  - Priority: high
  - Notes: show the lowest return period that hits (10-year is worse than 200-year).

- **Name:** Flom aktsomhetsområder
  - Owner: NVE
  - URL: https://kartkatalog.geonorge.no/metadata/flom-aktsomhetsomraader/60c5024f-bf93-4d7a-888a-5fe001427195
  - What: areas that may be flood-exposed, for all rivers (coarser than flomsoner)
  - Format/access: ArcGIS REST `Flomaktsomhet`, WMS, download
  - Coverage: Norway
  - Licence/cost: NLOD, free
  - CRS: any via REST
  - Category: hazard
  - Priority: medium
  - Notes: fallback where flomsoner are not mapped.

- **Name:** Aktsomhetskart for snøskred
  - Owner: NVE
  - URL: https://kartkatalog.geonorge.no/metadata/aktsomhetskart-for-snoeskred/54ada9d8-e6fc-48d6-82b0-5477166a4aaa
  - What: areas where snow avalanches may start or reach
  - Format/access: ArcGIS REST `SnoskredAktsomhet`, WMS, download
  - Coverage: Norway
  - Licence/cost: NLOD, free
  - CRS: any via REST
  - Category: hazard
  - Priority: low (few hits in Oslo + Akershus)
  - Notes:

- **Name:** Steinsprang - aktsomhetsområder
  - Owner: NVE
  - URL: https://kartkatalog.geonorge.no/metadata/steinsprang-aktsomhetsomraader/02c6d51c-4e8c-4948-a620-dc046c8cb747
  - What: areas where rockfall may start or reach
  - Format/access: ArcGIS REST `SkredSteinAktR`, WMS, download
  - Coverage: Norway
  - Licence/cost: NLOD, free
  - CRS: any via REST
  - Category: hazard
  - Priority: medium
  - Notes:

- **Name:** Aktsomhetskart for jord- og flomskred
  - Owner: NVE
  - URL: https://kartkatalog.geonorge.no/metadata/aktsomhetskart-for-jord-og-flomskred/30e1883e-70e9-4510-9e97-00edbdcddc02
  - What: areas where debris slides and debris flows may happen
  - Format/access: ArcGIS REST `JordFlomskredAktsomhet`, WMS, download
  - Coverage: Norway
  - Licence/cost: NLOD, free
  - CRS: any via REST
  - Category: hazard
  - Priority: medium
  - Notes:

### Ground & geology (NGU)
NGU datasets: https://www.ngu.no/geologiske-kart/datasett (download per county, several formats). Check format and CRS on download.

- **Name:** Løsmasser (regionalt / detaljert)
  - Owner: NGU
  - URL: https://kartkatalog.geonorge.no/metadata/loesmasser-regionalt/e5847c27-0c30-44b6-9198-a797c177fa20 (detailed: https://kartkatalog.geonorge.no/metadata/loesmasser-detaljert/b8cf02c7-b01b-498f-8e90-1fc9bc46056b)
  - What: soil type at the surface (clay, sand, moraine, bare rock, fill...)
  - Format/access: download from NGU, WMS
  - Coverage: Norway (detailed only in some areas)
  - Licence/cost: NLOD, free
  - CRS: check on download (likely EPSG:25833)
  - Category: ground
  - Priority: high
  - Notes: use detailed where it exists, regional elsewhere.

- **Name:** Radon aktsomhet
  - Owner: NGU (with DSA)
  - URL: https://kartkatalog.geonorge.no/metadata/radon-aktsomhet/dc0605f3-2301-4abe-a91f-6da42464c281
  - What: radon susceptibility classes (low / moderate / high / very high)
  - Format/access: download from NGU, WMS, OGC API Features
  - Coverage: Norway
  - Licence/cost: NLOD, free
  - CRS: check on download
  - Category: ground
  - Priority: high
  - Notes: large parts of Oslo have high radon susceptibility, so this matters for many addresses. Also "Uran aktsomhet" exists (66f7f33e-d5ba-4a22-83e6-cb5385ec284a).

- **Name:** Mulighet for marin leire
  - Owner: NGU
  - URL: https://kartkatalog.geonorge.no/metadata/mulighet-for-marin-leire/641a81c2-9354-473b-b8f0-2b1e2ab3930a
  - What: where marine clay (which can be quick clay) may be present
  - Format/access: download from NGU, WMS
  - Coverage: Norway (below marine limit)
  - Licence/cost: NLOD, free
  - CRS: check on download
  - Category: ground
  - Priority: medium
  - Notes: supports the quick clay warning; also "Marin grense" (cf8ccec7-9505-4d84-94a9-eac9c69971d3).

- **Name:** Grunnvannsborehull (GRANADA)
  - Owner: NGU
  - URL: https://kartkatalog.geonorge.no/metadata/grunnvannsborehull/82cd33ef-52dd-4c83-b2d6-e55a0941b33b
  - What: groundwater wells and energy wells, often with depth to bedrock
  - Format/access: download from NGU, WMS
  - Coverage: Norway
  - Licence/cost: NLOD, free
  - CRS: check on download
  - Category: ground
  - Priority: low
  - Notes: nearest well gives a rough bedrock depth.
  - **Loaded** (2026-11-07) as table `energibronner` by `data/scripts/energibronner.ts`, API `/api/energibronner`: 22 866 energy wells (22 105 with depth to bedrock) from NGU's OGC API Features (`https://geo.ngu.no/api/features/grunnvannborehull/collections/energibronn/items`, GeoJSON, EPSG:4326, keyless, paged 10 000 at a time). Data point `energyWell` (nearest within 500 m, info only, not scored).
  - Watch out: depth to bedrock is what the driller wrote down, for one well. It can change a lot over short distances.

- **Name:** NADAG (Nasjonal database for grunnundersøkelser)
  - Owner: NGU
  - URL: https://kartkatalog.geonorge.no/metadata/nasjonal-database-for-grunnundersoekelser-nadag/bf45a463-434d-4b4d-84dc-9325780ab5fb
  - What: points where ground surveys (drilling, soundings) have been done, with reports
  - Format/access: download from NGU, WMS
  - Coverage: Norway (dense in Oslo)
  - Licence/cost: NLOD, free
  - CRS: check on download
  - Category: ground
  - Priority: low
  - Notes: good for the geologist users: "surveys near this address" with links.

### Environment
- **Name:** Støykartlegging veg etter T-1442
  - Owner: Statens vegvesen
  - URL: https://kartkatalog.geonorge.no/metadata/stoeykartlegging-veg-etter-t-1442/d6db9f39-9725-4630-909e-5e62f09a0766
  - What: red (Lden > 65 dB) and yellow (Lden > 55 dB) road noise zones along national and county roads
  - Format/access: FGDB, GML, PostGIS, SOSI, WFS, WMS (`https://www.vegvesen.no/kart/ogc/norstoy_1_0/ows`, layer `Stoyvarselkart`, GetFeatureInfo tested)
  - Coverage: Norway mainland
  - Licence/cost: NLOD, free
  - CRS: chosen at download
  - Category: environment
  - Priority: high
  - Notes: only riks- and fylkesveg, NOT municipal roads, and no data inside central Oslo (tested). Forecast 15–20 years ahead, at 4 m height. Not for detailed assessment of single homes: show as an indication. Same WMS also has `Strategiskstoykart_lden` which does cover Oslo.
  - **Loaded** (2026-11-07) as table `veistoy` by `data/scripts/veistoy.ts`, API `/api/veistoy`: 3268 zones (1467 red, 1801 yellow) from the WFS on the same URL (`typeNames=norstoy_1_0:Stoyvarselkart`, GeoJSON, EPSG:4326). Columns: stoysone ('rød' | 'gul'), forecastYear (2040), calculated.
  - **Also loaded** (2026-11-07) as table `stoy_strategisk` by `data/scripts/stoy_strategisk.ts`, API `/api/stoy_strategisk`: 11689 zones from `Strategiskstoykart_lden` on the same WFS. Columns: lden (lower bound of a 5 dB band: 50, 55, ..., 75 = 75+), year (2021), kommunenummer (set by location, the source uses old numbers like "301"). Covers all of Oslo incl. municipal roads; in Akershus only near big roads. No coverage outline, so "no zone" means unknown. Used by data point `roadNoiseStrategic`.

- **Name:** Støysoner for Bane NORs jernbanenett
  - Owner: Bane NOR SF
  - URL: https://kartkatalog.geonorge.no/metadata/stoeysoner-for-bane-nors-jernbanenett/47234f63-a9d1-43c7-b91c-db90c92d5008
  - What: red (Lden > 68 dB) and yellow (Lden > 58 dB) railway noise zones
  - Format/access: FGDB, GML, PostGIS, SOSI, WFS, WMS
  - Coverage: Norway mainland
  - Licence/cost: open data, no conditions
  - CRS: chosen at download
  - Category: environment
  - Priority: medium
  - Notes: Bane NOR network only. T-bane/trikk probably not included.

- **Name:** Støysoner Avinors lufthavner
  - Owner: Avinor
  - URL: https://kartkatalog.geonorge.no/metadata/stoeysoner-avinors-lufthavner/1489f7f8-40c8-4dc4-83b6-bcf277b56506
  - What: red and yellow aircraft noise zones around airports
  - Format/access: FGDB, GML, GPKG, SOSI, WFS, WMS
  - Coverage: Norway
  - Licence/cost: open data, no conditions
  - CRS: chosen at download
  - Category: environment
  - Priority: medium
  - Notes: important around Gardermoen (Ullensaker, Nannestad, Eidsvoll). Updated every 6 months.

- **Name:** Støykart - strategisk støykartlegging (Støydirektivet)
  - Owner: Miljødirektoratet
  - URL: https://kartkatalog.geonorge.no/metadata/stoeykart-strategisk-stykartlegging-stydirektivet/93a154a7-47d5-47b8-bdda-f156d92386cc
  - What: EU noise maps for big roads, railways, airports and big cities (incl. Oslo, Asker, Bærum, Lillestrøm, Lørenskog, Nordre Follo, Rælingen)
  - Format/access: FGDB (own download page)
  - Coverage: selected areas, includes Oslo region
  - Licence/cost: NLOD, free
  - CRS: probably EPSG:25833 (check)
  - Category: environment
  - Priority: medium
  - Notes: unlike the vegvesen T-1442 map, it includes Oslo's own city noise data. Remade every 5 years: check the data year.

- **Name:** Forurenset grunn
  - Owner: Miljødirektoratet
  - URL: https://kartkatalog.geonorge.no/metadata/forurenset-grunn/e48e71ac-16fc-4e47-9e7f-c0a4a4bbfad0
  - What: properties with (suspected) polluted ground: old landfills, war remains, shipyards, shooting ranges
  - Format/access: GeoJSON, JSON, FGDB, GML, REST API, WMS
  - Coverage: Norway
  - Licence/cost: NLOD 2.0 (credit Miljødirektoratet)
  - CRS: chosen at download
  - Category: environment
  - Priority: high
  - Notes: continuously updated. Has GeoJSON + REST API, easy ingest. Source db: grunn.miljodirektoratet.no
  - **Loaded** (2026-11-07) as table `grunnforurensning` by `data/scripts/grunnforurensning.ts`, API `/api/grunnforurensning`: 4023 sites (areas) from the ArcGIS service `https://kart.miljodirektoratet.no/arcgis/rest/services/grunnforurensning2/MapServer/1` (GeoJSON, max 15000 per request). Columns: name, siteType, status, impact (påvirkningsgrad: '1' little or none, '2' acceptable with today's use, '3' action needed, 'X' suspected), impactText, healthClass, factSheet (link), kommunenummer.
  - Watch out: 739 sites have impact '1' (little or no pollution). A warning for those would overstate the risk.

- **Name:** NILU Luftkvalitet API
  - Owner: NILU / Miljødirektoratet
  - URL: https://api.nilu.no/
  - What: measured air quality (NO2, PM10, PM2.5 etc.) from measuring stations
  - Format/access: REST API (JSON). Query by lat/lon + radius (max 20 km), latest or historical (max 1 year per call)
  - Coverage: Norway, only where stations exist (several in Oslo, few in Akershus)
  - Licence/cost: free, credit api.nilu.no
  - CRS: EPSG:4326
  - Category: environment
  - Priority: medium
  - Notes: point measurements, not a full map. Use nearest station + distance.

- **Name:** PVGIS (sun / solar radiation)
  - Owner: EU Joint Research Centre
  - URL: https://re.jrc.ec.europa.eu/pvg_tools/en/
  - What: solar radiation and sun hours for any point, incl. terrain horizon
  - Format/access: REST API (JSON), no key
  - Coverage: Europe
  - Licence/cost: free
  - CRS: EPSG:4326
  - Category: environment
  - Priority: low
  - Notes: call per address on demand rather than bulk.

### Location
- **Name:** Grunnskoler
  - Owner: Utdanningsdirektoratet
  - URL: https://kartkatalog.geonorge.no/metadata/grunnskoler/db4b872f-264d-434c-9574-57232f1e90d2
  - What: all public and private primary and lower secondary schools, with position
  - Format/access: FGDB, GML, PostGIS, SOSI, WFS
  - Coverage: Norway
  - Licence/cost: CC BY 4.0
  - CRS: chosen at download
  - Category: location
  - Priority: high
  - Notes: updated yearly. Source: Nasjonalt skoleregister API https://data-nsr.udir.no/swagger/index.html. "Videregående skoler" also exists. No school catchment zones (skolekrets).
  - **Loaded** (2026-11-07) as table `schools` by `data/scripts/schools.ts`, API `/api/schools`: 516 active schools (425 grunnskole, 106 videregående) from the NSR API (`/v3/enheter/fylke/{03,32}` + `/v3/enhet/{orgnr}` for coordinates). Columns: name, address, isPrimary, isUpperSecondary, isPrivate, pupils, gradeFrom/gradeTo, kommunenummer.
  - Watch out: the nearest school is not the assigned school (could be private or special). 32 active schools have no position and are left out. `pupils` is missing for 105 (mostly videregående).

- **Name:** Barnehager
  - Owner: Utdanningsdirektoratet
  - URL: https://kartkatalog.geonorge.no/metadata/barnehager/e229a364-0caa-4a24-8dbe-225b3d83e075
  - What: all kindergartens with position
  - Format/access: FGDB, GML, SOSI, WFS
  - Coverage: Norway
  - Licence/cost: NLOD
  - CRS: chosen at download
  - Category: location
  - Priority: high
  - Notes: updated monthly, from barnehagefakta.no. Some positions only by postcode (approximate).
  - **Loaded** (2026-11-07) as table `kindergartens` by `data/scripts/kindergartens.ts`, API `/api/kindergartens`: 1215 active kindergartens from the Nasjonalt barnehageregister API (`https://data-nbr.udir.no/v3`, same shape as NSR). Columns: name, address, isPrivate, children, ageFrom/ageTo, categories, kommunenummer. 90 active ones have no position and are left out.

- **Name:** Entur stops and timetables
  - Owner: Entur
  - URL: https://developer.entur.org/stops-and-timetable-data
  - What: all public transport stops and timetables (bus, metro, tram, train, ferry)
  - Format/access: GTFS (zip of CSV) or NeTEx dumps, daily. Also APIs (geocoder, journey planner)
  - Coverage: Norway, per region ("Ruter" = Oslo + Akershus; trains from Vy/Bane NOR, or use the national dataset)
  - Licence/cost: NLOD, free
  - CRS: EPSG:4326 in GTFS
  - Category: location
  - Priority: high
  - Notes: GTFS `stops.txt` has name + lat/lon. Count departures per stop for a "transit quality" score.
  - **Loaded** (2026-11-07) as table `stops` by `data/scripts/stops.ts`, API `/api/stops`: 3975 stop places from the Journey Planner API (`https://api.entur.io/journey-planner/v3/graphql`, `stopPlacesByBbox`, needs only an `ET-Client-Name` header). All operators incl. Vy trains. Columns: name, modes, hasBus/hasTram/hasMetro/hasRail/hasWater, number of quays, kommunenummer.
  - **Departures loaded** (2026-11-07) into the same `stops` table: columns `departures` (trips that let people board, on one weekday), `lines` (distinct routes) and `departuresDate` (the next Tuesday after the ingest). From the GTFS zips of Ruter (`rb_rut`, 50 MB), Vy (`rb_vyg`, 66 MB) and Flytoget (`rb_flt`) at `https://storage.googleapis.com/marduk-production/outbound/gtfs/`, unzipped by the script itself. GTFS splits some stops by mode, so children are mapped to Entur's combined parent stop. 3504 of 3975 stops have departures; the rest are NULL (e.g. other operators, school-only stops).
  - Examples (Tue 2026-11-10): Jernbanetorget 4467, Nationaltheatret 3888, Oslo S 807, Arendalsgata 929, Grevlingbakken 5.

- **Name:** OpenStreetMap (shops, doctors, pharmacies, etc.)
  - Owner: OpenStreetMap contributors
  - URL: https://download.geofabrik.de/europe/norway.html
  - What: points of interest: grocery shops, pharmacies, doctors, dentists, gyms, parks
  - Format/access: .osm.pbf / shapefile download, or Overpass API
  - Coverage: Norway
  - Licence/cost: ODbL, free (credit "© OpenStreetMap contributors")
  - CRS: EPSG:4326
  - Category: location
  - Priority: medium
  - Notes: only open source we have for shops and health services. Quality is good in Oslo.

### Nature & leisure
- **Name:** Turrutebasen
  - Owner: Kartverket
  - URL: https://kartkatalog.geonorge.no/metadata/turrutebasen/d1422d17-6d95-4ef1-96ab-8af31744dd63
  - What: hiking trails, ski tracks, bike routes and other outdoor routes
  - Format/access: FGDB, GML, GPX, PostGIS, SOSI, WFS, WMS
  - Coverage: Norway
  - Licence/cost: CC BY 4.0
  - CRS: chosen at download
  - Category: nature
  - Priority: medium
  - Notes: updated weekly. Includes ski tracks, so maybe no separate ski source needed. Quality varies.
  - **Loaded** (2026-11-07) as table `turruter` by `data/scripts/turruter.ts`, API `/api/turruter`: 20332 route lines (17817 fotrute, 1401 skiløype, 706 sykkelrute, 408 annen rute) from the county FGDB zips on nedlasting.geonorge.no (read from the zip with `/vsizip/`, EPSG:25833 → 4326). Columns: routeType, name (route names, or Tursti/Skiløype/... when unnamed), lit, kommunenummer.
  - Watch out: few ski tracks in Oslo (Skiforeningen's Nordmarka tracks are mostly missing). Nearest ski track from Holmenkollveien 196 is 1.2 km. Skiforeningen's own track data would be better for skiing.

- **Name:** Friluftslivsområder - kartlagte og verdsatte
  - Owner: Miljødirektoratet
  - URL: https://kartkatalog.geonorge.no/metadata/friluftslivsomraader-kartlagte-og-verdsatte/91e31bb7-356f-4478-bcba-d5c2de6e91bc
  - What: outdoor recreation areas mapped and rated by importance
  - Format/access: FGDB, GeoJSON, GML, JSON, WMS
  - Coverage: Norway (where municipalities have mapped)
  - Licence/cost: NLOD 2.0 (credit Miljødirektoratet)
  - CRS: chosen at download
  - Category: nature
  - Priority: medium
  - Notes: good for "green areas nearby". Dataset changes from 1.1.2027.

- **Name:** Naturvernområder (Naturbase)
  - Owner: Miljødirektoratet
  - URL: https://kartkatalog.geonorge.no/metadata/naturvernomraader/5857ec0a-8d2c-4cd8-baa2-0dc54ae213b4
  - What: protected nature: national parks, nature reserves, landscape protection areas
  - Format/access: download (Miljødirektoratet kartkatalog), WMS
  - Coverage: Norway
  - Licence/cost: NLOD 2.0 (credit Miljødirektoratet)
  - CRS: chosen at download
  - Category: nature
  - Priority: medium
  - Notes: nice "near protected nature" info; also limits building.
  - **Loaded** (2026-11-07) as table `verneomrader` by `data/scripts/verneomrader.ts`, API `/api/verneomrader`: 326 areas (223 naturreservat, 54 naturminne, 12 landskapsvernområde, 1 nasjonalpark, ...) from the ArcGIS service `https://kart.miljodirektoratet.no/arcgis/rest/services/vern/MapServer/0` (keyless). Data point `protectedNature` (nearest within 3 km, info only, not scored).

- **Name:** Statlig sikra friluftslivsområder
  - Owner: Miljødirektoratet
  - URL: https://kart.miljodirektoratet.no/arcgis/rest/services/friluftsliv_statlig_sikra/MapServer/0
  - What: outdoor areas the state has bought or secured so everyone can use them: beaches, swimming spots, islands, parks, forest
  - Format/access: ArcGIS REST (GeoJSON), WMS
  - Coverage: Norway
  - Licence/cost: NLOD 2.0 (credit Miljødirektoratet)
  - CRS: any (asked for EPSG:4326)
  - Category: nature
  - Priority: medium
  - **Loaded** (2026-11-07) as table `friluftsomrader` by `data/scripts/friluftsomrader.ts`, API `/api/friluftsomrader`: 182 named areas. Data point `recreationArea` (nearest within 3 km, info only, not scored).
  - Watch out: only state-secured areas. Most parks and forests that are open to everyone are not in it.

### Area (stats, heritage, plans)
- **Name:** Befolkning på grunnkretsnivå
  - Owner: Kartverket / SSB
  - URL: https://kartkatalog.geonorge.no/metadata/befolkning-paa-grunnkretsniv/7eb907de-fdaa-4442-a8eb-e4bd06da9ca8
  - What: population, men/women, 5-year age groups and 5-year change per grunnkrets
  - Format/access: FGDB, GML, PostGIS, SOSI, WFS
  - Coverage: Norway
  - Licence/cost: open data, no conditions
  - CRS: chosen at download
  - Category: area
  - Priority: high
  - Notes: stats from 01.01.2024, yearly. Groups of 1–2 people hidden, so sums differ slightly. Joins to Sverre's grunnkrets polygons.

- **Name:** Oslo kommune Statistikkbanken
  - Owner: Oslo kommune
  - URL: https://statistikkbanken.oslo.kommune.no/
  - What: Oslo stats per bydel, delbydel and grunnkrets: population, income, housing, crime, schools, environment
  - Format/access: PxWeb tables + API (same system as SSB), CSV/Excel export
  - Coverage: Oslo only
  - Licence/cost: free (check licence per table)
  - CRS: none (tables, join on bydel/grunnkrets ID)
  - Category: area
  - Priority: high
  - Notes: much finer than SSB for Oslo. Check whether crime exists per grunnkrets or only per bydel. Contact: oslostatistikken@byr.oslo.kommune.no

- **Name:** SSB Statistikkbanken
  - Owner: SSB
  - URL: https://www.ssb.no/statbank (API: https://data.ssb.no/api/)
  - What: national stats: income, population, housing, crime (anmeldte lovbrudd)
  - Format/access: PxWeb tables + JSON-stat API, CSV export
  - Coverage: Norway. Mostly per kommune, some per grunnkrets
  - Licence/cost: CC BY 4.0, free
  - CRS: none (tables, join on kommune/grunnkrets number)
  - Category: area
  - Priority: high
  - Notes: income and crime are mostly per kommune only, which is fine for Akershus.
  - **Loaded** (2026-11-07) as table `ssb_kommuner` by `data/scripts/ssb.ts`, API `/api/ssb`. Latest year of each table, all on the 2024 municipality numbers:
    - 11342 Areal og befolkning: population, land area, people per km² (2026)
    - 07459 Befolkning: share aged 0–17, 18–66, 67+ (2026)
    - 06944 Inntekt for husholdninger: median income after tax, all households (2024)
    - 06265 Boliger: dwellings and share detached, semi-detached, terraced, apartment (2026)
    - 09429 Utdanningsnivå: share of people 16+ with a university or college degree (2025)
  - Not loaded yet: anything per grunnkrets.
  - **Crime loaded** (2026-11-07) as table `krim_omrader` by `data/scripts/ssb_krim.ts`, API `/api/krim_omrader`, one row per area (`level` 'kommune' | 'bydel'):
    - every municipality: SSB table 08487 (anmeldte lovbrudd etter gjerningssted), per 1000 residents, yearly average over the latest two years (2024–2025): all lovbrudd, vold og mishandling, eiendomstyveri, rusmiddellovbrudd, with Norway next to each.
    - Oslo per bydel: Oslo kommune statistikkbank KRI002 (`https://statistikkbanken.oslo.kommune.no/statbank/api/v1/no/db1/Kriminalitet/KRI002.px`, PxWeb, keyless, `json-stat` only; the `år` variable can't be sent in a query, so all years are fetched), counts for the latest year (2024) divided by bydel population from `oslo_bydeler`. Compared with all of Oslo and Norway.
    - Data points `crimeRate` and `violentCrime` use the bydel row when there is one.
  - Watch out: Sentrum bydel has about 1 500 residents, so it gets counts but no per-1000 number. Marka has no crime numbers of its own (falls back to Oslo kommune). Ullensaker includes crime at Gardermoen airport (145,5 vs 59,9 for Norway).

- **Name:** Household income per delområde / bydel (SSB 06944)
  - Owner: SSB
  - URL: https://www.ssb.no/statbank/table/06944
  - **Loaded** (2026-11-07) as table `inntekt_omrader` by `data/scripts/ssb_inntekt_omrader.ts`, API `/api/inntekt_omrader`: median household income after tax (2024) for 206 delområder (codes like 32010100 = grunnkretser 320101xx, polygons built from `grunnkretser`), 17 Oslo bydeler (codes like 030101a) and 22 kommuner. Data point `areaIncome` (smallest area with a number, info only).
  - Watch out: SSB hides a few small delområder (2 without a number); those fall back to bydel or kommune.

- **Name:** Oslo bydeler (built)
  - Owner: SSB (Klass) + Kartverket/SSB grunnkretser
  - URL: https://data.ssb.no/api/klass/v1/correspondencetables/2467 (Bydelsinndeling 2020 - Grunnkretsinndeling 2025)
  - What: no keyless bydel polygon file exists, so `data/scripts/oslo_bydeler.ts` merges the `grunnkretser` polygons per bydel using SSB's official grunnkrets -> bydel table. Table `oslo_bydeler` (id 030101..030117, name, population). All 591 Oslo grunnkretser get a bydel.

- **Name:** Kulturminner - Lokaliteter, Enkeltminner og Sikringssoner
  - Owner: Riksantikvaren
  - URL: https://kartkatalog.geonorge.no/metadata/kulturminner-lokaliteter-enkeltminner-og-sikringssoner/c72906a0-2bc2-41d7-bea2-c92d368e3c49
  - What: all registered cultural heritage sites (Askeladden), incl. protected buildings and safety zones
  - Format/access: FGDB, GML, PostGIS, SOSI, OGC API Features (GeoJSON), WMS
  - Coverage: Norway mainland + Svalbard
  - Licence/cost: NLOD
  - CRS: chosen at download
  - Category: area
  - Priority: medium
  - Notes: protected buildings/zones limit what you can build. Also "Kulturminner - Freda bygninger" and "SEFRAK-bygninger".
  - **Loaded** (2026-11-07) as table `kulturminner` by `data/scripts/kulturminner.ts`, API `/api/kulturminner`: 17 993 sites (layer `lokalitet`) from the Oslo and Akershus FGDB zips (`https://nedlasting.geonorge.no/geonorge/Kulturminner/Kulturminner/FGDB/Kulturminner_<03_Oslo|32_Akershus>_25833_Kulturminner_FGDB.zip`, read from the zip, EPSG:25833 → 4326). Kept only sites with a protection status today (dropped: removed, protection lifted, no protection). Codes in `statusCode`, bokmål in `status` ([code list](https://register.geonorge.no/sosi-kodelister/kulturminner/vernetype)). Data point `culturalHeritage` (sites within 50 m, info only, not scored).
  - Watch out: in Oslo, "kommunalt listeført" (KOM) is Byantikvaren's gule liste. Buildings in it are worth preserving but not fredet.

### Checked, not usable now
- **Reguleringsplaner** (zoning plans, DiBK): Norge digitalt-lisens, not open data. WMS picture only, cannot be stored or scored. https://kartkatalog.geonorge.no/metadata/reguleringsplaner/dac27348-5c2e-4a6a-9497-c4c792108cae
- **Bredbåndsdekning** (Nkom): no open download found (Geonorge only has Agder).
- **Energimerking** (Enova): no open download found.
