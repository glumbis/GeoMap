# Test addresses

Owner: Even. Five real addresses with known data, for testing the address profile, rating, AI summary and the demo (see `PLAN.md`).
Each one was checked on 2026-11-06 directly against the source map services listed below.

## Main five

The id is the address id from `docs/PROFILE.md` (`<kommunenummer>-<adressekode>-<nummer><bokstav>`), looked up in Geonorge `adresser/v1/sok` on 2026-11-07. Open one in the app at `/a/<id>`, or its profile at `/api/address/<id>/profile`.

| # | Case | Address | Id | Kommune (nr) | Gnr/Bnr | lat | lng | Expected result | Checked against |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Quick clay | Arendalsgata 22, 0463 Oslo | `0301-10223-22` | Oslo (0301) | 221/19 | 59.937586 | 10.758173 | Inside quick clay hazard zone "Myraløkka", faregrad **Høy**, risiko 5. Strategic noise map: **65–70 dB** (checked 2026-11-07) | NVE `SkredKvikkleire2` layer 0 (KvikkleireFaregrad) |
| 2 | Flood zone | Nedre Rælingsveg 148, 2005 Rælingen | `3224-8900-148` | Rælingen (3224) | 104/771 | 59.949070 | 11.045545 | Inside **200-year** flood zone (flomsone `fs002_37`), not inside 10-year zone. Also inside a **red** road noise zone (checked 2026-11-07) | NVE `Flomsoner2` layer 17 (Flomsone_200arsflom) |
| 3 | Noisy road | Gamle Drammensvei 207, 1337 Sandvika | `3201-1101-207` | Bærum (3201) | 7/61 | 59.892180 | 10.534069 | **Red** road noise zone (Lden > 65 dB), next to E18. Outside NVE's quick-clay and flood mapping: "Ikke kartlagt her" for both | Statens vegvesen WMS `norstoy_1_0`, layer `Stoyvarselkart` |
| 4 | Quiet suburb | Grevlingåsen 17, 1362 Hosle | `3201-1574-17` | Bærum (3201) | 21/309 | 59.939649 | 10.590461 | **No** quick clay zone, no 200-year flood zone, no road noise zone. Outside NVE's quick-clay and flood mapping, so the app shows "Ikke kartlagt her" for both (since 2026-11-07) | All three services above |
| 5 | Ski area | Holmenkollveien 196, 0791 Oslo | `0301-13070-196` | Oslo (0301) | 34/16 | 59.977219 | 10.676161 | Next to Frognerseteren / Nordmarka ski tracks. **No** quick clay, flood or road noise zone. Strategic noise map: 50–55 dB, below the yellow level (checked 2026-11-07). Outside NVE's quick-clay and flood mapping: "Ikke kartlagt her" for both | All three services above |

## Backups

| Case | Address | Id | Kommune (nr) | lat | lng | Expected result |
|---|---|---|---|---|---|---|
| Quick clay | Kjelsåsveien 162, 0491 Oslo | `0301-13747-162` | Oslo (0301) | 59.965764 | 10.776008 | Quick clay zone "Kjelsås", faregrad Middels. App on 2026-11-07 afternoon: overall 47, warnings quick clay (middels), høy radon, strategic noise 55–60 dB, plus low warnings for marine clay, quick-clay and flood awareness areas and polluted ground. Since radon and awareness areas became checks (2026-11-07 evening): overall 43, warning quick clay (middels) plus low ones; checks høy radon, quick-clay and flood awareness areas |
| Flood zone | Strandvegen 81, 2005 Rælingen | `3224-11700-81` | Rælingen (3224) | 59.947770 | 11.047739 | Inside 200-year flood zone `fs002_37`, and also inside the **20-year** flood zone (NVE `Flomsoner2` layer 14, checked 2026-11-07). The app shows only "I 20-årsflomsone": the most frequent zone wins. Overall 32 on 2026-11-07 afternoon, 29 since checks got point penalties (evening) (a 20-year flood zone is a high warning since 2026-11-07, TEK17 §7-2). Also inside a yellow road noise zone (checked 2026-11-07) |

## Source endpoints used

- NVE quick clay: `https://kart.nve.no/enterprise/rest/services/SkredKvikkleire2/MapServer/0/query`
- NVE flood zones: `https://kart.nve.no/enterprise/rest/services/Flomsoner2/MapServer/17/query`
- Road noise: `https://www.vegvesen.no/kart/ogc/norstoy_1_0/ows` (WMS GetFeatureInfo)
- Address lookup: `https://ws.geonorge.no/adresser/v1/sok`

## Radon and soil checked against NGU

Checked 2026-11-07 at each address point, compared with what the app shows.

| # | Address | NGU radon | NGU soil type | Matches the app |
|---|---|---|---|---|
| 1 | Arendalsgata 22 | Meget høy | Hav- og fjordavsetning, sammenhengende dekke, stedvis med stor mektighet | Yes, both |
| 2 | Nedre Rælingsveg 148 | Middels | Elve- og bekkeavsetning (fluvial avsetning) | Yes, both |
| 3 | Gamle Drammensvei 207 | Meget høy | Forvitringsmateriale, ikke inndelt etter mektighet | Yes, both |
| 4 | Grevlingåsen 17 | Høy | Fyllmasse (antropogent materiale) | Yes, both |
| 5 | Holmenkollveien 196 | Høy | Bart fjell | Yes, both |

- Soil: NGU WMS `https://geo.ngu.no/mapserver/LosmasserWMS2`, layer `Losmasse_flate` (GetFeatureInfo, scale 1:50 000). Independent of the file we ingest (`LosmasseLokalt.gpkg`).
- Radon: NGU API `https://geo.ngu.no/api/features/radonaktsomhet/collections/radonaktsomhet/items` ("Radon aktsomhet versjon 2", September 2026). This is the same service `radon.ts` ingests, so it confirms the ingest, not the data. NGU's older radon WMS (`RadonWMS2`, layer `Radon_aktsomhet`) still shows the old classes ("Moderat til lav", "Usikker") and does not match version 2: don't use it to check.

### Independent check of radon and bedrock, and distance to the nearest edge (Sverre, 2026-11-07)

Radon checked against NGU's map service **`RadonUranAktsomhetWMS`**, layer `Radon_aktsomhet` (GetFeatureInfo). It serves version 2 (`versjonId 2`) from a different server than the API we ingest, so this checks the data, not just the ingest. Bedrock (Sverre's `berggrunn`) checked against **`BerggrunnWMS3`**, layer `Berggrunn_lokal_hovedbergarter_fullzoom` (1:50 000). "Edge" is the distance from the address point to the boundary of the polygon it lies in, in our tables.

| # | NGU radon (WMS, v2) | NGU bedrock (WMS) | Matches the app | Edge: radon / soil / bedrock |
|---|---|---|---|---|
| 1 | Meget høy | Kalkstein (321) | Yes, both | 2328 m / 59 m / **7 m** |
| 2 | Middels | Glimmergneis (426) | Yes, both | 4624 m / 32 m / 1104 m |
| 3 | Meget høy | Leirskifer (401) | Yes, both | 81 m / 34 m / 101 m |
| 4 | Høy | Leirskifer (401) | Yes, both | 156 m / 182 m / 69 m |
| 5 | Høy | Syenitt (107) | Yes, both | 116 m / 335 m / 142 m |

- A 1:50 000 map line is only accurate to roughly ±25 m. **#1's bedrock (Kalkstein) is 7 m from a boundary, so treat it as uncertain** and don't make it a point in the demo. Every other value is at least 30 m inside its polygon, radon at least 80 m.
- Alum shale example: Edelvoldveien 16, Asker (`3203-1386-16`). The app shows "Grafittskifer, med alunskifer". NGU's WMS gives Grafittskifer with the legend "Skifer, karbonholdig, med konkresjoner av stinkkalk (et. 1b - 3aß)". Those are the alum shale beds, which is what `alumShale` matches on.
- Found while checking: NGU's style file spells rock 426 "Glimmersgneis", while their map service says "Glimmergneis". `berggrunn.ts` now uses the map service's spelling.

## Not checked yet

- Ski tracks at #5: Turrutebasen (`turruter`) has a trail 45 m away but the nearest ski track 1.2 km away (TRY-løypa). Turrutebasen lacks most Nordmarka ski tracks, so this does not show the ski area well.
- Polluted ground (`grunnforurensning`) on 2026-11-07: #1 has a registered site 17 m away ("Arendalsgata 3-22", påvirkningsgrad 2: acceptable with today's use). The others have none within 100 m.
- Radon and soil type (from Sverre's `radon` and `losmasser`) on 2026-11-07: #1 meget høy radon, marine clay (hav- og fjordavsetning). #2 middels radon, fluvial deposit. #3 meget høy radon. #4 høy radon, fill (fyllmasse). #5 høy radon, bare rock. **Checked against NGU on 2026-11-07: all 5 match** for both radon and soil type (see "Radon and soil checked against NGU" below).
- Overall rating on 2026-11-07 afternoon (soft caps, plus Sverre's new datasets and Lukas's perspective weights): #1 14, #2 51, #3 52, #4 60, #5 61. Backups: Kjelsåsveien 162 47, Strandvegen 81 32. #4 fell from 67 because it lies in NVE's quick-clay awareness area (low warning); #5 is now slightly above #4 because #4 has that extra warning.
- Overall rating on 2026-11-07 evening (radon and awareness areas are checks now): #1 17, #2 49, #3 51, #4 70, #5 74. Perspectives (Bo her / Bygge her / Familie / Pendler): #1 19/16/20/100, #2 48/54/52/89, #4 74/70/80/91.
- Overall rating on 2026-11-07 night (Lukas: Even's new data points are scored, nature uses land cover, 9 perspectives): #1 17, #2 47, #3 52, #4 72, #5 76. Perspectives (Bo her / Bygge her / Familie / Pendler / Stille og rolig / Natur og friluft / Hverdagstilbud / Trygghet / Bokostnader): #1 19/17/18/100/53/85/100/48/56, #2 47/54/50/89/39/83/95/54/83, #3 47/81/44/100/38/85/96/39/74, #4 74/71/82/91/93/75/95/94/74, #5 70/86/67/70/92/100/44/83/56. Nature within 500 m (`greenArea`): #1 31 %, #2 56 %, #3 33 %, #4 20 %, #5 98 %.
- Even's info-only data points on 2026-11-07 evening (scored since 2026-11-07 night): traffic volume within 100 m #1 6 000, #2 37 000, #3 79 800, #4 1 050, #5 2 000 vehicles a day; injury accidents within 200 m since 2016 #1 8, #2 5, #3 6, #4 0, #5 2; city bike only in Oslo (#1 141 m, #5 none within 1 km); property tax on homes in Oslo only (of the test kommuner).
- Perspective scores on 2026-11-07 afternoon (Bo her / Bygge her / Familie / Pendler): #1 15/15/16/100, #2 50/56/52/89, #3 49/67/47/100, #4 64/59/66/91, #5 56/68/52/80. Backups: Kjelsåsveien 162 52/35/54/100, Strandvegen 81 32/29/34/81.
- New low warnings on 2026-11-07 afternoon: quick-clay awareness area for #1, #2, #4 and both backups; flood awareness area for #2 and both backups.
- NVE mapping coverage (`nve_kartlagt`) on 2026-11-07: #3, #4 and #5 are outside both NVE's quick-clay and flood mapping ("Ikke kartlagt her"). #1 is inside the quick-clay mapping but outside the flood mapping. #2 and Strandvegen 81 are inside both.
- Storm surge (Sverre's `stormflo`) on 2026-11-07: none of the 5 addresses or the backups is in a storm-surge zone.
- Busiest stop within 500 m (`transitDepartures`): #1 Sagene 1154, #2 Lillestrøm stasjon 363, #3 Sandvika stasjon 444, #4 Jegeråsen 161 (212 m), #5 Frognerseteren 76.
- Rockfall, debris slide and avalanche (Sverre's `steinsprang`, `jordflomskred`, `snoskred`): none of the 5 addresses is in an area.
- Departures at the nearest stop (Tue 2026-11-10, `stops.departures`): #1 Arendalsgata 929 (3 lines), #2 Dammensvika 152, #3 Lakseberget 230, #4 Grevlingbakken **5** (1 line), #5 Frognerseteren 76 (metro + bus).
- Strategic noise map (`stoy_strategisk`, 2021) on 2026-11-07: #2 65–70 dB, #3 70–75 dB, #4 no zone (unknown), backup Kjelsåsveien 162 55–60 dB.
- The road noise map (`Stoyvarselkart`) only covers national and county roads and has no data inside central Oslo. That is why the noisy-road case is in Bærum.

## How to use

- **Profile / rating:** each address should show the expected result above. #4 and #5 should score best on hazards (#5 Naturfare 100; #4 92 since 2026-11-07 afternoon because of its quick-clay awareness area) and #4 on noise (Miljø 100).
- **AI summary:** read the summary for each address. It must mention the hazard for #1–#3 and must **not** invent hazards for #4 and #5.
- **Demo:** #1 against #4 makes a clear contrast.

## Scores after radon became a check (2026-11-07 evening)

Radon and the quick-clay/flood awareness areas no longer cap; they are "checks" with a fixed point penalty (`docs/PROFILE.md` -> "Penalties").
Overall (before -> after): #1 14 -> 17, #2 50 -> 48, #3 52 -> 51, #4 61 -> 70, #5 61 -> 74. The spread stays wide; addresses with only a radon finding no longer sit at the old medium cap.

