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
  - Not loaded yet: `Strategiskstoykart_lden` (also on this WFS). It covers Oslo incl. municipal roads, but is a 2021 situation in 5 dB bands (`STØYINTERVALL` 55, 60, 65, ...) and uses old municipality numbers (`KOMM` "301"). Different method from T-1442, so keep it as its own table, not mixed into `veistoy`.

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
  - Not loaded yet: departures per stop. The Ruter GTFS zip is 50 MB (Ruter only, no Vy trains); the national one is 546 MB.

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
  - Not loaded yet: crime (anmeldte lovbrudd) and anything per grunnkrets.

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

### Checked, not usable now
- **Reguleringsplaner** (zoning plans, DiBK): Norge digitalt-lisens, not open data. WMS picture only, cannot be stored or scored. https://kartkatalog.geonorge.no/metadata/reguleringsplaner/dac27348-5c2e-4a6a-9497-c4c792108cae
- **Bredbåndsdekning** (Nkom): no open download found (Geonorge only has Agder).
- **Energimerking** (Enova): no open download found.
