// Info texts (docs/TEXTS.md) and the "Når ..." rules in api/src/texts.ts. No database needed: `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DATA_POINTS, type Reading } from "../src/datapoints.ts";
import { INFO_TEXTS, OUTCOMES, infoText, parseTexts } from "../src/texts.ts";

test("every 'Når ...' text in docs/TEXTS.md has a rule, and every rule has a text", () => {
  for (const id of new Set([...INFO_TEXTS.keys(), ...Object.keys(OUTCOMES)])) {
    if (!DATA_POINTS.some((d) => d.id === id)) continue; // texts for data points not added yet
    const inDoc = [...(INFO_TEXTS.get(id)?.outcomes.keys() ?? [])].sort();
    const inCode = Object.keys(OUTCOMES[id] ?? {}).sort();
    assert.deepEqual(inCode, inDoc, `${id}: rules in texts.ts OUTCOMES must match the "Når" lines in docs/TEXTS.md`);
  }
});

test("every data point has a main text", () => {
  for (const dp of DATA_POINTS) {
    assert.ok(INFO_TEXTS.get(dp.id)?.main, `${dp.id} has no **Forklaring:** in docs/TEXTS.md`);
  }
});

test("infoText: main text, then only the matching outcome texts", () => {
  const texts = parseTexts([
    "### `radon` — Radon",
    "**Forklaring:** Hoved.",
    "- **Når høy eller meget høy aktsomhet:** Høy.",
    "- **Når lav aktsomhet:** Lav.",
    "- Ikke brukt.",
  ].join("\n"));
  const r = (value: string): Reading => ({ value, display: value, effect: "neutral" });
  assert.equal(infoText("radon", r("megetHøy"), texts), "Hoved. Høy.");
  assert.equal(infoText("radon", r("lav"), texts), "Hoved. Lav.");
  assert.equal(infoText("radon", r("middels"), texts), "Hoved.");
  assert.equal(infoText("unknown", r("lav"), texts), undefined);
});
