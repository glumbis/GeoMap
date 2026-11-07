// Median household income after tax for the smallest area SSB publishes it for: delområde (a group of grunnkretser,
// a few thousand people), Oslo bydel, and kommune. SSB Statistikkbanken table 06944 (CC BY 4.0, keyless), latest year.
// Owner: Even. Needs `kommuner`, `grunnkretser` (Sverre) and `oslo_bydeler` (scripts run in alphabetical order).
// Delområde polygons = the grunnkretser whose number starts with the delområde's first 6 digits (e.g. 03010100 = 030101xx).
// Matches the `areaIncome` data point in api/src/datapoints.ts (info only). Values SSB hides stay NULL.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const API = "https://data.ssb.no/api/v0/no/table/06944";
const kommuner = (await query<{ kommunenummer: string }>("SELECT kommunenummer FROM kommuner")).map((r) => r.kommunenummer);
if (!kommuner.length) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

// Every region code in our kommuner: "3201" (kommune), "32010100" (delområde), "030101a" (Oslo bydel).
const meta = await (await fetch(API, { headers: { "User-Agent": "GeoMap-hackathon" } })).json();
const regionVar = meta.variables.find((v: any) => v.code === "Region");
const names = new Map<string, string>(regionVar.values.map((c: string, i: number) => [c, regionVar.valueTexts[i]]));
const regions = regionVar.values.filter((c: string) => kommuner.some((k) => c.startsWith(k)));

const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "GeoMap-hackathon" },
  body: JSON.stringify({
    query: [
      { code: "Region", selection: { filter: "item", values: regions } },
      { code: "HusholdType", selection: { filter: "item", values: ["0000"] } }, // alle husholdninger
      { code: "ContentsCode", selection: { filter: "item", values: ["InntSkatt", "AntallHushold"] } },
      { code: "Tid", selection: { filter: "top", values: ["1"] } },
    ],
    response: { format: "json-stat2" },
  }),
});
if (!res.ok) throw new Error(`SSB 06944: ${res.status} ${await res.text()}`);
const js = await res.json();
await writeFile(rawPath("ssb_06944_omrader.json"), JSON.stringify(js));

// Walk the flat value array in row-major order over js.id / js.size.
const keys: string[][] = js.id.map((id: string) => {
  const index = js.dimension[id].category.index as Record<string, number>;
  return Object.keys(index).sort((a, b) => index[a] - index[b]);
});
const byRegion = new Map<string, Record<string, unknown>>();
js.value.forEach((value: number | null, flat: number) => {
  const dims: Record<string, string> = {};
  let rest = flat;
  for (let d = js.id.length - 1; d >= 0; d--) {
    dims[js.id[d]] = keys[d][rest % js.size[d]];
    rest = Math.floor(rest / js.size[d]);
  }
  const code = dims.Region;
  const level = /^\d{4}$/.test(code) ? "kommune" : /a$/.test(code) ? "bydel" : "delomrade";
  const row = byRegion.get(code) ?? {
    level, areaId: code, kommunenummer: code.slice(0, 4), year: Number(dims.Tid),
    name: String(names.get(code) ?? code).replace(" - Oslove", ""),
  };
  row[dims.ContentsCode === "InntSkatt" ? "medianAfterTax" : "households"] = value;
  byRegion.set(code, row);
});
const file = rawPath("inntekt_omrader.json");
await writeFile(file, JSON.stringify([...byRegion.values()]));

await conn.run(`
  CREATE OR REPLACE TABLE inntekt_omrader AS
  WITH r AS (SELECT * FROM read_json_auto('${file}')),
  delomrader AS (
    SELECT substr(lpad(id, 8, '0'), 1, 6) || '00' AS areaId, ST_Union_Agg(geom) AS geom
    FROM grunnkretser GROUP BY 1
  )
  SELECT r.name, r.level, r.areaId, r.kommunenummer, r.year, r.medianAfterTax::INTEGER AS medianAfterTax,
    r.households::INTEGER AS households, 'SSB' AS source,
    ST_MakeValid(coalesce(d.geom, b.geom, k.geom)) AS geom
  FROM r
  LEFT JOIN delomrader d ON r.level = 'delomrade' AND d.areaId = r.areaId
  LEFT JOIN oslo_bydeler b ON r.level = 'bydel' AND b.id || 'a' = r.areaId
  LEFT JOIN kommuner k ON r.level = 'kommune' AND k.kommunenummer = r.areaId
  WHERE coalesce(d.geom, b.geom, k.geom) IS NOT NULL
`);
const counts = await query<{ level: string; n: number; withValue: number; year: number }>(
  "SELECT level, count(*)::INTEGER AS n, count(medianAfterTax)::INTEGER AS withValue, max(year) AS year FROM inntekt_omrader GROUP BY 1 ORDER BY 1",
);
console.log(`inntekt_omrader: ${counts.map((c) => `${c.n} ${c.level} (${c.withValue} with a number)`).join(", ")}, ${counts[0]?.year}. ${regions.length} SSB regions asked for.`);
