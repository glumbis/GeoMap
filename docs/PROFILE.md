# Address profile standard

The ideas and rules for the address profile: the answer `GET /api/address/:id/profile` gives about one address.
This is a standard, not code. It is the agreement between the API (Lukas, Sverre), the web app (Erik), the AI summary and anyone else reading the data.
Lukas owns the final field names and numbers. Change this file first, then the code, and tell the team.

## Core rules

1. **JSON only.** The profile, like every API response, is JSON.
2. **Never fake data.** If we do not have a value, it is left out. No empty values, zeros or estimates standing in for real data.
3. **Say what is missing.** Every data point we expected but do not have is listed as missing, with the reason. The UI shows it as "Unavailable".
4. **Never guess a score.** A score uses only data we actually have. If too much important data is missing, there is no score, only a plain-language reason why we can't rate.
5. **Everything has a source.** Every data point, missing or not, names its source. Every warning points to a real data point.

## Address id

Every address has one id, used in the URL (`/a/<id>` in the web app, `/api/address/<id>/...` in the API):

`<kommunenummer>-<adressekode>-<nummer><bokstav>`, for example `0301-10223-22` (Arendalsgata 22, Oslo) or `0301-13729-64A` (Kirkeveien 64A).

- All four parts come from a Geonorge `adresser/v1/sok` result: `kommunenummer`, `adressekode`, `nummer`, `bokstav`.
- `kommunenummer` is 4 digits. `adressekode` and `nummer` are written without leading zeros. `bokstav` is upper case, and left out when empty.
- The API looks it up again with `adresser/v1/sok?kommunenummer=..&adressekode=..&nummer=..` and matches `bokstav` exactly.
- Only street addresses (`objtype` `Vegadresse`). Search in the web app should filter out other types.
- Errors: a badly formed id gives 400 `bad_request`, an unknown address 404 `not_found`, Geonorge down 503 `unavailable`.

## What a profile contains

- **Version:** a version number for this standard, raised on breaking changes.
- **Address:** the id used in the URL, the address text, postcode, place, municipality and its number, and the coordinates (lng, lat in EPSG:4326).
- **Overall rating:** see Rating below.
- **Perspectives:** the same data scored for one kind of use (living, building, family, commuting). See Perspectives below.
- **Warnings:** the most serious findings, most important first. Each has a severity (high, medium, low), a short text, and points to the data point it comes from.
- **Categories:** a list of any length, shown in the order given.
- **Sources:** one entry per source used: name, owner, link, licence.

## Rating (overall and each category)

- **Status**, one of:
  - *ok*: a score could be calculated.
  - *insufficient data*: some data exists, but not enough to rate fairly.
  - *unavailable*: no data at all.
- **Score:** 0–100, higher is better. Only present when the status is ok.
- **Reason:** plain-language explanation. Only present when the status is not ok.
- **Coverage:** how many data points we have, how many we expected, and how many critical ones are missing. The UI can show this as "8 of 10 data points".

**What the overall score means.** It is a summary of what the public data we have says about the address. It is not a safety rating, a price signal or a promise that a risk is absent.
- The number comes from two steps. First, a weighted average of the rated categories gives everyday quality. Then serious warnings cap it, so one serious hazard can never be averaged away. Caps are soft: the score is the everyday quality scaled into the cap (`score × cap / 100`), so the cap is the best a capped address can get, and two capped addresses of different quality still get different numbers.
- Severity says how serious a finding is. The cap is the scoring penalty that follows from it. A warning's severity never changes; only the cap rules below turn it into points.
- When `cappedBy` is present, the hazard decides the number, not the everyday quality. The UI must then show the cap reason next to the number. It must not show a word like "God" (good) for a capped score.
- A hazard map only counts as good where the source has mapped the area (see "Mapped area" under Data points). "Not mapped" is shown, but not scored.

## Categories are not fixed

Categories can be added, removed or renamed at any time without changing the web app.
Each category has:
- a stable id, a display name, and a short optional summary line
- a **weight**: its share of the overall score relative to the other categories
- a **required** flag: if a required category can't be rated, the overall can't be rated either
- its own rating
- the list of **data points we have**
- the list of **data points we are missing**

## Data points

**A data point we have** has an id, a label, the raw value (for logic), a display text (for people), an optional unit, its importance, its effect on the score (good, neutral or bad), its source, and an optional plain-language explanation of what it means (Even writes these). The explanation is the data point's **Forklaring** from `docs/TEXTS.md`, then each **Når ...** text whose outcome matches this result (rules in `OUTCOMES`, `api/src/texts.ts`), then any extra note the data point adds itself.

**Importance** is either *critical* or *normal*. Critical points decide whether a category can be rated at all.

**A missing data point** has the same id, label, importance and source, plus why it is missing:
- *no coverage*: the source has no data for this place
- *source unavailable*: the source is down or not responding
- *not loaded*: we have not ingested that dataset yet

**Mapped area.** Some hazard maps only cover part of the region (NVE quick clay and flood zones). For these, "no zone found" means two different things:
- inside an area the source has mapped: *not in a mapped zone*. This is real data and counts as good.
- outside it: *not mapped here*. Value `ikkeKartlagt`, effect neutral, no score, and an explanation that this does not mean safe. The AI summary lists it with the missing data.
A data point declares its mapped-area table with `coverage` in `api/src/datapoints.ts`.

## When can we rate? (draft defaults, Lukas decides)

**A category**
- *unavailable* if it has no data points at all
- *insufficient data* if any critical data point is missing, or fewer than half of the expected data points are present
- *ok* otherwise, scored from the present data points only

**The overall rating**
- *unavailable* if there is no data in any category
- *insufficient data* if any required category is not ok, or the categories that are ok hold less than 60% of the total weight
- *ok* otherwise: the weighted average of the ok categories only, with their weights rescaled to add up to 100%

The reason always names what is missing, for example that ground and hazard data are missing for this address.

## Field names (version 1)

The code is the source of truth (`api/src/profile.ts`, `api/src/rating.ts`, `api/src/datapoints.ts`). Example (shortened):

```json
{
  "version": 1,
  "address": { "id": "0301-10223-22", "text": "Arendalsgata 22", "postcode": "0463", "place": "OSLO",
               "municipality": "OSLO", "municipalityNumber": "0301", "gnr": 221, "bnr": 19, "lng": 10.758173, "lat": 59.9375855 },
  "rating": { "status": "ok", "score": 40, "coverage": { "present": 13, "expected": 13, "criticalMissing": 0 },
              "cappedBy": [{ "dataPointId": "quickClay", "cap": 40, "text": "Faresone for kvikkleireskred, faregrad høy" }],
              "weakestCategory": { "id": "hazards", "name": "Naturfare", "score": 30 } },
  "warnings": [{ "severity": "high", "text": "Faresone for kvikkleireskred, faregrad høy", "dataPointId": "quickClay", "categoryId": "hazards" }],
  "categories": [{
    "id": "hazards", "name": "Naturfare", "weight": 25, "required": true,
    "rating": { "status": "ok", "score": 30, "coverage": { "present": 2, "expected": 3, "criticalMissing": 0 } },
    "dataPoints": [{ "id": "quickClay", "label": "Kvikkleire faresone", "value": "høy", "display": "I faresone \"Myraløkka\", faregrad høy",
                     "importance": "critical", "effect": "bad", "score": 0, "source": "nve-kvikkleire",
                     "warning": { "severity": "high", "text": "Faresone for kvikkleireskred, faregrad høy" } }],
    "missing": [{ "id": "rockfall", "label": "Steinsprang", "importance": "normal", "source": "nve-steinsprang", "reason": "notLoaded" }]
  }],
  "sources": [{ "id": "nve-kvikkleire", "name": "Faresoner kvikkleire", "owner": "NVE", "url": "https://...", "licence": "NLOD 2.0" }]
}
```

- `rating.status`: `ok` | `insufficientData` | `unavailable`. `score` only when `ok`, `reason` only when not.
- `cappedBy`: warnings that pulled the score down. `weakestCategory`: overall only, whenever at least one category is rated.
- A data point's `source` is a source `id` from `sources`. `unit`, `score`, `warning` and `explanation` are optional.
- `missing[].reason`: `noCoverage` | `sourceUnavailable` | `notLoaded`.
- Severity caps, category: a `high` warning caps its category at 30, `medium` at 60; `low` gives no cap. All caps are soft: score = uncapped score × cap / 100. The overall averages the categories' uncapped scores, so a warning is not scaled down twice.
- Severity caps, overall: the worst warning sets the cap (`high` 40, `medium` 75). Every further `high` or `medium` warning lowers it by 10, down to 10. `low` gives no cap. `cappedBy` lists every `high` and `medium` warning, each with the final cap, whenever there is one.
  Why: one medium cap of 60 made most addresses score exactly 60 (high radon is common around Oslo), so a quiet suburb tied with a flood zone next to a loud road.
- Data point without `score`: `good` counts 100, `bad` counts 0, `neutral` is not scored.

## Perspectives

One overall number can't say whether a place is good to live in *and* good to build on. `perspectives` scores the same data points for one kind of use each. Defined in `api/src/perspectives.ts` (one entry per perspective: weight per data point, and which data points are required).

| id | name | question | weighs most |
|---|---|---|---|
| `living` | Bo her | Hvordan er det å bo her til daglig? | radon, quick clay, flood, noise, transit, trails |
| `building` | Bygge her | Hvor krevende er grunnen å bygge eller grave i? | quick clay, soil, flood, polluted ground |
| `family` | Familie | Hvor godt passer stedet for barnefamilier? | school, kindergarten, trails, noise, radon |
| `commuter` | Pendler | Hvor lett er det å reise kollektivt herfra? | departures within 500 m, nearest stop |

- Each has `id`, `name`, `question` and a `rating` with the same fields as any rating (status, score or reason, coverage, `cappedBy`), plus `factors`.
- Score: weighted average of the listed data points that have a score, then soft caps from *their own* high/medium warnings (same cap numbers as the overall). A data point not listed doesn't count, so a quick clay zone caps "Bygge her" but not "Pendler".
- `factors`: every scored data point in the perspective, `{ dataPointId, label, weight, score }`, biggest drag on the score first (`(100 − score) × weight`). The UI can show the top few as "why".
- A required data point missing gives `insufficientData` with a reason, never a number.
- Treat the list like categories: render whatever comes, in the order given.

## Rules for anyone reading the profile (web app, agents, scripts, AI summary)

- **Treat categories as a list.** Never depend on a fixed set or a fixed position. An unknown category gets the standard card.
- **Ignore fields you don't recognise.** New optional fields can be added without breaking anyone.
- **Never show a number when there is no score.** Show the reason instead.
- **Show every missing data point as "Unavailable"**, so users see what we don't know.
- **Optional fields may be absent.** Check before using them.
- **AI summary** (see `PLAN.md`): build the fact sentences only from the data points, warnings and ratings that are present. Also pass along what is missing and any "can't rate" reasons, so the summary says what we don't know instead of filling the gap.

## Adding a category or data point

1. Add it in `api/src/datapoints.ts`: one entry in `DATA_POINTS` per data point (a category is one entry in `CATEGORIES`, with a weight). Give it a stable id and mark it critical or normal.
2. Add its source.
3. Nothing changes in `web/`: the web app shows any category that follows this standard.
4. If you change a field's name or meaning, update this file and the version, and tell the team.
