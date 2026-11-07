# Hand-off to Codex (from Claude, 2026-11-07)

You are taking over front-end work for **Erik** (owner of `web/` and the design) on **Omnium** (repo name GeoMap): all public info about any property in Oslo + Akershus. Read this file, then `AGENTS.md` (you read it automatically), `docs/DESIGN.md` and `docs/PROFILE.md`. Speak plain, short English to Erik. Do routine steps yourself (install, pull, test, commit, push) without asking him to run commands.

---

## 1. Get yourself running (5 minutes)

Everything is already installed on Erik's machine (`C:\Users\Erik\Desktop\Everythingapp`, Windows 11). Check, don't reinstall:

```bash
node -v            # needs 22+ (26 is installed)
git --version
gh auth status     # logged in as Kiwiman1814 (keyring), push works over HTTPS
git pull --rebase --autostash
npm install        # ALWAYS after a pull that touched package-lock.json (the PDF report added playwright-core)
```

**Your sandbox:** `npm install`, `git pull/push`, `curl` to Geonorge and `localhost` need network. If your sandbox blocks it, ask Erik once to approve network / "full access" for this folder; don't work around it.

**The dev server** (`npm run dev` = API on :3000 + web on http://localhost:5173, Vite proxies `/api`):
- Check first, it is often already running: `curl -s -o /dev/null -w "%{http_code}" localhost:5173/api/health` → 200 means reuse it. Never start a second copy.
- 502 from `/api/...` but the web page loads = the API half crashed (usually after a pull that needed `npm install`, or while an ingest held the database). `tsx watch` is still alive and restarts on any file change: run `touch api/src/index.ts` (changes only the timestamp) and wait ~5 s.
- **Data:** one DuckDB file, `data/geomap.duckdb` (gitignored). Only one process may write it: stop the dev server before `npm run ingest <name>`, then start it again. On Windows, find the processes with `Get-CimInstance Win32_Process -Filter "name='node.exe'"` (look for `concurrently`, `vite`, `tsx`), stop them, ingest, then `npm run dev` in the background. An endpoint answering `{"error":"unavailable","message":"Table 'x' is not loaded. Run: npm run ingest x"}` just needs that ingest.
- `.env` holds `ANTHROPIC_API_KEY` (AI summaries). Never print or commit it.

**Checks before every push** (all must pass; CI runs the first two):
```bash
npm run typecheck
npm test
npm run test:addresses   # only if you touched data, rating, profile or summary (needs the dev server)
```

**Pushing to GitHub** (team rule: straight to `main`, small commits):
```bash
git add <only the files you changed>      # never `git add -A`: suggestions.md has someone else's unsaved edits
git commit -m "Web: <what changed, in plain words>"
git pull --rebase --autostash             # teammates push often; rebase, don't merge
npm run typecheck && npm test             # again, after the pull
git push
```
If the push is rejected ("fetch first"), pull again and repeat. Merge conflicts: in a file Erik doesn't own, keep the owner's version and redo your change on top. Never force-push, never switch branches.

**Seeing the page like a user (instead of Claude's built-in browser):** `playwright-core` is installed and uses the system Chrome/Edge (as `api/src/pdf.ts` does). Put a script in a temp folder, not the repo:

```js
// shot.mjs — node shot.mjs http://localhost:5173/ start.png
import { chromium } from "playwright-core";
const [url, out = "shot.png"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch({ channel: "msedge" }));
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on("console", (m) => m.type() === "error" && console.log("console error:", m.text()));
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(2500);                 // let the map tiles and animations settle
await p.mouse.move(900, 350); await p.waitForTimeout(800);   // e.g. to test the cursor lens
await p.screenshot({ path: out });
await b.close();
```
Run it from the repo root (so `playwright-core` resolves) with the script path, e.g. `node %TEMP%\shot.mjs http://localhost:5173/ %TEMP%\start.png`, then open the PNG. Test at 1280×800 (the smallest screen we design for). Map pages: `window.map` is the MapLibre map in dev (address and `/kart` pages).

**Test addresses** (`docs/TEST_ADDRESSES.md`): `/a/0301-10223-22` (quick clay, score ~14), `/a/0301-13070-196` (quiet, not mapped), `/a/3224-8900-148` (flood, Rælingen), `/a/3201-1101-207` (Sandvika, long name), `/a/0301-13747-162`. Compare: `/compare/0301-10223-22/0301-13070-196`. Map only: `/kart`.

---

## 2. Your two tasks

### Task A — Start page: the cursor lens doesn't work, and the opening view is wrong

Files: `web/src/app/startmap.ts` (the map, lens, idle pan, place-name tip, click-to-zoom), `web/src/app/start.css` (layers and lens CSS), `web/src/app/start.ts` (content). Theme overrides in `web/src/theme.css`.

How it is built now:
- Layers, bottom to top: the MapLibre map (`.start-map`, interactive) → `.start-fade` (paper colour, a left-to-right gradient set in `theme.css`) → `.start-lens` ring → content (`.start`, `pointer-events: none` except `.start-block`s).
- The "lens" = a radial-gradient **mask** on `.start-fade` centred on CSS variables `--lx/--ly/--lr`, set in a rAF loop in `startmap.ts` (`app.style.setProperty(...)`, around line 95–105); class `lens-on` on the page turns it on. Lens radius: `LENS_REM = 7`.

What Erik sees: the lens is "cool but doesn't work". What Claude observed: it only appears as a faint ring on the right, where the fade is already almost transparent, so revealing the map there changes nothing visible; on the left (solid paper) it rarely shows. Likely causes to check, in this order:
1. The mask is applied to `.start-fade`, but `theme.css` also sets `.start-fade`'s background (a left-to-right gradient that is almost transparent on the right). Check the computed `mask-image` in the browser and whether the hole is visible at all where the fade is already see-through. `--lx/--ly/--lr` are set together in the rAF loop (`startmap.ts` ~line 99–101).
2. `overMap` in `onMove` (`startmap.ts` ~line 147) is false over large areas (the `.start` box, the gradient), so the lens radius target stays 0.
3. Visual design: a hole in an already-transparent fade is invisible. Make the lens obviously do something everywhere, e.g. inside the circle show the map at full colour and slightly zoomed (a second, synced MapLibre map or a scaled clone clipped to the circle), with a crisp ink ring and a soft shadow. Keep it smooth (lerp, rAF), `pointer-events: none`, and off for `prefers-reduced-motion` and touch.

Opening view: start by showing **all of Oslo + Akershus** (fit bounds to the two counties, roughly `[[10.0, 59.45], [11.95, 60.55]]`, or the union of `/api/kommuner?limit=100` if you want it exact), optionally starting from all of mainland Norway (`center [15, 65], zoom 4.2`) and easing in over ~2.5 s. The current start is `center: CENTER, zoom: 13` (`startmap.ts` ~line 34) with a slow idle pan through `WAYPOINTS`; adjust the idle pan so it stays inside Oslo/Akershus at the new zoom, and keep the content on the left readable.

Done when: at 1280×800, moving the mouse over the map clearly shows the lens effect everywhere outside the content blocks; the page opens on all of Oslo + Akershus (or Norway → Oslo/Akershus); no console errors; typecheck passes; `docs/DESIGN.md` → "Start page" → "Background" updated to match.

### Task B — The collapsed "Kartlag" panel must open when you click anywhere on it

Files: `web/src/features/hazards.ts` (panel + collapse, ~line 530–585), `web/src/features/hazards.css`, `web/src/features/pick.ts` (adds the hint line "Klikk i kartet for å sjekke et annet sted" into the panel, ~line 130–135).

Now: the panel starts collapsed as a chip ("Kartlag · 5 på ▸" plus the hint line under it). Only the small `▸` button and the title text toggle it; clicking the hint line or the empty part of the chip does nothing, so it feels broken. Fix:
- When collapsed, the whole chip (title, count, hint, padding) is one click target that expands it (`cursor: pointer`, hover state). Keep the real `<button>` for keyboard/screen readers (`aria-expanded`), and don't double-toggle when the button itself is clicked (stop propagation or check the target).
- When expanded, clicks inside the panel (checkboxes, legends) must NOT collapse it; only the header toggles.
- Consider moving the "Klikk i kartet…" hint out of the panel into its own small chip at the bottom of the map (like `/kart` has), so it doesn't read as a button.
- The panel has a fixed width; keep it (switching layers on must never shift it sideways).

Done when: on `/a/0301-10223-22` and `/kart`, clicking anywhere on the collapsed chip opens it; the checkboxes still work; keyboard Tab + Enter on the toggle works; no console errors; typecheck passes.

---

## 3. What already exists (so you don't rebuild it)

- **Pages** (`web/src/main.ts` router): `/` start, `/a/<id>` address, `/kart` map only, `/compare/<a>/<b>`. View-transition cross-fades in `web/src/app/router.ts` + `transitions.css`.
- **Address page** (`web/src/app/address.ts`): score (cap reason replaces "God" when capped), "Last ned rapport (PDF)" (`report.ts`, opens `/api/address/<id>/report.pdf`), Del / Skriv ut (`share.ts`), warnings, "Hva betyr dette for deg?" perspective tabs (`audience.ts`), AI summary (`summary.ts`), category cards.
- **Map** (`web/src/app/map.ts`): one shared MapLibre map kept alive between pages; first load flies in from all of Norway. Every file in `web/src/features/` auto-loads on it: `hazards.ts` (Kartlag panel, all layers from `layerGroups()`, one entry per layer), `pick.ts` (click to drop a pin → nearest address).
- **Look:** editorial theme in `web/src/theme.css` (Source Serif 4 + IBM Plex Sans, ruled lines, square corners, no shadows, no gradients except the logo). CSS variables only, never hard-coded colours. All UI text in Norwegian bokmål.
- **Ideas parked for later:** `extra_features.md`.

## 4. Team rules that bite

- Stay in Erik's files (`web/`, `docs/DESIGN.md`). Lukas owns `api/` core, `docs/PROFILE.md`, `PLAN.md`, `AGENTS.md`; Sverre owns `data/scripts/`; Even owns `docs/TEXTS.md`, `docs/FACTS.md`, `docs/DEMO.md`. Need a change there? Tell Erik and suggest the message to send.
- Missing data is shown as missing ("Ikke tilgjengelig", grey `--unknown`), never faked, never green.
- Never commit `.env`, keys or data files. Commit the script that downloads data instead.
- Cross out finished items in `PLAN.md` only in Erik's role (`~~item~~`).
- Another agent (Claude) may work in the same folder: commit only your own files, never stash or reset other people's changes.
