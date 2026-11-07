// Average price per m² for owner-occupied homes (selveierboliger) per municipality, by house type.
// SSB Statistikkbanken table 06035 (CC BY 4.0, keyless), latest year. Owner: Even. Needs the `kommuner` table.
// SSB hides prices with too few sales: those stay NULL. Matches the `housePrice` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const API = "https://data.ssb.no/api/v0/no/table/06035";
const kommuner = (await query<{ kommunenummer: string }>("SELECT kommunenummer FROM kommuner")).map((r) => r.kommunenummer);
if (!kommuner.length) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const meta = await (await fetch(API, { headers: { "User-Agent": "GeoMap-hackathon" } })).json();
const regions: string[] = meta.variables.find((v: any) => v.code === "Region").values.filter((c: string) => kommuner.includes(c));

const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "GeoMap-hackathon" },
  body: JSON.stringify({
    query: [
      { code: "Region", selection: { filter: "item", values: regions } },
      { code: "Boligtype", selection: { filter: "item", values: ["01", "02", "03"] } }, // enebolig, småhus, blokk
      { code: "ContentsCode", selection: { filter: "item", values: ["KvPris", "Omsetninger"] } },
      { code: "Tid", selection: { filter: "top", values: ["1"] } },
    ],
    response: { format: "json-stat2" },
  }),
});
if (!res.ok) throw new Error(`SSB 06035: ${res.status} ${await res.text()}`);
const js = await res.json();

// Walk the flat value array in row-major order over js.id / js.size.
const keys: string[][] = js.id.map((id: string) => {
  const index = js.dimension[id].category.index as Record<string, number>;
  return Object.keys(index).sort((a, b) => index[a] - index[b]);
});
const type: Record<string, string> = { "01": "enebolig", "02": "smahus", "03": "blokk" };
const byKommune = new Map<string, Record<string, unknown>>();
js.value.forEach((value: number | null, flat: number) => {
  const dims: Record<string, string> = {};
  let rest = flat;
  for (let d = js.id.length - 1; d >= 0; d--) {
    dims[js.id[d]] = keys[d][rest % js.size[d]];
    rest = Math.floor(rest / js.size[d]);
  }
  const row = byKommune.get(dims.Region) ?? { kommunenummer: dims.Region, year: Number(dims.Tid) };
  row[`${type[dims.Boligtype]}${dims.ContentsCode === "KvPris" ? "PricePerM2" : "Sales"}`] = value;
  byKommune.set(dims.Region, row);
});
const file = rawPath("boligpriser.json");
await writeFile(file, JSON.stringify([...byKommune.values()]));

await conn.run(`
  CREATE OR REPLACE TABLE boligpriser AS
  SELECT k.name, b.kommunenummer, b.year,
    b.eneboligPricePerM2::INTEGER AS eneboligPricePerM2, b.smahusPricePerM2::INTEGER AS smahusPricePerM2,
    b.blokkPricePerM2::INTEGER AS blokkPricePerM2,
    b.eneboligSales::INTEGER AS eneboligSales, b.smahusSales::INTEGER AS smahusSales, b.blokkSales::INTEGER AS blokkSales,
    'SSB' AS source, k.geom
  FROM read_json('${file}', columns = {
    kommunenummer: 'VARCHAR', year: 'INTEGER',
    eneboligPricePerM2: 'DOUBLE', smahusPricePerM2: 'DOUBLE', blokkPricePerM2: 'DOUBLE',
    eneboligSales: 'DOUBLE', smahusSales: 'DOUBLE', blokkSales: 'DOUBLE'
  }) b
  JOIN kommuner k USING (kommunenummer)
`);
const [c] = await query<{ n: number; blokk: number; enebolig: number; year: number }>(
  "SELECT count(*)::INTEGER AS n, count(blokkPricePerM2)::INTEGER AS blokk, count(eneboligPricePerM2)::INTEGER AS enebolig, max(year) AS year FROM boligpriser",
);
console.log(`boligpriser: ${c.n} kommuner, ${c.year} (${c.enebolig} with enebolig price, ${c.blokk} with blokk price)`);
