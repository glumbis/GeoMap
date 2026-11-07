// Bedrock (berggrunn) for Oslo + Akershus, from NGU (NLOD, credit "NGU").
// Owner: Sverre. Needs the `kommuner` table (runs after kommuner.ts in `npm run ingest`).
// Source: NGU county downloads (file geodatabase in a zip, geographic EUREF89 = lng/lat), read straight from the zip.
//   N50  (1:50 000):  detailed, covers ~60% of the area (most of Oslo, Bærum, Asker, the west and north).
//   N250 (1:250 000): regional, used only to fill the gaps (much of eastern and southern Akershus).
// The `scale` column says which map a row comes from.
// N50 rock names and map colours come from NGU's style file in the N50 zip (code list for `hovedbergart`);
// N250 has the names in its own `hovedbergart_navn` column.
// alumShale: alum shale (alunskifer). It can swell and damage foundations, makes acidic run-off when dug up,
// and is rich in uranium (radon). Common in the Oslo area.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { download, rawPath, readZipEntry } from "./lib.ts";

const N50 = "https://nedlasting.ngu.no/api/fileproxy/a5c76d05-33bd-4a1d-b28b-81575092e468";
const N250 = "https://nedlasting.ngu.no/api/fileproxy/7c39be66-77b6-4b74-b58d-53b6bee90067";
const N50_FILES = [
  { county: "03", name: "berggrunn_n50_oslo.zip", url: `${N50}/70560bb5-04fa-496b-9646-4cba967e75ae` },
  { county: "32", name: "berggrunn_n50_akershus.zip", url: `${N50}/265c4488-0154-4701-b4bd-38b10da2b213` },
];
// Oslo is fully covered by N50, so only the Akershus N250 file is needed for the gaps.
const N250_FILE = { county: "32", name: "berggrunn_n250_akershus.zip", url: `${N250}/0218085a-029f-4fa1-b90c-d527d37b927b` };

const [{ n: kommuner }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM kommuner");
if (!kommuner) throw new Error("kommuner table is empty. Run: npm run ingest kommuner");

const n50 = [];
for (const f of N50_FILES) n50.push({ ...f, path: await download(f.url, f.name) });
const n250 = { ...N250_FILE, path: await download(N250_FILE.url, N250_FILE.name) };

// N50 code list: each <Rule> in the style file maps one hovedbergart code to a name and a fill colour.
const sld = (await readZipEntry(n50[0].path, "BerggrunnN50_Vedlegg/BergartFlate_Hovedbergart_N50.sld")).toString("utf8");
const codes = [...sld.matchAll(/<se:Rule>([\s\S]*?)<\/se:Rule>/g)].flatMap(([, rule]) => {
  const code = rule.match(/PropertyIsEqualTo>\s*<ogc:PropertyName>hovedbergart<\/ogc:PropertyName>\s*<ogc:Literal>\s*(\d+)/);
  const name = rule.match(/<se:Name>([^<]+)<\/se:Name>/);
  const color = rule.match(/name="fill">(#[0-9a-fA-F]{6})/);
  return code && name ? [{ code: Number(code[1]), name: name[1].trim(), color: color?.[1] ?? null }] : [];
});
if (codes.length < 50) throw new Error(`Rock code list looks wrong: ${codes.length} codes`);
const codesFile = rawPath("berggrunn_codes.json");
await writeFile(codesFile, JSON.stringify(codes));

// Read a county file and keep each polygon only if it lies in that county (the files overlap at the border).
// EUREF89 (EPSG:4258) differs from WGS84 by well under 1 m, so the CRS is relabelled.
const read = (path: string, gdb: string, layer: string, county: string) => `
  SELECT '${county}' AS county, s.* EXCLUDE (SHAPE), ST_SetCRS(s.SHAPE, 'EPSG:4326') AS geom
  FROM ST_Read('/vsizip/${path}/${gdb}', layer := '${layer}') s
  JOIN kommuner k ON ST_Intersects(k.geom, ST_PointOnSurface(ST_SetCRS(s.SHAPE, 'EPSG:4326'))) AND k.fylkesnummer = '${county}'`;

const alum = (legend: string, extra = "false") =>
  `(${legend} ILIKE '%alunskifer%' OR (${legend} ILIKE '%karbonholdig%' AND ${legend} ILIKE '%stinkkalk%') OR ${extra})`;

await conn.run(`
  CREATE OR REPLACE TABLE berggrunn AS
  WITH codes AS (SELECT * FROM read_json('${codesFile}')),
  n50 AS (
    SELECT
      'n50-' || county || '-' || OBJECTID AS id,
      -- No code (dikes): first sentence of the legend. Codes >= 1000: NGU's "Ikke klassifisert".
      coalesce(c.name, CASE WHEN hovedbergart >= 1000 THEN 'Ikke klassifisert' END, split_part(tegnforklaring, '.', 1),
        'Bergart ikke angitt') AS name,
      hovedbergart::INTEGER AS rockCode,
      tegnforklaring AS legend,
      ${alum("tegnforklaring")} AS alumShale,
      c.color,
      50000 AS scale,
      geom
    FROM (${n50.map((z) => read(z.path, "BerggrunnN50.gdb", "BergartFlate_N50", z.county)).join(" UNION ALL BY NAME ")}) p
    LEFT JOIN codes c ON c.code = p.hovedbergart
  ),
  cover AS (SELECT ST_Union_Agg(geom) AS g FROM n50),
  n250 AS (
    SELECT
      'n250-' || county || '-' || OBJECTID AS id,
      coalesce(hovedbergart_navn, split_part(tegnforklaring, '.', 1), 'Bergart ikke angitt') AS name,
      hovedbergart::INTEGER AS rockCode,
      tegnforklaring AS legend,
      ${alum("tegnforklaring", "formasjon_navn ILIKE '%alunskifer%'")} AS alumShale,
      c.color,
      250000 AS scale,
      -- only the part N50 does not cover
      CASE WHEN ST_Intersects(p.geom, cover.g) THEN ST_Difference(p.geom, cover.g) ELSE p.geom END AS geom
    FROM (${read(n250.path, "BerggrunnN250.gdb", "BergartFlate_N250", n250.county)}) p
    CROSS JOIN cover
    LEFT JOIN codes c ON c.code = p.hovedbergart
  )
  SELECT * EXCLUDE (geom), 'NGU' AS source, ST_MakeValid(ST_SimplifyPreserveTopology(geom, 0.00001)) AS geom
  FROM (SELECT * FROM n50 UNION ALL SELECT * FROM n250)
  -- drop slivers left over from the cut (< ~10 m²)
  WHERE NOT ST_IsEmpty(geom) AND ST_Area(geom) > 2e-9
`);
const stats = await query<{ scale: number; n: number; alum: number }>(
  "SELECT scale, count(*)::INTEGER AS n, count(*) FILTER (WHERE alumShale)::INTEGER AS alum FROM berggrunn GROUP BY 1 ORDER BY 1",
);
console.log(`berggrunn: ${stats.map((s) => `N${s.scale / 1000}=${s.n} (${s.alum} alum shale)`).join(", ")}, ${codes.length} rock codes`);
