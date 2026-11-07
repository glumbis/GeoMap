// Reported crime (anmeldte lovbrudd) per 1000 residents, by where it happened, as local as the sources allow:
// - Oslo: per bydel, from Oslo kommune's statistikkbank table KRI002 (latest year, counts) divided by bydel population
//   from the `oslo_bydeler` table. Compared with all of Oslo (same source) and with Norway (SSB).
// - Every municipality (incl. Oslo as a whole, used in Marka): SSB table 08487 (yearly average over the latest two
//   years, per 1000). Compared with Norway.
// Both keyless (SSB CC BY 4.0; Oslo kommune open data). Owner: Even. Needs `kommuner` and `oslo_bydeler`.
// One table `krim_omrader`, one row per area, `level` = 'bydel' | 'kommune'. The `crimeRate` and `violentCrime` data
// points in api/src/datapoints.ts use the bydel row when there is one (info only; Lukas may use them for Familie).
// Bydeler with under 5000 residents (Sentrum) get counts but no per-1000 number: it would be meaningless.
// Values the sources hide stay NULL, never 0.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const TYPES = ["total", "violence", "theft", "drugs"] as const;
type Type = (typeof TYPES)[number];
const MIN_POPULATION = 5000;
const per1000 = (count: number | null, pop: number) => (count == null || !pop ? null : Math.round((10000 * count) / pop) / 10);

type Row = Record<string, unknown>;
const rows: Row[] = [];

// ---- Every municipality: SSB 08487 ------------------------------------------------------------
const SSB_TYPES: Record<string, Type> = {
  "1AAAAA-9ZZZZz": "total", "4AAAAA-4ZZZZz": "violence", "1AAAAA-1ZZZZz": "theft", "6AAAAA-6ZZZZz": "drugs",
};
const kommuner = (await query<{ kommunenummer: string }>("SELECT kommunenummer FROM kommuner ORDER BY 1")).map((r) => r.kommunenummer);
if (!kommuner.length) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const res = await fetch("https://data.ssb.no/api/v0/no/table/08487", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "GeoMap-hackathon" },
  body: JSON.stringify({
    query: [
      { code: "Gjerningssted", selection: { filter: "item", values: ["0", ...kommuner] } }, // "0" = Hele landet
      { code: "LovbruddKrim", selection: { filter: "item", values: Object.keys(SSB_TYPES) } },
      { code: "ContentsCode", selection: { filter: "item", values: ["AnmLovbrPer1000"] } },
      { code: "Tid", selection: { filter: "top", values: ["1"] } },
    ],
    response: { format: "json-stat2" },
  }),
});
if (!res.ok) throw new Error(`SSB 08487: ${res.status} ${await res.text()}`);
const js = await res.json();
await writeFile(rawPath("ssb_08487.json"), JSON.stringify(js));

const ssb = new Map<string, number | null>(); // "<region>|<type>" -> per 1000
let ssbPeriod = "";
cells(js.id, js.size, js.dimension, js.value, (dims, value) => {
  ssbPeriod = dims.Tid.replace("-", "–");
  ssb.set(`${dims.Gjerningssted}|${SSB_TYPES[dims.LovbruddKrim]}`, value);
});
for (const k of kommuner) {
  const row: Row = { level: "kommune", areaId: k, kommunenummer: k, period: ssbPeriod };
  for (const t of TYPES) {
    row[`${t}Per1000`] = ssb.get(`${k}|${t}`) ?? null;
    row[`${t}Per1000Norway`] = ssb.get(`0|${t}`) ?? null;
  }
  rows.push(row);
}

// ---- Oslo per bydel: Oslo kommune KRI002 -----------------------------------------------------
// The "år" variable can't be sent in a query (the server rejects it), so ask for all years and keep the last.
const OSLO_TYPES: Record<string, Type> = { "0": "total", "4": "violence", "1": "theft", "6": "drugs" };
const oslo = await fetch("https://statistikkbanken.oslo.kommune.no/statbank/api/v1/no/db1/Kriminalitet/KRI002.px", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "GeoMap-hackathon" },
  body: JSON.stringify({
    query: [
      { code: "gjerningssted", selection: { filter: "all", values: ["*"] } }, // left out = summed away by the server
      { code: "lovbruddsgruppe", selection: { filter: "item", values: Object.keys(OSLO_TYPES) } },
    ],
    response: { format: "json-stat" },
  }),
});
if (!oslo.ok) throw new Error(`Oslo KRI002: ${oslo.status} ${await oslo.text()}`);
const os = (await oslo.json()).dataset;
await writeFile(rawPath("oslo_kri002.json"), JSON.stringify(os));

const years = Object.values(os.dimension["år"].category.label as Record<string, string>);
const lastYear = years[years.length - 1];
const counts = new Map<string, number | null>(); // "<bydel label>|<type>" -> count in lastYear
cells(os.dimension.id, os.dimension.size, os.dimension, os.value, (dims, value, labels) => {
  if (labels["år"] !== lastYear) return;
  counts.set(`${labels.gjerningssted}|${OSLO_TYPES[dims.lovbruddsgruppe]}`, value);
});

const bydeler = await query<{ id: string; name: string; population: number }>("SELECT id, name, population FROM oslo_bydeler");
if (!bydeler.length) throw new Error("oslo_bydeler table is empty. Run: npm run ingest oslo_bydeler");
const osloPop = bydeler.reduce((s, b) => s + b.population, 0);
// KRI002 labels bydeler "01 Gamle Oslo"; oslo_bydeler ids are "030101".
for (const b of bydeler) {
  const label = `${b.id.slice(4)} ${b.name}`;
  if (![...counts.keys()].some((k) => k.startsWith(`${label}|`))) continue; // Marka: no crime numbers of its own
  const row: Row = { level: "bydel", areaId: b.id, kommunenummer: "0301", period: lastYear, population: b.population };
  for (const t of TYPES) {
    const count = counts.get(`${label}|${t}`) ?? null;
    row[`${t}Count`] = count;
    row[`${t}Per1000`] = b.population >= MIN_POPULATION ? per1000(count, b.population) : null;
    row[`${t}Per1000Oslo`] = per1000(counts.get(`Gjerningssted i Oslo i alt|${t}`) ?? null, osloPop);
    row[`${t}Per1000Norway`] = ssb.get(`0|${t}`) ?? null; // SSB two-year average: close enough to compare
  }
  rows.push(row);
}

const file = rawPath("krim_omrader.json");
await writeFile(file, JSON.stringify(rows));
await conn.run(`
  CREATE OR REPLACE TABLE krim_omrader AS
  WITH r AS (SELECT * FROM read_json_auto('${file}', union_by_name := true))
  SELECT coalesce(b.name || ' bydel', k.name) AS name, r.*,
    CASE r.level WHEN 'bydel' THEN 'Oslo kommune' ELSE 'SSB' END AS source,
    coalesce(b.geom, k.geom) AS geom
  FROM r
  LEFT JOIN oslo_bydeler b ON r.level = 'bydel' AND b.id = r.areaId
  LEFT JOIN kommuner k ON r.level = 'kommune' AND k.kommunenummer = r.areaId
`);
await conn.run("DROP TABLE IF EXISTS krim_kommuner"); // replaced by krim_omrader

const check = await query<{ name: string; totalPer1000: number; violencePer1000: number }>(
  "SELECT name, totalPer1000, violencePer1000 FROM krim_omrader WHERE level = 'bydel' ORDER BY totalPer1000 DESC NULLS LAST",
);
console.log(`krim_omrader: ${kommuner.length} kommuner (${ssbPeriod}), ${check.length} Oslo bydeler (${lastYear}): ${check.map((c) => `${c.name} ${c.totalPer1000 ?? "-"}/${c.violencePer1000 ?? "-"}`).join(", ")}`);

/** Walk a json-stat value array in row-major order; calls fn with each cell's codes and labels. */
function cells(
  ids: string[], size: number[], dimension: Record<string, any>, values: (number | null)[],
  fn: (dims: Record<string, string>, value: number | null, labels: Record<string, string>) => void,
) {
  const keys = ids.map((id) => {
    const index = dimension[id].category.index as Record<string, number>;
    return Object.keys(index).sort((a, b) => index[a] - index[b]);
  });
  values.forEach((value, flat) => {
    const dims: Record<string, string> = {};
    const labels: Record<string, string> = {};
    let rest = flat;
    for (let d = ids.length - 1; d >= 0; d--) {
      const code = keys[d][rest % size[d]];
      dims[ids[d]] = code;
      labels[ids[d]] = dimension[ids[d]].category.label?.[code] ?? code;
      rest = Math.floor(rest / size[d]);
    }
    fn(dims, value, labels);
  });
}
