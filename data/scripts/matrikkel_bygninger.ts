// Residential buildings in Oslo + Akershus from Matrikkelen - Bygningspunkt (Kartverket, CC BY 4.0, keyless).
// Owner: Even. Needs the `kommuner` table. County FGDB files in EPSG:25833, read straight from the zip.
// One point per building with its NS 3457 building type, and the number of units (bruksenheter) registered in it.
// Only dwellings (types 111–159): garages, sheds and commercial buildings are left out.
// Matches the `buildingType` data point in api/src/datapoints.ts (info only).
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

// NS 3457 building types for dwellings (Kartverket's code list), short Norwegian names.
const TYPES: Record<number, string> = {
  111: "Enebolig", 112: "Enebolig med hybel eller sokkelleilighet", 113: "Våningshus",
  121: "Tomannsbolig (vertikaldelt)", 122: "Tomannsbolig (horisontaldelt)", 123: "Våningshus, tomannsbolig", 124: "Våningshus, tomannsbolig",
  131: "Rekkehus", 133: "Kjedehus eller atriumhus", 135: "Terrassehus", 136: "Småhus med 3 boliger eller flere",
  141: "Boligblokk, 2 etasjer", 142: "Boligblokk, 3–4 etasjer", 143: "Boligblokk, 5 etasjer eller flere",
  144: "Sammenbygd boligbygg, 2 etasjer", 145: "Sammenbygd boligbygg, 3–4 etasjer", 146: "Sammenbygd boligbygg, 5 etasjer eller flere",
  151: "Bo- og servicesenter", 152: "Studentbolig", 159: "Bofellesskap",
};
const typeName = `CASE b.bygningstype ${Object.entries(TYPES).map(([k, v]) => `WHEN ${k} THEN '${v}'`).join(" ")} ELSE 'Boligbygg' END`;

const parts: string[] = [];
for (const county of ["03_Oslo", "32_Akershus"]) {
  const name = `Basisdata_${county}_25833_MatrikkelenBygning_FGDB`;
  const zip = await download(`https://nedlasting.geonorge.no/geonorge/Basisdata/MatrikkelenBygning/FGDB/${name}.zip`, `bygninger_${county}.zip`);
  const gdb = `/vsizip/${zip}/${name}.gdb`;
  parts.push(`
    SELECT b.bygningid AS id, b.bygningstype::INTEGER AS typeCode, ${typeName} AS typeName, b.bygningsstatus AS status,
      b.harkulturminne = 1 AS heritage, coalesce(u.units, 0)::INTEGER AS units, b.kommunenummer,
      ST_Transform(b.SHAPE, 'EPSG:25833', 'EPSG:4326', always_xy := true) AS geom
    FROM ST_Read('${gdb}', layer := 'bygning') b
    LEFT JOIN (SELECT bygningid, count(*) AS units FROM ST_Read('${gdb}', layer := 'bruksenhet') GROUP BY 1) u USING (bygningid)
    WHERE b.bygningstype BETWEEN 111 AND 159`);
}

// One row per dwelling building. units = registered units (bruksenheter: flats, plus any commercial units).
// status = Matrikkelen's building status code (e.g. 'FA' ferdigattest, 'TB' tatt i bruk, 'MB' midlertidig brukstillatelse).
await conn.run(`
  CREATE OR REPLACE TABLE bygninger AS
  SELECT id, typeName AS name, typeCode, typeName, status, heritage, units, kommunenummer, 'Kartverket' AS source, geom
  FROM (${parts.join(" UNION ALL ")})
  WHERE kommunenummer IN (SELECT kommunenummer FROM kommuner)
`);
const counts = await query<{ typeName: string; n: number }>(
  "SELECT typeName, count(*)::INTEGER AS n FROM bygninger GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
);
console.log(`bygninger: ${counts.map((c) => `${c.typeName} ${c.n}`).join(", ")}`);
