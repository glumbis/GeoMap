// Share of pupils who say they are bullied, per grunnskole in Oslo + Akershus, from Udir's Elevundersøkelsen
// (Statistikkbanken open API, export 150 "EUG - Mobbing", NLOD, keyless). Owner: Even. Needs the `schools` table.
// Per school: the index "Mobbing på skolen", all pupils, the highest grade asked (7. for barneskoler, 10. for
// ungdomsskoler), the latest school year with a number. Udir hides small groups ("*"): those stay NULL.
// One row per grunnskole in `schools`, so the `schoolBullying` data point finds the same school as `school`.
import { writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { getJson, rawPath } from "./lib.ts";

const API = "https://api.statistikkbanken.udir.no/api/rest/v2/Eksport/150";
const schools = await query<{ orgnr: string }>("SELECT orgnr FROM schools WHERE isPrimary");
if (!schools.length) throw new Error("schools table is empty. Run: npm run ingest schools");

const filters = await getJson(`${API}/filterVerdier`);
const years: { id: number; navn: string }[] = filters.TidID.slice(0, 2); // newest first
const unitId = new Map<string, number>();
for (const e of filters.EnhetID) if (e.nivaa === 4 && !unitId.has(e.kode)) unitId.set(e.kode, e.id);

type Row = { TrinnKode: string; KjoennKode: string; Eierformkode: number; SpoersmaalNivaa: number; AndelMobbet: string; AntallBesvart: string };
const share = (s: string) => (/^\d+(,\d+)?$/.test(s) ? Number(s.replace(",", ".")) : null);

/** The index row for all pupils, highest grade with a number, for one unit and year. */
async function reading(enhetId: number, year: number) {
  const rows: Row[] = await getJson(`${API}/data?filter=TidID(${year})_EnhetID(${enhetId})_SpoersmaalID(-50)&format=0`).catch(() => []);
  const best = rows
    .filter((r) => r.SpoersmaalNivaa === 1 && r.KjoennKode === "A" && r.Eierformkode === -10 && share(r.AndelMobbet) != null)
    .sort((a, b) => Number(b.TrinnKode) - Number(a.TrinnKode))[0];
  return best ? { grade: Number(best.TrinnKode), bulliedPct: share(best.AndelMobbet), answered: Number(best.AntallBesvart) || null } : null;
}

/** Run fn over items with at most `n` requests in flight. */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// National share per grade, latest year, to compare against.
const nationalRows: Row[] = await getJson(`${API}/data?filter=TidID(${years[0].id})_EnhetID(-12)_SpoersmaalID(-50)&format=0`);
const national = new Map<number, number>();
for (const r of nationalRows) {
  if (r.SpoersmaalNivaa === 1 && r.KjoennKode === "A" && r.Eierformkode === -10 && share(r.AndelMobbet) != null) national.set(Number(r.TrinnKode), share(r.AndelMobbet)!);
}

const rows = await pool(schools, 8, async ({ orgnr }) => {
  const id = unitId.get(orgnr);
  if (id == null) return { orgnr };
  for (const y of years) {
    const r = await reading(id, y.id);
    if (r) return { orgnr, schoolYear: y.navn, ...r, nationalPct: national.get(r.grade) ?? null };
  }
  return { orgnr };
});
const file = rawPath("skole_mobbing.json");
await writeFile(file, JSON.stringify(rows));

await conn.run(`
  CREATE OR REPLACE TABLE skole_mobbing AS
  SELECT s.name, s.orgnr, s.kommunenummer, s.isPrimary, m.schoolYear, m.grade, m.bulliedPct, m.answered, m.nationalPct,
    'Utdanningsdirektoratet' AS source, s.geom
  FROM schools s
  LEFT JOIN read_json('${file}', columns = {
    orgnr: 'VARCHAR', schoolYear: 'VARCHAR', grade: 'INTEGER', bulliedPct: 'DOUBLE', answered: 'INTEGER', nationalPct: 'DOUBLE'
  }) m USING (orgnr)
  WHERE s.isPrimary
`);
const [c] = await query<{ n: number; withValue: number }>("SELECT count(*)::INTEGER AS n, count(bulliedPct)::INTEGER AS withValue FROM skole_mobbing");
console.log(`skole_mobbing: ${c.n} grunnskoler, ${c.withValue} with a number. National: ${[...national].map(([g, p]) => `${g}. trinn ${p} %`).join(", ")}`);
