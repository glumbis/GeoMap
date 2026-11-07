# Omnium Rapport (PDF)

An in-depth PDF about one address: everything on the address page, plus maps, charts and a checklist, laid out like a printed property report.
Lukas owns the report (`api/src/report.ts`, `api/src/pdf.ts`). Erik owns the button on the website.
Free for now. Later the full report can become a paid extra (see `extra_features.md` → #1).

## Endpoint

`GET /api/address/<id>/report.pdf`

- Returns `application/pdf`, opened in the browser tab. Add `?download=1` to save it as a file instead.
- File name: `omnium-rapport-<id>.pdf`.
- Takes about 5–10 s: it builds the profile and summary, loads map tiles, then prints. Not cached.
- Errors are JSON like every other endpoint: 400 bad id, 404 unknown address, 503 when no browser is found or Geonorge is down.
- **This (and `report.html` below) is the exception to "every API response is JSON"** (`AGENTS.md` → "API conventions"), agreed by Lukas 2026-11-07. A PDF can't be JSON. Don't add other non-JSON endpoints without asking Lukas.

Try it: http://localhost:5173/api/address/0301-10223-22/report.pdf

### Printed by the browser: `report.html`

`GET /api/address/<id>/report.html` is the same report as a web page that the visitor's own browser saves as PDF
(`?print` opens the print dialog once map tiles and fonts are loaded). It exists for hosts with too little memory
for Chromium next to the database (Render free, 512 MB). Those set `REPORT_PRINT=browser`, and then `report.pdf`
redirects to `report.html?print`, so the button on the website works unchanged.

## How it is made

1. `buildReport()` in `api/src/report.ts` loads the profile and the summary (same code as the two JSON endpoints, so the report never says anything the page doesn't).
2. It draws an A4 HTML page: Kartverket tiles laid out as images, NVE hazard zones from our own tables drawn as SVG on top, charts as plain HTML/SVG. No chart library.
3. `api/src/pdf.ts` prints it with the Chrome or Edge already installed on the machine (`playwright-core`, which downloads no browser). Order: `CHROME_PATH` in `.env`, then Chrome, then Edge. One browser is started on first use and reused.

## What is in it

1. **Cover:** logo, address, postcode, kommune, gnr/bnr, map with pin, overall score on a 0–100 scale, the cap reason (never "God" when capped), weakest category, data coverage, top 3 findings, and the disclaimer.
2. **Oversikt:** AI summary (labelled with the model, only when `aiGenerated`), otherwise the fact sentences. Category bars with weights. The four perspectives with what pulls each down. **Sammenlignet med området:** a score histogram for the grunnkrets and the kommune with the address marked, its percentile and the median (`api/src/area.ts`, same numbers as `/api/omrade/<id>`). Needs `npm run scores`; without it the report says the comparison is not available yet.
3. **Funn og faresoner:** a 1.6 km map with every NVE hazard zone near the address, and all findings, worst first.
4. **Detaljer per kategori:** every data point with value, score bar, warning, info text and source; missing data points as "Ikke tilgjengelig" with the reason.
5. **Spørsmål å stille:** a checklist for the viewing, from the findings. The questions are written by hand in `QUESTIONS` in `api/src/report.ts`, never by the AI. A data point with a warning and no written question gets a plain "Spør selger eller megler om dette: ...".
6. **Om rapporten:** how the score is computed, data coverage chart, missing data, every source with owner, licence and link, date and profile version.

Same rules as the rest of Omnium: no faked data, every number has a source, missing data is shown as missing (`docs/PROFILE.md`).
Colours are copied from `web/src/style.css` into `C` at the top of `report.ts`; if the brand colours change, change them there too.

## For Erik: the button on the address page

Add one action to the address page that opens the report. Suggested:

- **Where:** in the left column, right under the overall rating block (before the warnings), so it is seen without scrolling.
- **What:** a link styled as a secondary button: **"Last ned rapport (PDF)"**, with a small line under it: "Alt om adressen samlet i én rapport, med kart og sjekkliste".
- **Link:** `<a href="/api/address/${id}/report.pdf" target="_blank" rel="noopener">`. A plain link is enough: the browser opens the PDF in a new tab, and the user can save or print it there. No fetch, no blob handling.
- **Waiting:** the PDF takes 5–10 s. Because it opens in a new tab, the browser shows its own loading state there. Optional: after the click, change the label to "Lager rapport …" for 10 s so people don't click twice.
- **Errors:** if the API fails, the new tab shows the JSON error. Good enough for the demo.
- **Style:** follow `docs/DESIGN.md`: square corners, ink outline, navy text, orange only on focus. It is not the one main action, so no orange fill.
- **Later, when it becomes paid:** the same spot shows "Fullstendig rapport · 149 kr" and goes through payment first. Not now.

*Done when:* on all 5 test addresses, clicking the button opens a correct PDF in a new tab, and the button is reachable with the keyboard.
