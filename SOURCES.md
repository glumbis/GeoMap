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
