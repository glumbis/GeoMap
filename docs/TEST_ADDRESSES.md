# Test addresses

Owner: Even. Five real addresses with known data, for testing the address profile, rating, AI summary and the demo (see `PLAN.md`).
Each one was checked on 2026-11-06 directly against the source map services listed below.

## Main five

The id is the address id from `docs/PROFILE.md` (`<kommunenummer>-<adressekode>-<nummer><bokstav>`), looked up in Geonorge `adresser/v1/sok` on 2026-11-07. Open one in the app at `/a/<id>`, or its profile at `/api/address/<id>/profile`.

| # | Case | Address | Id | Kommune (nr) | Gnr/Bnr | lat | lng | Expected result | Checked against |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Quick clay | Arendalsgata 22, 0463 Oslo | `0301-10223-22` | Oslo (0301) | 221/19 | 59.937586 | 10.758173 | Inside quick clay hazard zone "Myraløkka", faregrad **Høy**, risiko 5. Strategic noise map: **65–70 dB** (checked 2026-11-07) | NVE `SkredKvikkleire2` layer 0 (KvikkleireFaregrad) |
| 2 | Flood zone | Nedre Rælingsveg 148, 2005 Rælingen | `3224-8900-148` | Rælingen (3224) | 104/771 | 59.949070 | 11.045545 | Inside **200-year** flood zone (flomsone `fs002_37`), not inside 10-year zone. Also inside a **red** road noise zone (checked 2026-11-07) | NVE `Flomsoner2` layer 17 (Flomsone_200arsflom) |
| 3 | Noisy road | Gamle Drammensvei 207, 1337 Sandvika | `3201-1101-207` | Bærum (3201) | 7/61 | 59.892180 | 10.534069 | **Red** road noise zone (Lden > 65 dB), next to E18 | Statens vegvesen WMS `norstoy_1_0`, layer `Stoyvarselkart` |
| 4 | Quiet suburb | Grevlingåsen 17, 1362 Hosle | `3201-1574-17` | Bærum (3201) | 21/309 | 59.939649 | 10.590461 | **No** quick clay zone, no 200-year flood zone, no road noise zone | All three services above |
| 5 | Ski area | Holmenkollveien 196, 0791 Oslo | `0301-13070-196` | Oslo (0301) | 34/16 | 59.977219 | 10.676161 | Next to Frognerseteren / Nordmarka ski tracks. **No** quick clay, flood or road noise zone. Strategic noise map: 50–55 dB, below the yellow level (checked 2026-11-07) | All three services above |

## Backups

| Case | Address | Id | Kommune (nr) | lat | lng | Expected result |
|---|---|---|---|---|---|---|
| Quick clay | Kjelsåsveien 162, 0491 Oslo | `0301-13747-162` | Oslo (0301) | 59.965764 | 10.776008 | Quick clay zone "Kjelsås", faregrad Middels |
| Flood zone | Strandvegen 81, 2005 Rælingen | `3224-11700-81` | Rælingen (3224) | 59.947770 | 11.047739 | Inside 200-year flood zone `fs002_37`. Also inside a yellow road noise zone (checked 2026-11-07) |

## Source endpoints used

- NVE quick clay: `https://kart.nve.no/enterprise/rest/services/SkredKvikkleire2/MapServer/0/query`
- NVE flood zones: `https://kart.nve.no/enterprise/rest/services/Flomsoner2/MapServer/17/query`
- Road noise: `https://www.vegvesen.no/kart/ogc/norstoy_1_0/ows` (WMS GetFeatureInfo)
- Address lookup: `https://ws.geonorge.no/adresser/v1/sok`

## Not checked yet

- Ski tracks at #5: Turrutebasen (`turruter`) has a trail 45 m away but the nearest ski track 1.2 km away (TRY-løypa). Turrutebasen lacks most Nordmarka ski tracks, so this does not show the ski area well.
- Polluted ground (`grunnforurensning`) on 2026-11-07: #1 has a registered site 17 m away ("Arendalsgata 3-22", påvirkningsgrad 2: acceptable with today's use). The others have none within 100 m.
- Radon and soil type (from Sverre's `radon` and `losmasser`) on 2026-11-07: #1 meget høy radon, marine clay (hav- og fjordavsetning). #2 middels radon, fluvial deposit. #3 meget høy radon. #4 høy radon, fill (fyllmasse). #5 høy radon, bare rock. Not checked against NGU's own map.
- Overall rating on 2026-11-07 (after Lukas's stacked caps): #1 20, #2 65, #3 65, #4 75, #5 75.
- Busiest stop within 500 m (`transitDepartures`): #1 Sagene 1154, #2 Lillestrøm stasjon 363, #3 Sandvika stasjon 444, #4 Jegeråsen 161 (212 m), #5 Frognerseteren 76.
- Rockfall, debris slide and avalanche (Sverre's `steinsprang`, `jordflomskred`, `snoskred`): none of the 5 addresses is in an area.
- Departures at the nearest stop (Tue 2026-11-10, `stops.departures`): #1 Arendalsgata 929 (3 lines), #2 Dammensvika 152, #3 Lakseberget 230, #4 Grevlingbakken **5** (1 line), #5 Frognerseteren 76 (metro + bus).
- Strategic noise map (`stoy_strategisk`, 2021) on 2026-11-07: #2 65–70 dB, #3 70–75 dB, #4 no zone (unknown), backup Kjelsåsveien 162 55–60 dB.
- The road noise map (`Stoyvarselkart`) only covers national and county roads and has no data inside central Oslo. That is why the noisy-road case is in Bærum.

## How to use

- **Profile / rating:** each address should show the expected result above. #4 should score best on hazards and noise.
- **AI summary:** read the summary for each address. It must mention the hazard for #1–#3 and must **not** invent hazards for #4 and #5.
- **Demo:** #1 against #4 makes a clear contrast.
