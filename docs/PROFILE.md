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

## What a profile contains

- **Version:** a version number for this standard, raised on breaking changes.
- **Address:** the id used in the URL, the address text, postcode, place, municipality and its number, and the coordinates (lng, lat in EPSG:4326).
- **Overall rating:** see Rating below.
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

**A data point we have** has an id, a label, the raw value (for logic), a display text (for people), an optional unit, its importance, its effect on the score (good, neutral or bad), its source, and an optional plain-language explanation of what it means (Even writes these).

**Importance** is either *critical* or *normal*. Critical points decide whether a category can be rated at all.

**A missing data point** has the same id, label, importance and source, plus why it is missing:
- *no coverage*: the source has no data for this place
- *source unavailable*: the source is down or not responding
- *not loaded*: we have not ingested that dataset yet

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

## Rules for anyone reading the profile (web app, agents, scripts, AI summary)

- **Treat categories as a list.** Never depend on a fixed set or a fixed position. An unknown category gets the standard card.
- **Ignore fields you don't recognise.** New optional fields can be added without breaking anyone.
- **Never show a number when there is no score.** Show the reason instead.
- **Show every missing data point as "Unavailable"**, so users see what we don't know.
- **Optional fields may be absent.** Check before using them.
- **AI summary** (see `PLAN.md`): build the fact sentences only from the data points, warnings and ratings that are present. Also pass along what is missing and any "can't rate" reasons, so the summary says what we don't know instead of filling the gap.

## Adding a category or data point

1. Add it in `api/`: give it a stable id, a weight, and mark each data point critical or normal.
2. Add its source.
3. Nothing changes in `web/`: the web app shows any category that follows this standard.
4. If you change a field's name or meaning, update this file and the version, and tell the team.
