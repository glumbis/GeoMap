// Regression checks for the 5 test addresses in docs/TEST_ADDRESSES.md, against the running API.
// Needs `npm run dev` (DuckDB lets only one process open the database, so this goes over HTTP).
// Run: npm run test:addresses   (API_URL overrides http://localhost:3000/api)
// When data or rules change on purpose, update the expectations here together with docs/TEST_ADDRESSES.md.
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

const API = process.env.API_URL ?? "http://localhost:3000/api";

interface DataPoint { id: string; value: unknown; effect: string; warning?: { severity: string } }
interface Profile {
  rating: { status: string; score?: number; cappedBy?: { dataPointId: string }[] };
  warnings: { dataPointId: string; severity: string }[];
  categories: { dataPoints: DataPoint[]; missing: { id: string; importance: string }[] }[];
  perspectives: { id: string; rating: { status: string; score?: number; cappedBy?: unknown[]; factors: { dataPointId: string }[] } }[];
}
interface Summary { facts: { text: string; rank: number; severity?: string; dataPointId?: string }[] }

const ADDRESSES = {
  quickClay: "0301-10223-22", // #1 Arendalsgata 22
  flood: "3224-8900-148", //     #2 Nedre Rælingsveg 148
  noisyRoad: "3201-1101-207", // #3 Gamle Drammensvei 207
  quiet: "3201-1574-17", //      #4 Grevlingåsen 17
  ski: "0301-13070-196", //      #5 Holmenkollveien 196
};
type Key = keyof typeof ADDRESSES;

const profiles = {} as Record<Key, Profile>;
const summaries = {} as Record<Key, Summary>;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  assert.equal(res.status, 200, `${path} answered ${res.status}`);
  return res.json() as Promise<T>;
}

const points = (p: Profile) => p.categories.flatMap((c) => c.dataPoints);
const warned = (p: Profile) => new Set(p.warnings.map((w) => w.dataPointId));
const score = (k: Key) => profiles[k].rating.score!;

before(async () => {
  try {
    await fetch(`${API}/health`);
  } catch {
    throw new Error(`No API at ${API}. Start it with \`npm run dev\` first.`);
  }
  for (const [key, id] of Object.entries(ADDRESSES) as [Key, string][]) {
    profiles[key] = await get<Profile>(`/address/${id}/profile`);
    summaries[key] = await get<Summary>(`/address/${id}/summary`);
  }
});

describe("hazards are found where they are, and only there", () => {
  test("#1 is in a quick clay zone with faregrad høy, and that caps the score first", () => {
    const qc = points(profiles.quickClay).find((d) => d.id === "quickClay");
    assert.equal(qc?.value, "høy");
    assert.equal(qc?.warning?.severity, "high");
    assert.equal(profiles.quickClay.rating.cappedBy?.[0].dataPointId, "quickClay");
  });

  test("#2 is in a 200-year flood zone (medium) and a red road noise zone", () => {
    const flood = points(profiles.flood).find((d) => d.id === "flood200");
    assert.equal(flood?.value, 200);
    assert.equal(flood?.warning?.severity, "medium");
    assert.ok(warned(profiles.flood).has("roadNoise"));
  });

  test("#3 has a red road noise zone and no quick clay or flood warning", () => {
    const w = warned(profiles.noisyRoad);
    assert.ok(w.has("roadNoise"));
    assert.ok(!w.has("quickClay") && !w.has("flood200"));
  });

  test("#4 and #5 have no quick clay, flood or road noise warning", () => {
    for (const k of ["quiet", "ski"] as const) {
      const w = warned(profiles[k]);
      for (const id of ["quickClay", "flood200", "roadNoise", "roadNoiseStrategic"]) assert.ok(!w.has(id), `${k}: ${id}`);
    }
  });
});

describe("scores", () => {
  test("every test address can be rated", () => {
    for (const k of Object.keys(ADDRESSES) as Key[]) assert.equal(profiles[k].rating.status, "ok", k);
  });

  test("#1 (quick clay) scores clearly worse than every other address", () => {
    for (const k of ["flood", "noisyRoad", "quiet", "ski"] as const) assert.ok(score("quickClay") + 20 <= score(k), k);
  });

  test("#4 (quiet suburb) scores better than the flood and noisy-road addresses", () => {
    assert.ok(score("quiet") > score("flood"));
    assert.ok(score("quiet") > score("noisyRoad"));
  });

  test("a capped score lists every serious warning", () => {
    for (const k of Object.keys(ADDRESSES) as Key[]) {
      const serious = profiles[k].warnings.filter((w) => w.severity !== "low").map((w) => w.dataPointId).sort();
      const capped = (profiles[k].rating.cappedBy ?? []).map((c) => c.dataPointId).sort();
      if (capped.length) assert.deepEqual(capped, serious, k);
    }
  });
});

describe("perspectives", () => {
  const persp = (k: Key, id: string) => profiles[k].perspectives.find((p) => p.id === id)!.rating;

  test("every test address gets all four perspective scores", () => {
    for (const k of Object.keys(ADDRESSES) as Key[]) {
      assert.deepEqual(profiles[k].perspectives.map((p) => p.id), ["living", "building", "family", "commuter"], k);
      for (const p of profiles[k].perspectives) assert.equal(p.rating.status, "ok", `${k} ${p.id}`);
    }
  });

  test("#1 (quick clay) is the worst place to build, and quick clay is its biggest factor", () => {
    for (const k of ["flood", "noisyRoad", "quiet", "ski"] as const) assert.ok(persp("quickClay", "building").score! + 20 <= persp(k, "building").score!, k);
    assert.equal(persp("quickClay", "building").factors[0].dataPointId, "quickClay");
  });

  test("Pendler follows transit only: no hazard caps it", () => {
    for (const k of Object.keys(ADDRESSES) as Key[]) assert.equal(persp(k, "commuter").cappedBy, undefined, k);
  });
});

describe("no faked data", () => {
  test("'not mapped here' is never shown as good", () => {
    for (const k of Object.keys(ADDRESSES) as Key[]) {
      for (const d of points(profiles[k])) {
        if (d.value === "ikkeKartlagt") assert.equal(d.effect, "neutral", `${k}: ${d.id}`);
      }
    }
  });
});

describe("summary facts", () => {
  test("every warning has a fact sentence, ranked above everything that is not a warning", () => {
    for (const k of Object.keys(ADDRESSES) as Key[]) {
      const facts = summaries[k].facts;
      for (const w of profiles[k].warnings) {
        const f = facts.find((x) => x.dataPointId === w.dataPointId);
        assert.ok(f, `${k}: no fact for warning ${w.dataPointId}`);
        assert.ok(f.rank <= 3, `${k}: ${w.dataPointId} has rank ${f.rank}`);
      }
      const ranks = facts.map((f) => f.rank);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${k}: facts not sorted by rank`);
    }
  });

  test("#1 facts start with the quick clay sentence", () => {
    assert.match(summaries.quickClay.facts[0].text, /faresone for kvikkleireskred med høy faregrad/);
  });

  test("hazards we did not find are never stated as found", () => {
    for (const k of ["quiet", "ski"] as const) {
      const text = summaries[k].facts.map((f) => f.text).join(" ");
      assert.doesNotMatch(text, /ligger i en faresone for kvikkleireskred|ligger i en flomsone|støysone fra vei, med/, k);
    }
  });
});
