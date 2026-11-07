# Design direction

The look and flow of **Omnium** (the product name; the repo is still called GeoMap).
Erik owns the design and `web/`. Everyone else follows this file when they touch anything people see.
Change this file first, then the code.

## The idea in one line

Type one address, get one honest answer about the place: what is good, what is risky, and what we don't know.

## Laptop only (MVP)

- We build for laptop and desktop screens and nothing else: from 1280×720 up to 4K (3840×2160).
- The layout scales with the window, so a 4K screen at 100% zoom looks like a bigger laptop, not a tiny page in a corner:
  - The root font size grows with the window width (`html { font-size: clamp(16px, 0.833vw, 32px) }`: 16 px at 1920, 32 px at 3840).
  - Sizes are in `rem` (text, spacing, the left column, the top bar), so everything grows together. Avoid fixed `px` except for 1 px lines.
  - The map simply gets more room.
- No mobile or tablet layouts, no media queries for small screens, no touch-specific work. Don't spend time on it.
- Below 1280 px the page may scroll sideways. That is fine for now.
- Mobile comes after the hackathon, if at all.

## Page flow

There are two pages. Nothing else.

### 1. Start page (the first thing anyone sees)

- Almost empty. Paper background (`--paper`), lots of white space.
- Centred: the logo (`/logo.png`, or `/logo-mark.png` + the word "Omnium"), and below it **one big search field** (40 rem wide).
- Placeholder text: "Skriv inn en adresse" ("Enter an address").
- Autocomplete as you type, from Geonorge `https://ws.geonorge.no/adresser/v1/sok?sok=<text>&fuzzy=true&treffPerSide=20`.
  - Keep only `objtype` `Vegadresse` in Oslo (`0301`) and Akershus (`32xx`); Geonorge can't filter on several municipalities at once, so filter in the browser. Show at most 8.
  - Show street, number, postcode and place.
  - Arrow keys + Enter + Escape work. Debounce ~150 ms.
- One short line under the field: "Alt offentlig tilgjengelig om en eiendom i Oslo og Akershus" ("All public info about a property in Oslo and Akershus").
- No map, no menus, no buttons besides the field. The map is not the first page.

### 2. Address page (after picking an address)

- The URL changes to `/a/<address-id>` so the page can be shared and reloaded. Id format: `docs/PROFILE.md` → "Address id".
- Fills the browser window; the page itself does not scroll.
- **Top bar** (full width, 4 rem): small logo mark (click it to go back to the start page) and a compact search field.
- **Left column** (30 rem, about 480 px on a 1920 screen; scrolls on its own), top to bottom:
  - **Address**, large.
  - **Overall rating:** a big number with a ring around it that echoes the logo ring, a word (Svak / Middels / God / Svært god) and "basert på X av Y datapunkter".
  - **Cap note** when a serious finding capped the score: "Begrenset til 40 på grunn av kvikkleire".
  - **Weakest category**, always shown next to the overall score (see `suggestions.md`): "Svakest: Grunnforhold 31".
  - When the profile can't be rated: "Kan ikke vurderes" with the reason. Never a number.
  - **Up to 3 warnings**, most serious first. Each has a colour dot and a word for severity, and clicking it opens its data point.
  - **AI summary**, labelled "AI-generert".
  - **Category cards**, one per category in the profile (never a fixed list, see `docs/PROFILE.md`). Each card shows the score (or "Kan ikke vurderes" with the reason) and opens to show every data point: colour dot, label, value, a plain-language explanation and the source. Missing data points show "Ikke tilgjengelig" and why, in `--unknown` grey.
- **Right side:** the map fills the rest of the window, zoomed to the address with an orange pin. The layer panel floats on the map (top right), with a legend for the visible layers below it.
- **States:** loading (skeleton blocks, no spinner wall), error ("Noe gikk galt" + try again), address outside Oslo/Akershus, address not found.

### Later, if there is time

- A switch per data point so users choose what counts, plus "slå av/på alle" per category. Choices are saved and follow the user across addresses. Warnings always stay visible, even when switched off. A line shows how many points are switched off, with a reset button.
- Income, population and crime start switched off, shown as facts only. Cultural heritage and ground surveys are always facts only, never scored.

## Style

**Modern, calm, warm.** Think of a good Scandinavian product: soft paper background, deep navy text, one warm accent colour. No dark heavy chrome, no grey admin-panel look.

- **Colours:** use the CSS variables in `web/src/style.css` only. Never hard-code a colour.
  - Navy/teal for structure (headings, buttons, links).
  - Orange (`--orange`) is the accent: the pin, the focused search field, the one main action. Use it sparingly.
  - The brand gradient (`--brand-gradient`, orange → teal → navy, like the logo ring) for the rating ring and at most one other highlight.
  - Scores: `--good`, `--warn`, `--bad`. Missing data: `--unknown`. Never show missing data as green.
- **Type:** Outfit (loaded in `web/index.html`). Address 32–40 px, rating number 56+ px. Body text 16 px. Short lines.
- **Shapes:** rounded corners (`--radius`, 16 px), soft shadows (`--shadow`), thin lines (`--line`). Cards on white (`--surface`) on paper.
- **Space:** generous. When in doubt, more space and less stuff.
- **Motion:** small and fast (150–250 ms). The rating ring can fill once on load. Nothing bounces.
- **Language:** all UI text in Norwegian (bokmål), plain words, no jargon. Code, comments and docs stay in English.
- **Accessibility:** text contrast at least 4.5:1, visible focus ring (orange), everything usable with the keyboard, colour is never the only signal (add an icon or word).

## The map

The map should look like part of the logo, not like a default web map.

- **Top-down only:** no tilt, no rotation (turn off pitch and rotate gestures, no compass).
- **Basemap:** Kartverket raster tiles (free, no key). Start from `topograatone` (grey) and warm it up with MapLibre raster paint properties (`raster-saturation`, `raster-contrast`, `raster-brightness-min/max`, `raster-hue-rotate`) until it sits calmly on the paper colour. The data layers are the colour; the basemap is the quiet background.
- **Data layers:** brand colours with transparency. Hazards in `--bad`/`--warn` fills at ~30% opacity with a thin solid outline. Nature in `--green`, water in `--map-water`. Municipality borders thin navy.
- **Pin:** orange teardrop with a white dot, as in the logo.
- **Controls:** zoom buttons and attribution restyled to match (white, rounded, soft shadow). Keep the "© Kartverket" attribution visible.
- **Layer panel:** a white rounded card, grouped by the same categories as the cards, a small colour swatch per layer.

## Assets

- `web/public/logo.png`: full logo with the word mark (512 px).
- `web/public/logo-mark.png`: the ring only, transparent background (256 px). Also the favicon.
- `docs/brand/omnium-logo.png`: the original logo (1254 px), for slides and the demo.
