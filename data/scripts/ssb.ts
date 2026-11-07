// Municipal stats for Oslo + Akershus from SSB Statistikkbanken (CC BY 4.0), one row per municipality.
// Owner: Even. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Every table is asked for its latest year, and the year is stored next to each number.
// Values SSB hides or lacks stay NULL (never 0), so the profile can list them as missing.
// Tables (all use the 2024 municipality numbers, e.g. Bærum 3201):
//   11342 population, area, density   07459 population by age   06944 household income
//   06265 dwellings by building type  09429 education level (16+)
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const API = "https://data.ssb.no/api/v0/no/table";

const kommuner = (await query<{ kommunenummer: string }>("SELECT kommunenummer FROM kommuner ORDER BY 1")).map(
  (r) => r.kommunenummer,
);
if (!kommuner.length) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

type Cell = { region: string; year: string; dims: Record<string, string>; value: number | null };

/** POST a JSON-stat2 query for the latest year; returns one cell per value. */
async function ssb(table: string, filters: Record<string, string[] | "all">): Promise<Cell[]> {
  const q = [
    { code: "Region", selection: { filter: "item", values: kommuner } },
    ...Object.entries(filters).map(([code, values]) =>
      values === "all"
        ? { code, selection: { filter: "all", values: ["*"] } }
        : { code, selection: { filter: "item", values } },
    ),
    { code: "Tid", selection: { filter: "top", values: ["1"] } },
  ];
  const res = await fetch(`${API}/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "GeoMap-hackathon" },
    body: JSON.stringify({ query: q, response: { format: "json-stat2" } }),
  });
  if (!res.ok) throw new Error(`SSB ${table}: ${res.status} ${await res.text()}`);
  const js = await res.json();
  await writeFile(rawPath(`ssb_${table}.json`), JSON.stringify(js));

  // Walk the flat value array in row-major order over js.id / js.size.
  const keys = js.id.map((id: string) => {
    const index = js.dimension[id].category.index as Record<string, number>;
    return Object.keys(index).sort((a, b) => index[a] - index[b]);
  });
  const cells: Cell[] = [];
  js.value.forEach((value: number | null, flat: number) => {
    const dims: Record<string, string> = {};
    let rest = flat;
    for (let d = js.id.length - 1; d >= 0; d--) {
      dims[js.id[d]] = keys[d][rest % js.size[d]];
      rest = Math.floor(rest / js.size[d]);
    }
    cells.push({ region: dims.Region, year: dims.Tid, dims, value });
  });
  return cells;
}

const rows = new Map<string, Record<string, number | string | null>>(kommuner.map((k) => [k, { kommunenummer: k }]));
const set = (k: string, field: string, value: number | null, year: string) => {
  const row = rows.get(k)!;
  row[field] = value;
  row[`${field.replace(/[A-Z].*$/, "")}Year`] ??= Number(year);
};
const sum = (cells: Cell[]) => (cells.some((c) => c.value === null) ? null : cells.reduce((s, c) => s + c.value!, 0));
const pct = (part: number | null, total: number | null) =>
  part === null || !total ? null : Math.round((1000 * part) / total) / 10;
const byRegion = (cells: Cell[]) => {
  const groups = new Map<string, Cell[]>();
  for (const c of cells) groups.set(c.region, [...(groups.get(c.region) ?? []), c]);
  return groups;
};

// Population, area, density
for (const [k, cells] of byRegion(await ssb("11342", { ContentsCode: ["Folkemengde", "LandArealKm2", "FolkeLandArealKm2"] }))) {
  const get = (code: string) => cells.find((c) => c.dims.ContentsCode === code)!;
  set(k, "population", get("Folkemengde").value, get("Folkemengde").year);
  set(k, "populationLandAreaKm2", get("LandArealKm2").value, get("Folkemengde").year);
  set(k, "populationPerKm2", get("FolkeLandArealKm2").value, get("Folkemengde").year);
}

// Age groups (both sexes, all single ages summed)
for (const [k, cells] of byRegion(await ssb("07459", { Kjonn: "all", Alder: "all", ContentsCode: ["Personer1"] }))) {
  const age = (c: Cell) => parseInt(c.dims.Alder, 10);
  const total = sum(cells);
  const year = cells[0].year;
  set(k, "agePct0to17", pct(sum(cells.filter((c) => age(c) <= 17)), total), year);
  set(k, "agePct18to66", pct(sum(cells.filter((c) => age(c) >= 18 && age(c) <= 66)), total), year);
  set(k, "agePct67plus", pct(sum(cells.filter((c) => age(c) >= 67)), total), year);
}

// Household income, all households
for (const [k, cells] of byRegion(
  await ssb("06944", { HusholdType: ["0000"], ContentsCode: ["InntSkatt", "AntallHushold"] }),
)) {
  const get = (code: string) => cells.find((c) => c.dims.ContentsCode === code)!;
  set(k, "incomeMedianAfterTax", get("InntSkatt").value, get("InntSkatt").year);
  set(k, "incomeHouseholds", get("AntallHushold").value, get("InntSkatt").year);
}

// Dwellings by building type
for (const [k, cells] of byRegion(await ssb("06265", { BygnType: "all", ContentsCode: ["Boliger"] }))) {
  const type = (t: string) => cells.find((c) => c.dims.BygnType === t)!.value;
  const total = sum(cells);
  const year = cells[0].year;
  set(k, "housingDwellings", total, year);
  set(k, "housingPctDetached", pct(type("01"), total), year);
  set(k, "housingPctSemiDetached", pct(type("02"), total), year);
  set(k, "housingPctTerraced", pct(type("03"), total), year);
  set(k, "housingPctApartment", pct(type("04"), total), year);
}

// Education: share of people 16+ with a university or college degree (short + long)
for (const [k, cells] of byRegion(
  await ssb("09429", { Nivaa: ["03a", "04a"], Kjonn: ["0"], ContentsCode: ["PersonerProsent"] }),
)) {
  const s = sum(cells);
  set(k, "educationPctHigher", s === null ? null : Math.round(s * 10) / 10, cells[0].year);
}

const file = rawPath("ssb_kommuner.json");
await writeFile(file, JSON.stringify([...rows.values()]));

await conn.run(`
  CREATE OR REPLACE TABLE ssb_kommuner AS
  SELECT s.*, k.name, 'SSB' AS source, k.geom
  -- DOUBLE so the API returns numbers (DuckDB BIGINT comes out as text)
  FROM (SELECT kommunenummer::VARCHAR AS kommunenummer, COLUMNS(* EXCLUDE (kommunenummer))::DOUBLE
        FROM read_json_auto('${file}')) s
  JOIN kommuner k USING (kommunenummer)
`);
console.log(`ssb_kommuner: ${rows.size} rows`);
