# Design direction

The look and flow of **Omnium** (the product name; the repo is still called GeoMap).
Erik owns the design and `web/`. Everyone else follows this file when they touch anything people see.
Change this file first, then the code.

## The idea in one line

Type one address, get one honest answer about the place: what is good, what is risky, and what we don't know.

## Page flow

There are two pages. Nothing else.

### 1. Start page (the first thing anyone sees)

- Almost empty. Paper background (`--paper`), lots of white space.
- In the middle: the logo (`/logo.png`, or `/logo-mark.png` + the word "Omnium"), and below it **one big search field**.
- Placeholder text: "Skriv inn en adresse" ("Enter an address").
- Autocomplete as you type, from Geonorge `https://ws.geonorge.no/adresser/v1/sok?sok=<text>&fuzzy=true&treffPerSide=8`. Show street, number, postcode and place. Arrow keys + Enter work. Debounce ~150 ms.
- One short line under the field, for example: "Alt offentlig tilgjengelig om en eiendom i Oslo og Akershus" ("All public info about a property in Oslo and Akershus").
- No map, no menus, no buttons besides the field. The map is not the first page.

### 2. Address page (after picking an address)

- The URL changes to `/a/<address-id>` so the page can be shared and reloaded.
- **Top bar:** small logo mark (click it to go back to the start page) and a compact search field.
- **Summary block, top of the page:**
  - The address, large.
  - The overall rating as a big number with a ring around it that echoes the logo ring. Next to it, always the weakest category (see `suggestions.md`): "72 total, men Grunnforhold er 31".
  - Up to 3 warnings, most serious first. Each has a colour dot (severity) and links to its data point.
  - The AI summary, labelled "AI-generert".
- **Category cards** below. One card per category from the profile (never a fixed list, see `docs/PROFILE.md`). Each card shows the score (or "Kan ikke vurderes" with the reason), and expands to show every data point: value, plain-language explanation, source. Missing data points show as "Ikke tilgjengelig" in `--unknown` grey.
- **Map:** on desktop, on the right half of the screen, sticky while you scroll the cards. On mobile, a map block under the summary that can be opened full screen. Zoomed to the address with an orange pin (`--orange`, same shape as the pin in the logo). Layer toggles grouped by category.

## Style

**Modern, calm, warm.** Think of a good Scandinavian product: soft paper background, deep navy text, one warm accent colour. No dark heavy chrome, no grey admin-panel look.

- **Colours:** use the CSS variables in `web/src/style.css` only. Never hard-code a colour.
  - Navy/teal for structure (headings, buttons, links).
  - Orange (`--orange`) is the accent: the pin, the focused search field, the one main action. Use it sparingly.
  - The brand gradient (`--brand-gradient`, orange → teal → navy, like the logo ring) for the rating ring and at most one other highlight.
  - Scores: `--good`, `--warn`, `--bad`. Missing data: `--unknown`. Never show missing data as green.
- **Type:** Outfit (loaded in `web/index.html`). Big, confident headings (address 32–40 px, rating number 56+ px). Body text 16 px. Short lines.
- **Shapes:** rounded corners (`--radius`, 16 px), soft shadows (`--shadow`), thin lines (`--line`). Cards on white (`--surface`) on paper.
- **Space:** generous. When in doubt, more space and less stuff.
- **Motion:** small and fast (150–250 ms). The rating ring can fill once on load. Nothing bounces.
- **Mobile first:** everything must work at 375 px wide.
- **Language:** all UI text in Norwegian (bokmål), plain words, no jargon. Code, comments and docs stay in English.
- **Accessibility:** text contrast at least 4.5:1, visible focus ring (orange), everything usable with the keyboard, colour is never the only signal (add an icon or word).

## The map

The map should look like part of the logo, not like a default web map.

- **Basemap:** Kartverket raster tiles (free, no key). Start from `topograatone` (grey) and warm it up with MapLibre raster paint properties (`raster-saturation`, `raster-contrast`, `raster-brightness-min/max`, `raster-hue-rotate`) until it sits calmly on the paper colour. The data layers are the colour; the basemap is the quiet background.
- **Data layers:** brand colours with transparency. Hazards in `--bad`/`--warn` fills at ~30% opacity with a thin solid outline. Nature in `--green`, water in `--map-water`. Municipality borders thin navy.
- **Pin:** orange teardrop with a white dot, as in the logo.
- **Controls:** zoom buttons and attribution restyled to match (white, rounded, soft shadow). Keep the "© Kartverket" attribution visible.
- **Layer toggle panel:** a white rounded card, grouped by the same categories as the cards, a small colour swatch per layer.

## Assets

- `web/public/logo.png`: full logo with the word mark (512 px).
- `web/public/logo-mark.png`: the ring only, transparent background (256 px). Also the favicon.
- `docs/brand/omnium-logo.png`: the original logo (1254 px), for slides and the demo.
