// Land cover (Arealressurskart AR50) for Oslo + Akershus, from NIBIO (NLOD, credit "NIBIO"). Owner: Even.
// Needs the `kommuner` table. Coarse map (smallest area about 1.5 ha), FGDB per county in EPSG:4258 (≈ 4326 here).
// The zip URLs are what NIBIO's order API (kartkatalog.nibio.no/api/v2/order) hands out; they are static files.
// Matches the `nearestSea` data point in api/src/datapoints.ts (info only). How much nature is around an address is
// Lukas's `greenArea` (Kartverket N50, data/scripts/arealdekke.ts); all land types are kept here for later use.
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

// AR50 arealtype codes (NIBIO's AR50 specification).
const TYPES: Record<number, string> = {
  10: "Bebygd", 20: "Jordbruk", 30: "Skog", 50: "Åpen fastmark", 60: "Myr", 70: "Bre", 81: "Ferskvann", 82: "Hav", 99: "Ikke kartlagt",
};
const typeName = `CASE arealtype ${Object.entries(TYPES).map(([k, v]) => `WHEN ${k} THEN '${v}'`).join(" ")} ELSE 'Annet' END`;

const parts: string[] = [];
for (const county of ["03", "32"]) {
  const zip = await download(`https://kart8.nibio.no/uttak_Download/ar50/${county}_4258_ar50_gdb.zip`, `ar50_${county}.zip`);
  // EPSG:4258 is axis-ordered lat, lng; ST_FlipCoordinates puts it back to lng, lat if GDAL kept that order (checked below).
  parts.push(`SELECT arealtype::INTEGER AS typeCode, geo AS geom FROM ST_Read('/vsizip/${zip}/${county}_4258_ar50_gdb.gdb', layer := 'ar50')`);
}

// One row per AR50 polygon. typeName: Bebygd, Jordbruk, Skog, Åpen fastmark, Myr, Ferskvann, Hav, ...
await conn.run(`
  CREATE OR REPLACE TABLE arealtyper AS
  WITH raw AS (${parts.join(" UNION ALL ")}),
  fixed AS (
    -- Oslo + Akershus: lng 9.5–12, lat 59–61. If x looks like a latitude, the axes came in flipped.
    -- ETRS89 and WGS84 differ by well under a metre here: relabel instead of transforming.
    SELECT typeCode, ST_SetCRS(CASE WHEN ST_X(ST_Centroid(geom)) > 50 THEN ST_FlipCoordinates(geom) ELSE geom END, 'EPSG:4326') AS geom FROM raw
  )
  SELECT row_number() OVER () AS id, ${typeName.replaceAll("arealtype", "typeCode")} AS name, typeCode,
    ${typeName.replaceAll("arealtype", "typeCode")} AS typeName, 'NIBIO' AS source, ST_MakeValid(geom) AS geom
  FROM fixed
  WHERE ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))
`);
const counts = await query<{ typeName: string; n: number }>("SELECT typeName, count(*)::INTEGER AS n FROM arealtyper GROUP BY 1 ORDER BY 2 DESC");
console.log(`arealtyper: ${counts.map((c) => `${c.typeName} ${c.n}`).join(", ")}`);
