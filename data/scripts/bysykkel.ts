// Oslo Bysykkel stations (GBFS station_information, NLOD, keyless). Oslo only. Owner: Even.
// Matches the `cityBike` data point in api/src/datapoints.ts (info only).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath } from "./lib.ts";

const res = await fetch("https://gbfs.urbansharing.com/oslobysykkel.no/station_information.json", {
  headers: { "Client-Identifier": "GeoMap-hackathon", "User-Agent": "GeoMap-hackathon" },
});
if (!res.ok) throw new Error(`Oslo Bysykkel: ${res.status} ${await res.text()}`);
const stations = (await res.json()).data.stations.map((s: any) => ({
  id: s.station_id, name: s.name, address: s.address ?? null, capacity: s.capacity ?? null, lng: s.lon, lat: s.lat,
}));
const file = rawPath("bysykkel.json");
await writeFile(file, JSON.stringify(stations));

await conn.run(`
  CREATE OR REPLACE TABLE bysykkel AS
  SELECT id, name, address, capacity::INTEGER AS capacity, 'Oslo Bysykkel' AS source, ST_Point(lng, lat) AS geom
  FROM read_json('${file}', columns = { id: 'VARCHAR', name: 'VARCHAR', address: 'VARCHAR', capacity: 'INTEGER', lng: 'DOUBLE', lat: 'DOUBLE' })
`);
const [c] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM bysykkel");
console.log(`bysykkel: ${c.n} stations`);
