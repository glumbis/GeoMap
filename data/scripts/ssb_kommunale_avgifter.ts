// The yearly cost of owning a home that the municipality sets: fees for water, sewage, waste and chimney sweeping
// (SSB KOSTRA table 12842) and property tax on homes (SSB KOSTRA table 14674). CC BY 4.0, keyless. Owner: Even.
// Needs the `kommuner` table. Each value is the latest year SSB has for that municipality (SSB fills in tax details late).
// Matches the `municipalFees` and `propertyTax` data points in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const kommuner = (await query<{ kommunenummer: string }>("SELECT kommunenummer FROM kommuner")).map((r) => r.kommunenummer);
if (!kommuner.length) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

/** { kommunenummer: { code: [value, year] } } with the latest non-empty year per code, from a KOSTRA table. */
async function kostra(table: number, codes: string[]): Promise<Record<string, Record<string, [number, number]>>> {
  const res = await fetch(`https://data.ssb.no/api/v0/no/table/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "GeoMap-hackathon" },
    body: JSON.stringify({
      query: [
        { code: "KOKkommuneregion0000", selection: { filter: "item", values: kommuner } },
        { code: "ContentsCode", selection: { filter: "item", values: codes } },
        { code: "Tid", selection: { filter: "top", values: ["3"] } },
      ],
      response: { format: "json-stat2" },
    }),
  });
  if (!res.ok) throw new Error(`SSB ${table}: ${res.status} ${await res.text()}`);
  const js = await res.json();
  const keys: string[][] = js.id.map((id: string) => {
    const index = js.dimension[id].category.index as Record<string, number>;
    return Object.keys(index).sort((a, b) => index[a] - index[b]);
  });
  const out: Record<string, Record<string, [number, number]>> = {};
  js.value.forEach((value: number | null, flat: number) => {
    if (value == null) return;
    const dims: Record<string, string> = {};
    let rest = flat;
    for (let d = js.id.length - 1; d >= 0; d--) {
      dims[js.id[d]] = keys[d][rest % js.size[d]];
      rest = Math.floor(rest / js.size[d]);
    }
    const k = (out[dims.KOKkommuneregion0000] ??= {});
    const year = Number(dims.Tid);
    if (!k[dims.ContentsCode] || k[dims.ContentsCode][1] < year) k[dims.ContentsCode] = [value, year];
  });
  return out;
}

const fees = await kostra(12842, ["KOSaarsgebyrvann0000", "KOSaarsgebyravlo0000", "KOSaarsgebyravfa0000", "KOSfeiingtilsyn0000"]);
const tax = await kostra(14674, ["KOShareskatt0000", "KOShelekommunen0000", "KOShelekommunenu0000", "KOSbyallnaering0000", "KOSbyverkogbruk0000",
  "KOSbareby0000", "KOSgenskatt0000", "KOSdiffskatt0000", "KOSharbunnfradra0000", "KOSbunnfradrag0000", "KOSgjsnittskattb0000"]);

const rows = kommuner.map((nr) => {
  const f = fees[nr] ?? {};
  const t = tax[nr] ?? {};
  const v = (o: Record<string, [number, number]>, code: string) => o[code]?.[0] ?? null;
  const parts = ["KOSaarsgebyrvann0000", "KOSaarsgebyravlo0000", "KOSaarsgebyravfa0000"].map((c) => v(f, c));
  // Homes are taxed when the municipality taxes the whole municipality or its built-up (byvis) areas.
  const homeCodes = ["KOShelekommunen0000", "KOShelekommunenu0000", "KOSbyallnaering0000", "KOSbyverkogbruk0000", "KOSbareby0000"];
  const hasTax = v(t, "KOShareskatt0000");
  const homesTaxed = hasTax == null ? null : hasTax === 1 && homeCodes.some((c) => v(t, c) === 1);
  return {
    kommunenummer: nr,
    waterFee: parts[0], sewageFee: parts[1], wasteFee: parts[2], sweepingFee: v(f, "KOSfeiingtilsyn0000"),
    // Sum only when all three main fees are known: a partial sum would look cheaper than it is.
    feesTotal: parts.every((p) => p != null) ? parts.reduce((a, b) => a! + b!, 0) : null,
    feesYear: f.KOSaarsgebyrvann0000?.[1] ?? null,
    homesTaxed,
    taxRatePerMille: homesTaxed ? (v(t, "KOSdiffskatt0000") ?? v(t, "KOSgenskatt0000")) : null,
    taxDeduction: homesTaxed && v(t, "KOSharbunnfradra0000") === 1 ? v(t, "KOSbunnfradrag0000") : null,
    taxAverage: homesTaxed ? v(t, "KOSgjsnittskattb0000") : null,
    taxAverageYear: homesTaxed ? (t.KOSgjsnittskattb0000?.[1] ?? null) : null,
    taxYear: t.KOShareskatt0000?.[1] ?? null,
  };
});
const file = rawPath("kommunale_avgifter.json");
await writeFile(file, JSON.stringify(rows));

// One row per municipality. Fees are yearly, in kr, excluding VAT, for SSB's standard home (120 m² enebolig).
// homesTaxed NULL = SSB has no answer for this municipality. taxRatePerMille = rate for homes (differentiated if set).
await conn.run(`
  CREATE OR REPLACE TABLE kommunale_avgifter AS
  SELECT k.name, a.kommunenummer,
    a.waterFee::INTEGER AS waterFee, a.sewageFee::INTEGER AS sewageFee, a.wasteFee::INTEGER AS wasteFee,
    a.sweepingFee::INTEGER AS sweepingFee, a.feesTotal::INTEGER AS feesTotal, a.feesYear,
    a.homesTaxed, a.taxRatePerMille, a.taxDeduction::BIGINT AS taxDeduction, a.taxAverage::INTEGER AS taxAverage,
    a.taxAverageYear, a.taxYear, 'SSB' AS source, k.geom
  FROM read_json('${file}', columns = {
    kommunenummer: 'VARCHAR', waterFee: 'DOUBLE', sewageFee: 'DOUBLE', wasteFee: 'DOUBLE', sweepingFee: 'DOUBLE',
    feesTotal: 'DOUBLE', feesYear: 'INTEGER', homesTaxed: 'BOOLEAN', taxRatePerMille: 'DOUBLE', taxDeduction: 'DOUBLE',
    taxAverage: 'DOUBLE', taxAverageYear: 'INTEGER', taxYear: 'INTEGER'
  }) a
  JOIN kommuner k USING (kommunenummer)
`);
const [c] = await query<{ n: number; fees: number; taxed: number; untaxed: number }>(`
  SELECT count(*)::INTEGER AS n, count(feesTotal)::INTEGER AS fees,
    count(*) FILTER (WHERE homesTaxed)::INTEGER AS taxed, count(*) FILTER (WHERE NOT homesTaxed)::INTEGER AS untaxed
  FROM kommunale_avgifter`);
console.log(`kommunale_avgifter: ${c.n} kommuner, ${c.fees} with all fees, property tax on homes in ${c.taxed}, none in ${c.untaxed}`);
