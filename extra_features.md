# Extra features

Ideas for after the hackathon demo: features that bring people in, make them come back, or could pay for Omnium.
Not for phase 1–3 in `PLAN.md`. Add your own under a new heading. Every idea must follow the same rules as the rest of Omnium: no faked data, every number has a source, missing data is shown as missing (`docs/PROFILE.md`).

## Overview

| # | Feature | Why people want it | Effort | Money |
|---|---------|--------------------|--------|-------|
| 1 | Omnium Rapport (PDF) | Something to keep, print and bring to the bank or viewing | Medium | Paid |
| 2 | Compare addresses | Buyers always choose between 2–3 homes | Low | Free (hook) |
| 3 | Visning checklist | Turns warnings into questions for the estate agent | Low | Free, part of the report |
| 4 | My commute | "How long to my job?" is the first question people ask | Low | Free |
| 5 | Find areas that fit me | Search by needs, not by address | High | Free / paid filters |
| 6 | Future check (climate) | Flood and storm surge in 2050–2100, not just today | Medium | Part of the report |
| 7 | Sun and light | Sun hours on the balcony in March vs June | Medium | Part of the report |
| 8 | Share card | Good-looking link preview with the score | Low | Free (growth) |
| 9 | Watch an address | Mail when data about a saved address changes | Medium | Free with account |
| 10 | Omnium for business | API and widget for agents, banks, insurers | Medium | Paid (B2B) |

Suggested order: 2, 3, 8 first (cheap, they spread the product), then 1 (the first thing to charge for), then 4, 6, 7 as report content.

---

## 1. Omnium Rapport: an in-depth PDF about the property (Lukas)

A downloadable report about one address, like a condition report ("tilstandsrapport") for the ground and the surroundings. The address page answers "is this OK?" in 10 seconds; the report is for the person who is about to spend millions and wants everything, on paper, with graphs.

**Who buys it:** homebuyers before a bid, people building or renovating, developers checking a plot, people who want to show the bank or insurer the risks are known.

**What is in it:**
1. **Front page:** address, map extract, overall score with the cap reason in plain words, date and data version.
2. **Summary:** the AI summary (marked "AI-generert") and the top warnings.
3. **Perspectives chart:** Bo her, Bygge her, Familie, Pendler as a bar chart, each with the factors that pull it down.
4. **One page per category:** score, every data point with value, source and info text from `docs/TEXTS.md`, and a small map of the relevant layer (quick clay zone, flood zone, noise band).
5. **Compared to the area:** where this address sits against other addresses in the same kommune or grunnkrets (percentile, histogram). Needs scores for many addresses (batch job); until then leave it out.
6. **Future check and sun** (ideas 6 and 7), when built.
7. **Questions to ask** (idea 3).
8. **Missing data:** what we could not check and why, so nobody reads silence as "safe".
9. **Sources and licences**, plus the line "Not a safety rating, a price signal or a promise that a risk is absent" (from `docs/PROFILE.md`).

**Free vs paid:**
- Free: a print-friendly version of the address page (`@media print` in CSS, browser "Save as PDF"). Cheap to build and good for the demo.
- Paid (later): the full report with charts, area comparison, future check and sun. Price idea: 99–199 kr per address, or a pack for agents.

**How to build it (suggestion):**
- A web page `/a/<id>/rapport` that uses the existing profile and summary endpoints, laid out for A4 with print CSS, charts as inline SVG. The browser turns it into a PDF. No new dependency.
- Later, for a "Download PDF" button: render that same page with headless Chrome (Playwright) in a script or worker. Note: the API rule is "every API response is JSON", so a PDF endpoint needs a team decision, or the PDF is made outside `api/`.
- Payment (Vipps or Stripe) only after people actually use the free version.

## 2. Compare addresses

Pick 2–3 addresses and see them side by side: overall score, category scores, perspectives, warnings. Buyers rarely look at one home alone, so this is where they spend time. Built only from existing profiles; mostly web work (Erik). Can also be a section in the report.

## 3. Visning checklist ("Spør megleren")

Turn each warning and missing data point into a concrete question to ask at the viewing or the seller. Example: quick clay zone → "Er det gjort geoteknisk vurdering av tomten?"; radon high → "Er det målt radon, og når?"; flood zone → "Har kjelleren hatt vann inn?". Rules written by hand per data point (like `docs/FACTS.md`), not invented by AI. Cheap, very practical, and something people share.

## 4. My commute

The user types their work or school address and gets travel time by public transport (Entur Journey Planner, free, no key) and by bike or car. Can feed the "Pendler" perspective with the user's own destination instead of a general guess. Should be kept in the browser only, never stored.

## 5. Find areas that fit me

Turn the map around: instead of "tell me about this address", the user says "low hazard, quiet, school within 1 km, under 30 min to Oslo S" and the map colours the areas that fit. Needs scores pre-computed on a grid or per grunnkrets. The biggest job here, but also the most "wow" for people who don't have an address yet.

## 6. Future check (climate)

Show how risk changes with climate: storm surge and sea level for 2050 and 2100 (Kartverket already has these), flood zones with climate allowance where NVE has them, more heavy rain. Fits the report well and is something no listing shows today.

## 7. Sun and light

Hours of direct sun per season, from the terrain model (Kartverket høydedata) and PVGIS. "Sun on the façade at 17:00 in April" matters a lot to buyers and is hard to find anywhere. Also useful for solar panels.

## 8. Share card

When someone shares an Omnium link in Messenger, Slack or Finn comments, show a preview image with the address, score and top warning. Every share is free marketing. Small job: one generated image per address plus Open Graph tags.

## 9. Watch an address

Save addresses and get a mail when something changes: NVE updates a hazard map, a new noise map, a new kindergarten nearby. Brings people back and is the reason to make an account. Needs accounts and mail, so not before the product has users.

## 10. Omnium for business

- **API** for estate agents, banks and insurers: the same profile JSON, with a key and a usage price.
- **Widget** an agent can put on a listing: score, top warnings, link to the full Omnium page.
- Business pays, private users keep the free version. Check the licence of every source first (most are NLOD / CC BY, which allow commercial use with attribution).
