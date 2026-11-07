// Public shelters (Tilfluktsrom - Offentlige) and fire stations (Brannstasjoner) in Oslo + Akershus, from DSB on
// Geonorge (NLOD, credit "DSB"). National FGDB files in EPSG:25833, read straight from the zip. Owner: Even.
// Needs the `kommuner` table. Two tables, two data points: `shelter` and `fireStation` in api/src/datapoints.ts (info only).
import { conn, query } from "../../api/src/db.ts";
import { download } from "./lib.ts";

const base = (name: string) => `Samfunnssikkerhet_0000_Norge_25833_${name}_FGDB`;
const url = (name: string) => `https://nedlasting.geonorge.no/geonorge/Samfunnssikkerhet/${name}/FGDB/${base(name)}.zip`;
const toWgs = (g: string) => `ST_Transform(${g}, 'EPSG:25833', 'EPSG:4326', always_xy := true)`;
const clip = "ST_Intersects(geom, (SELECT ST_Union_Agg(geom) FROM kommuner))";

const shelters = await download(url("TilfluktsromOffentlige"), "tilfluktsrom.zip");
// One row per shelter. places = how many people it holds; address is DSB's text ("Torget 6").
await conn.run(`
  CREATE OR REPLACE TABLE tilfluktsrom AS
  SELECT * FROM (
    SELECT lokalid AS id, coalesce(nullif(trim(adresse), ''), 'Tilfluktsrom') AS name, romnr::INTEGER AS shelterNo,
      plasser::INTEGER AS places, 'DSB' AS source, ${toWgs("SHAPE")} AS geom
    FROM ST_Read('/vsizip/${shelters}/${base("TilfluktsromOffentlige")}.gdb')
  ) WHERE ${clip}
`);

const stations = await download(url("Brannstasjoner"), "brannstasjoner.zip");
// One row per station or depot. staffed = kasernert ('K': crew on duty around the clock); type = DSB's station type code.
await conn.run(`
  CREATE OR REPLACE TABLE brannstasjoner AS
  SELECT * FROM (
    SELECT OBJECTID AS id, brannstasjon AS name, brannvesen AS fireService, stasjonstype AS type,
      kasernert = 'K' AS staffed, kasernert AS staffing, 'DSB' AS source, ${toWgs("SHAPE")} AS geom
    FROM ST_Read('/vsizip/${stations}/${base("Brannstasjoner")}.gdb')
  ) WHERE ${clip}
`);

const [s] = await query<{ n: number; places: number }>("SELECT count(*)::INTEGER AS n, sum(places)::INTEGER AS places FROM tilfluktsrom");
const b = await query<{ staffing: string; n: number }>("SELECT staffing, count(*)::INTEGER AS n FROM brannstasjoner GROUP BY 1 ORDER BY 1");
console.log(`tilfluktsrom: ${s.n} shelters, ${s.places} places. brannstasjoner: ${b.map((r) => `${r.staffing}=${r.n}`).join(", ")}`);
