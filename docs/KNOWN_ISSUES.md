# Known issues

Problems we know about but haven't fixed yet. Add new ones under the right heading, with who found it, what happens, why, and an idea for a fix. Remove an entry when it is fixed.

## Performance

### Nabolagsscore layer is heavy (Kartlag → Område)
- **What happens:** at the whole-region view, `GET /api/grunnkrets_scores` returns about **6.5 MB** and takes about 1 s. The layer refetches on every map move (it uses the standard bbox layer in `hazards.ts`), so panning with it switched on downloads the same polygons again and again.
- **Why:** 2,082 grunnkrets polygons at full detail, all needed at zoom 8–10.
- **Ideas:** simplify the geometry when the table is built (`ST_SimplifyPreserveTopology` in `data/area-scores.ts`, Sverre), or in `api/src/geojson.ts` by zoom (Lukas); or fetch the layer once and keep it, since it is small enough to hold in the browser; or pre-build it as PMTiles.
- Found by: Erik (agent check after PR #10).

### "Score for området" grid layer and /finn results are large
- **What happens:** the 500 m grid (`/api/omradescore`, and `/api/finn` with loose criteria) is about **5.5 MB** for the whole region, also refetched on map moves.
- **Ideas:** same as above: simplify, cache in the browser, or return only the cell id + score and build the squares in the browser (they are regular 500 m squares).

### `npm run scores` takes about 25 minutes
- **What happens:** rating all 362,241 street addresses (`data/area-scores.ts`) takes ~1,450 s, and the dev server must be stopped the whole time (DuckDB allows one writer).
- **Ideas:** only re-rate when data or rules change; run it in CI/Docker builds rather than locally; `SCORES_LIMIT=20000` for quick local tests.

## Data and scores
- **Nesodden commuter score:** "Pendler" is 95–100 in ferry-dependent squares on Nesodden, which looks too generous for someone working in central Oslo. Check how ferry departures count in `api/src/perspectives.ts` (Lukas).
- **Free-text search on /finn untested:** `/api/finn/tolk` (Claude Haiku) has only been tested without `ANTHROPIC_API_KEY` (the text box is hidden then). Test with a key before the demo.

## Docs
- `docs/DESIGN.md` still says "laptop only, no media queries", but the app now has a phone layout (below 768px: map on top, panel below).
