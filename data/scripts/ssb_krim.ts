// Reported crime (anmeldte lovbrudd) per 1000 residents, by the municipality where it happened, from SSB
// Statistikkbanken table 08487 (CC BY 4.0, keyless). Owner: Even. Needs the `kommuner` table.
// SSB gives a yearly average over two years (latest e.g. "2024-2025"). Oslo is one municipality here: no bydel numbers.
// Matches the `crimeRate` and `violentCrime` data points in api/src/datapoints.ts (info only; Lukas may use them
// in the family perspective). Values SSB hides stay NULL, never 0.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const TABLE = "08487";
const TYPES: Record<string, string> = {
  "1AAAAA-9ZZZZz": "total", // Alle lovbruddsgrupper
  "4AAAAA-4ZZZZz": "violence", // Vold og mishandling
  "1AAAAA-1ZZZZz": "theft", // Eiendomstyveri
  "6AAAAA-6ZZZZz": "drugs", // Rusmiddellovbrudd
};

const kommuner = (await query<{ kommunenummer: string }>("SELECT kommunenummer FROM kommuner ORDER BY 1")).map((r) => r.kommunenummer);
if (!kommuner.length) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const res = await fetch(`https://data.ssb.no/api/v0/no/table/${TABLE}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "GeoMap-hackathon" },
  body: JSON.stringify({
    query: [
      { code: "Gjerningssted", selection: { filter: "item", values: ["0", ...kommuner] } }, // "0" = Hele landet
      { code: "LovbruddKrim", selection: { filter: "item", values: Object.keys(TYPES) } },
      { code: "ContentsCode", selection: { filter: "item", values: ["AnmLovbrPer1000"] } },
      { code: "Tid", selection: { filter: "top", values: ["1"] } },
    ],
    response: { format: "json-stat2" },
  }),
});
if (!res.ok) throw new Error(`SSB ${TABLE}: ${res.status} ${await res.text()}`);
const js = await res.json();
await writeFile(rawPath(`ssb_${TABLE}.json`), JSON.stringify(js));

// Walk the flat value array in row-major order over js.id / js.size.
const keys: string[][] = js.id.map((id: string) => {
  const index = js.dimension[id].category.index as Record<string, number>;
  return Object.keys(index).sort((a, b) => index[a] - index[b]);
});
const values = new Map<string, number | null>(); // "<region>|<type>" -> per 1000
let period = "";
js.value.forEach((value: number | null, flat: number) => {
  const dims: Record<string, string> = {};
  let rest = flat;
  for (let d = js.id.length - 1; d >= 0; d--) {
    dims[js.id[d]] = keys[d][rest % js.size[d]];
    rest = Math.floor(rest / js.size[d]);
  }
  period = dims.Tid;
  values.set(`${dims.Gjerningssted}|${TYPES[dims.LovbruddKrim]}`, value);
});

const get = (region: string, type: string) => values.get(`${region}|${type}`) ?? null;
const rows = kommuner.map((k) => {
  const row: Record<string, unknown> = { kommunenummer: k, period: period.replace("-", "–") };
  for (const t of Object.values(TYPES)) {
    row[`${t}Per1000`] = get(k, t);
    row[`${t}Per1000Norway`] = get("0", t);
  }
  return row;
});
const file = rawPath("ssb_krim.json");
await writeFile(file, JSON.stringify(rows));

await conn.run(`
  CREATE OR REPLACE TABLE krim_kommuner AS
  SELECT k.name, r.*, 'SSB' AS source, k.geom
  FROM read_json_auto('${file}') r JOIN kommuner k USING (kommunenummer)
`);
const check = await query<{ name: string; totalPer1000: number; violencePer1000: number }>(
  "SELECT name, totalPer1000, violencePer1000 FROM krim_kommuner ORDER BY totalPer1000 DESC NULLS LAST LIMIT 3",
);
console.log(`krim_kommuner: ${rows.length} municipalities, ${period}. Highest: ${check.map((c) => `${c.name} ${c.totalPer1000} (vold ${c.violencePer1000})`).join(", ")}. Norway: ${get("0", "total")}`);
