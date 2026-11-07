// Active kindergartens (barnehager) in Oslo + Akershus, from Udir's Nasjonalt barnehageregister API
// (NLOD, keyless). Owner: Even. Needs the `kommuner` table.
// The list endpoint has no coordinates, so each kindergarten's detail is fetched (8 at a time).
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const API = "https://data-nbr.udir.no/v3";

/** Run fn over items with at most `n` requests in flight. */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const list: any[] = [];
for (const fylke of ["03", "32"]) list.push(...(await getJson(`${API}/enheter/fylke/${fylke}`)));
// Owners are companies/municipalities, not kindergartens. "Inaktiv i BASIL" = no longer reports, i.e. closed.
const wanted = list.filter((e) => e.ErAktiv && e.ErBarnehage && !e.ErBarnehageeier && !e.ErInaktivIBasil);

const details: any[] = await pool(wanted, 8, (e) => getJson(`${API}/enhet/${e.Orgnr}`));
const active = details.filter((d) => d.ErAktiv && !d.ErInaktivIBasil);

const rows = active
  .filter((d) => d.Koordinat?.Lengdegrad && d.Koordinat?.Breddegrad)
  .map((d) => ({
    orgnr: d.Orgnr,
    name: d.Navn,
    address: d.Beliggenhetsadresse?.Adresse ?? null,
    postcode: d.Beliggenhetsadresse?.Postnr ?? null,
    place: d.Beliggenhetsadresse?.Poststed ?? null,
    isPrivate: !!d.ErPrivatBarnehage,
    children: d.AntallBarn ?? null,
    ageFrom: d.AlderstrinnFra ?? null,
    ageTo: d.AlderstrinnTil ?? null,
    categories: (d.Barnehagekategorier ?? []).map((c: any) => c.Navn).join(", ") || null,
    url: d.Url || null,
    geoSource: d.Koordinat.GeoKilde ?? null, // where Udir got the position (some are only postcode-level)
    lng: d.Koordinat.Lengdegrad,
    lat: d.Koordinat.Breddegrad,
  }));

const file = rawPath("kindergartens.json");
await writeFile(file, JSON.stringify(rows));

await conn.run(`
  CREATE OR REPLACE TABLE kindergartens AS
  WITH s AS (
    SELECT * EXCLUDE (lng, lat), ST_Point(lng, lat) AS geom
    FROM read_json('${file}', columns = {
      orgnr: 'VARCHAR', name: 'VARCHAR', address: 'VARCHAR', postcode: 'VARCHAR', place: 'VARCHAR',
      isPrivate: 'BOOLEAN', children: 'INTEGER', ageFrom: 'INTEGER', ageTo: 'INTEGER',
      categories: 'VARCHAR', url: 'VARCHAR', geoSource: 'VARCHAR', lng: 'DOUBLE', lat: 'DOUBLE'
    })
  )
  SELECT s.* EXCLUDE (geom), k.kommunenummer, 'Utdanningsdirektoratet' AS source, s.geom
  FROM s JOIN kommuner k ON ST_Intersects(s.geom, k.geom)
`);
const [{ n }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kindergartens");
console.log(`kindergartens: ${n} rows (${active.length} active, ${active.length - rows.length} without position)`);
