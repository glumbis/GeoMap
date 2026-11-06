# Sources summary

A short guide to the data we can use, and the rules that come with it. Raw notes stay in `SOURCES.md`.
Checked against Kartverket's pages on 2026-11-06:
- Terms: https://www.kartverket.no/api-og-data/vilkar-for-bruk
- Open property data: https://www.kartverket.no/api-og-data/eiendomsdata/apent-tilgjengelige-data-og-tjenester

## TL;DR
- Kartverket's free data is **CC BY 4.0**: free to use, also commercially. We must show **"© Kartverket"** (with a link to kartverket.no where possible).
- **Free:** property boundaries (teig), addresses, building points, municipal/county/grunnkrets boundaries, place names, plus REST APIs for address and property lookup. No key, no application.
- **Not free/open:** owners, sales prices, mortgages and easements (all from the *grunnbok*), plus self-reported area/energy data. These need an application with a legal basis, or a paid third-party provider. **Skip for the hackathon.**
- The open property map can be **inaccurate**. Each parcel has an accuracy class; show it, and say so in the UI.
- **Climate:** ClimateCharts.net is too coarse for Norway (0.5° grid, no API). Use MET Norway's 1 km seNorge data, and copy ClimateCharts' chart style.

## 1. Terms of use (what we must do)

| Rule | What it means for GeoMap |
|---|---|
| Free products are CC BY 4.0 | We can download, store, transform and show them. |
| Credit "© Kartverket" wherever data is used | Map attribution + an "About the data" section. Already needed for the basemap tiles. |
| Place names (SSR) are database-protected | If we use many names, credit: *"Alle stadnamn er henta frå SSR ©Kartverket"*. |
| Aerial photos (norgeibilder.no) and the most detailed norgeskart.no maps are **licensed** | Do not use orthophotos as a basemap. Screenshots only, with credit. |
| WMS/cache services at zoom 12–20 contain Geovekst data Kartverket does not fully own | OK to **display** in the map as-is. Do **not** copy/download/store it without permission (post@kartverket.no). |
| Data is delivered "as is", no liability | Add a disclaimer: "Data from public registers, may be incomplete or inaccurate." |
| External sources inside Kartverket APIs keep their own licences | Check the licence of every non-Kartverket dataset (NGU, NVE, Riksantikvaren, SSB...). |
| Historical maps >100 years old are public domain | Not relevant now. |

## 2. Kartverket property data we can use

All are on Geonorge, open, no application. Bulk datasets download as GML or SOSI (choose area + projection when ordering), some also as WMS (image), WFS (raw data) or Atom feed. Matrikkel data is updated daily or as needed, not real time.

### APIs (no key)
| API | What it does | Use in GeoMap | Priority |
|---|---|---|---|
| **Adresse REST-API** `ws.geonorge.no/adresser/v1/` (`sok`, `punktsok`) | Search official addresses; returns point, postcode, municipality and cadastral numbers (gnr/bnr). | Search bar + autocomplete (Erik). Gives the key to link an address to its property. | **High** |
| **Eiendom REST-API** `api.kartverket.no/eiendom/v1/` (old `ws.geonorge.no/eiendom/v1/` still proxies) | `/punkt`: properties at a point. `/punkt/omrader`: parcel polygons as GeoJSON. `/geokoding`: point/area for a matrikkelnummer. Includes parcel accuracy class. Tested, works. | Draw the property boundary on the address page. Find which parcel an address is on. | **High** |
| **Administrative inndelinger** `ws.geonorge.no/kommuneinfo/v1/` | Municipality/county for a point. | Label municipality; pick which municipal stats to show. | Medium |
| **Stedsnavn search** `ws.geonorge.no/stedsnavn/v1/` | Search place names. | Search for places, not only addresses. | Low |

### Bulk datasets (download to DuckDB)
| Dataset | What | Use in GeoMap | Priority |
|---|---|---|---|
| **Matrikkelen Eiendomskart Teig** | Parcel polygons, each tied to a property unit. | Plot area; test if *any part* of the plot touches a hazard zone (better than testing a single point). | **High** |
| **Matrikkelen Adresse** | All official addresses. | Base `addresses` table; test addresses; pre-computing profiles. | **High** |
| **Administrative enheter kommuner / fylker** | Municipal and county boundaries. | Clip every dataset to Oslo + Akershus. Use the **current** version (Akershus was split from Viken in 2024). | **High** |
| **Statistiske enheter grunnkretser** | Small statistical areas, stable since ~1980. | Join SSB neighbourhood stats (income, age, housing) for the "Area" score (Even). | **High** |
| **Matrikkelen Bygningspunkt** | Building point with building number, type and status. | "What is here": detached house, apartment block, etc. Count buildings on the parcel. | Medium |
| **Postnummerområder** | Postcode areas. | Nice to have for grouping. | Low |
| Matrikkelen Adresse leilighetsnivå | One address per apartment (H0102). | Only if we support apartment search. | Low |
| Historical versions, valgdistrikter, stemmekretser, soknegrenser | History and electoral/church boundaries. | Not needed. | Skip |

### Other Kartverket data worth adding
| Dataset | What | Use | Priority |
|---|---|---|---|
| **Stormflo og havnivå** (download, WFS, WMS, REST API) | Areas at risk of storm surge and sea level rise. | "Natural hazards" score for coastal addresses (Oslofjord). | **High** |

## 3. What is not open (skip, but know why)
| Data | Why we can't use it |
|---|---|
| Owners (hjemmelshaver) | Grunnbok data; not shared on Geonorge. Needs an application with a legal basis (utleveringsforskriften). Personal data. |
| Sales prices (tinglyste overdragelser) | Same as above, or via paid providers. |
| Mortgages, easements, pre-emption rights | Same as above. |
| Self-reported data (area, energy, utilities) | API access only by application. |
| Shielded building types | Hidden by law; separate application. |
| Eiendomsregisteret (website) | Login for private persons, not for apps. |

## 4. What is in SOURCES.md so far
Only Lukas has added sources. Sverre, Erik and Even are empty.

| Source | What it is | What we use it for | Datasets to pull (found on Geonorge) |
|---|---|---|---|
| **Geonorge kartkatalog** | The national catalog: a search engine for datasets, not a dataset itself. | Finding everything else. Search API: `kartkatalog.geonorge.no/api/search?text=...` | n/a |
| **NGU** (geological survey) | Soil, bedrock, radon, groundwater, ground surveys. | **Ground & geology** score. Flag radon/uranium and weak soil. | Radon aktsomhet (download + OGC API Features), Løsmasser (soil), Berggrunn (bedrock), NADAG, groundwater wells. *RadonUranAktsomhet is WMS only (picture, not data): check for a downloadable version before scoring on uranium.* |
| **NVE** (water and energy directorate) | Natural hazard zones. | **Natural hazards** score and top warnings. Rare but serious. | Kvikkleire (quick clay hazard zones, download + WFS), Aktsomhetskart for kvikkleireskred, Flomsoner (download + WFS), landslide/rockfall/avalanche zones. |
| **Riksantikvaren / Kulturminnesøk** | Cultural heritage sites and protected buildings. | Info flag: protected building = rules for renovation. | Lukas found no download, but it **is** on Geonorge: *Kulturminner – Lokaliteter, Enkeltminner og Sikringssoner* (download/WFS), *Freda bygninger*, *Kulturmiljøer*, *SEFRAK-bygninger* (pre-1900 buildings), *Brukerminner* (OGC API). Check the licence. |

### Watch out
- **"Not in a zone" does not always mean "safe".** NVE flood zones and detailed quick clay maps only exist where NVE has mapped. Use the *aktsomhet* (susceptibility) maps for full coverage, and say "not mapped" in the UI when relevant.
- **WMS = picture only.** It can be shown as a map layer but not used for scoring. Prefer download, WFS or OGC API Features.
- **Coordinate systems:** most Norwegian data is EPSG:25833 or 4258. Convert to 4326 on ingest (see `AGENTS.md`).

## 5. Climate: ClimateCharts.net vs Norwegian data
**ClimateCharts.net** (TU Dresden) draws a climate chart for any point in the world: monthly temperature and precipitation, a climate class, and a choice of time period (default: last 30 years).

| | ClimateCharts.net |
|---|---|
| Data | CRU TS v4.07 grid (0.5°, about 55 × 28 km in Norway) and NOAA GHCN-Monthly weather stations |
| Access | Web app only. **No API or data download.** Charts can be saved as PNG/SVG. |
| Licence | Charts are CC BY 4.0. Cite Zepner et al. (2020). |
| Fit for GeoMap | **Low as a data source.** Oslo + Akershus is only about a dozen grid cells, so nearly every address gets the same chart. |

Within Oslo + Akershus, climate differs mainly by **elevation** and **distance from the fjord** (city centre vs Nordmarka/Romeriksåsen). We need a fine grid to see that. Use Norwegian data instead, and use ClimateCharts.net as the **design model** for the chart (monthly bars for precipitation, a line for temperature).

| Norwegian alternative | What | Access | Licence | Priority |
|---|---|---|---|---|
| **seNorge_2018** (MET Norway) | Daily temperature and precipitation on a **1 × 1 km** grid for all of Norway, from 1957 | NetCDF on `thredds.met.no/thredds/catalog/senorge/seNorge_2018/` (OPeNDAP lets us cut out just Oslo + Akershus). No key. | CC BY 4.0, credit MET Norway | Medium |
| **Frost API** (MET Norway) | Station observations and climate normals (1991–2020) | REST, `frost.met.no`. Needs a **free client ID** (registration). | CC BY 4.0 | Low |

**How to use it:** pre-compute the 1991–2020 monthly normals once from seNorge for the Oslo + Akershus bbox, and store them in DuckDB as a 1 km point grid. The profile endpoint then picks the nearest cell, and the address page shows a small climate chart. This would mostly go in "Nature & leisure" (for example, colder and snowier on the hills: good for skiing), not in the main rating.

## 6. Gaps (no sources yet)
| Category | Missing | Suggested source | Owner |
|---|---|---|---|
| Environment | Noise, polluted ground, air quality | Miljødirektoratet, NILU | Sverre / Even |
| Location | Public transport, schools, kindergartens | Entur, Udir / Barnehagefakta | Even |
| Area | Income, age, housing per grunnkrets | SSB + Kartverket grunnkretser | Even |
| Nature & leisure | Trails, ski tracks, green areas | Kartverket Turrutebasen, Skiforeningen | Sverre / Even |
| Plans | Zoning plans | Geonorge plan data, municipalities | Unassigned |
