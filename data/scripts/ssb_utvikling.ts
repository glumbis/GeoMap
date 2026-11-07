// Where the municipality is heading, per kommune in Oslo + Akershus (SSB, CC BY 4.0, keyless). Owner: Even.
// Needs the `kommuner` table. One table, `kommune_utvikling`, from four SSB tables:
//   14288 population projection (main alternative MMMM): population now and in 10 years
//   05940 housing starts (igangsettingstillatelser boliger), last 2 years (Akershus got new kommune numbers in 2024,
//         so older years are 0 under the new numbers)
//   14891 households by tenure (selveier / andels- eller aksjeeier / leier), latest year, percent
//   12005 GP lists (KOSTRA): share of patients on a list without a doctor, open lists, latest year
// Data points in api/src/datapoints.ts: populationGrowth, housingStarts, tenure, gpCapacity (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const kommuner = (await query<{ kommunenummer: string }>("SELECT kommunenummer FROM kommuner")).map((r) => r.kommunenummer);
if (!kommuner.length) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

type Sel = { code: string; selection: { filter: string; values: string[] } };
/** Rows of { region, <dimension codes>, value } from one SSB table (json-stat2 walked flat). Left-out variables are summed by SSB. */
async function ssb(table: string, query: Sel[]): Promise<Record<string, string | number | null>[]> {
  const res = await fetch(`https://data.ssb.no/api/v0/no/table/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "GeoMap-hackathon" },
    body: JSON.stringify({ query, response: { format: "json-stat2" } }),
  });
  if (!res.ok) throw new Error(`SSB ${table}: ${res.status} ${await res.text()}`);
  const js = await res.json();
  const keys: string[][] = js.id.map((id: string) => {
    const index = js.dimension[id].category.index as Record<string, number>;
    return Object.keys(index).sort((a, b) => index[a] - index[b]);
  });
  return js.value.map((value: number | null, flat: number) => {
    const row: Record<string, string | number | null> = { value };
    let rest = flat;
    for (let d = js.id.length - 1; d >= 0; d--) {
      row[js.id[d]] = keys[d][rest % js.size[d]];
      rest = Math.floor(rest / js.size[d]);
    }
    return row;
  });
}
const item = (code: string, values: string[]): Sel => ({ code, selection: { filter: "item", values } });
const top = (code: string, n: number): Sel => ({ code, selection: { filter: "top", values: [String(n)] } });

const out = new Map<string, Record<string, unknown>>(kommuner.map((k) => [k, { kommunenummer: k }]));
const set = (k: unknown, field: string, v: unknown) => out.get(String(k)) && (out.get(String(k))![field] = v);

// Population projection: this year and +10.
const now = new Date().getFullYear();
const proj = await ssb("14288", [item("Region", kommuner), item("ContentsCode", ["Personer"]), item("Tid", [String(now), String(now + 10)])]);
for (const r of proj) set(r.Region, Number(r.Tid) === now ? "popNow" : "popIn10", r.value);
for (const v of out.values()) { v.popYear = now; v.popYearIn10 = now + 10; }

// Housing starts: last 2 years, all building types.
const starts = await ssb("05940", [item("Region", kommuner), item("ContentsCode", ["Igangsatte"]), top("Tid", 2)]);
const startYears = [...new Set(starts.map((r) => Number(r.Tid)))].sort();
for (const k of kommuner) {
  const rows = starts.filter((r) => r.Region === k && r.value != null);
  if (rows.length === startYears.length) set(k, "housingStartsPerYear", Math.round(rows.reduce((a, r) => a + Number(r.value), 0) / rows.length));
  set(k, "housingStartsYears", `${startYears[0]}–${startYears[startYears.length - 1]}`);
}

// Tenure: percent of households, latest year.
const tenure = await ssb("14891", [item("Region", kommuner), item("EierStatus", ["1", "2", "3"]), item("ContentsCode", ["HusholdningProsent"]), top("Tid", 1)]);
const tenureField: Record<string, string> = { "1": "ownerPct", "2": "cooperativePct", "3": "renterPct" };
for (const r of tenure) { set(r.Region, tenureField[String(r.EierStatus)], r.value); set(r.Region, "tenureYear", Number(r.Tid)); }

// GP lists (KOSTRA): share of patients on lists without a doctor, open lists. Latest year with a value.
const gp = await ssb("12005", [item("KOKkommuneregion0000", kommuner), item("ContentsCode", ["KOSandelpasiente0000", "KOSaapnelister0000"]), top("Tid", 2)]);
for (const k of kommuner) {
  for (const [code, field] of [["KOSandelpasiente0000", "gpNoDoctorPct"], ["KOSaapnelister0000", "gpOpenLists"]]) {
    const best = gp.filter((r) => r.KOKkommuneregion0000 === k && r.ContentsCode === code && r.value != null).sort((a, b) => Number(b.Tid) - Number(a.Tid))[0];
    if (best) { set(k, field, best.value); set(k, "gpYear", Number(best.Tid)); }
  }
}

const file = rawPath("kommune_utvikling.json");
await writeFile(file, JSON.stringify([...out.values()]));
await conn.run(`
  CREATE OR REPLACE TABLE kommune_utvikling AS
  SELECT k.name, u.*, 'SSB' AS source, k.geom
  FROM read_json('${file}', columns = {
    kommunenummer: 'VARCHAR', popNow: 'INTEGER', popIn10: 'INTEGER', popYear: 'INTEGER', popYearIn10: 'INTEGER',
    housingStartsPerYear: 'INTEGER', housingStartsYears: 'VARCHAR',
    ownerPct: 'DOUBLE', cooperativePct: 'DOUBLE', renterPct: 'DOUBLE', tenureYear: 'INTEGER',
    gpNoDoctorPct: 'DOUBLE', gpOpenLists: 'INTEGER', gpYear: 'INTEGER'
  }) u
  JOIN kommuner k USING (kommunenummer)
`);
const rows = await query<{ name: string; popNow: number; popIn10: number; housingStartsPerYear: number; renterPct: number; gpNoDoctorPct: number }>(
  "SELECT name, popNow, popIn10, housingStartsPerYear, renterPct, gpNoDoctorPct FROM kommune_utvikling ORDER BY popNow DESC LIMIT 3",
);
console.log(`kommune_utvikling: ${rows.map((r) => `${r.name} ${r.popNow}→${r.popIn10}, ${r.housingStartsPerYear}/år, leier ${r.renterPct} %, uten lege ${r.gpNoDoctorPct} %`).join(" | ")}`);
