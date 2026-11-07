// Wind roses (vindroser) for MET Norway weather stations in and around Oslo + Akershus. Owner: Sverre. Needs `kommuner`.
// Source: MET Norway's station observations on THREDDS (no key, CC BY 4.0), one NetCDF file per station and parameter:
//   https://thredds.met.no/thredds/catalog/met.no/observations/surface/<station>/<param>/catalog.html
//   param 81 = wind_speed (10-minute mean at 10 m), param 61 = wind_from_direction (degrees, 0/360 = from north).
// Read with OPeNDAP (binary DAP2), only the part from FROM onwards. Older years are hourly; recent years are per minute,
// so both are sampled to one observation per whole hour (HH:00) to weigh every year the same, like MET's own roses.
// Per station: hours per direction (16 sectors of 22.5°, sector 0 = N) and speed band (Beaufort, see BANDS), plus calm
// hours (< 0.3 m/s, no direction). Stations with less than MIN_HOURS joined hours are left out.
// Station height (elevationM) from Kartverket's terrain model (hoydedata API), so hilltop stations can be kept to
// addresses close by (api/src/wind.ts pickStation).
// Station list and downloads are cached in data/raw/vind/ (delete the folder to fetch everything again).
import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { conn, query } from "../../api/src/db.ts";
import { rawPath, studyBbox } from "./lib.ts";

const BASE = "https://thredds.met.no/thredds";
const PATH = "met.no/observations/surface";
const FROM = Date.UTC(2016, 0, 1) / 1000; // like seklima's 10-year roses
const MIN_HOURS = 2 * 365 * 24 * 0.8; // at least ~2 years of usable hours
const MARGIN = { lat: 0.25, lng: 0.45 }; // ~25 km around the study area, so border addresses get a station too
/** Upper limits in m/s, matching MET's bands: flau vind, svak vind, lett bris, laber bris, frisk bris, liten kuling+. */
export const BANDS = [1.6, 3.4, 5.5, 8.0, 10.8, Infinity];
const CALM = 0.3;
const headers = { "User-Agent": "GeoMap-hackathon" };

const DIR = rawPath("vind");
mkdirSync(DIR, { recursive: true });

async function text(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.text();
    if (res.status === 404 || attempt === 3) throw new Error(`${res.status} ${res.statusText}: ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const folders = (html: string) => [...html.matchAll(/href="(\d+)\/catalog\.html"/g)].map((m) => m[1]);

interface Station { id: string; name: string; lat: number; lng: number; speed: string; direction: string }

/** Every station with both wind speed and direction, with its position and display name. Cached. */
async function stations(): Promise<Station[]> {
  const cache = `${DIR}/stations.json`;
  if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8"));
  const ids = folders(await text(`${BASE}/catalog/${PATH}/catalog.html`));
  const found = await pool(ids, 8, async (id): Promise<Station | null> => {
    const params = folders(await text(`${BASE}/catalog/${PATH}/${id}/catalog.html`));
    if (!params.includes("61") || !params.includes("81")) return null;
    const file = async (p: string) => /dataset=([^"]+\.nc)/.exec(await text(`${BASE}/catalog/${PATH}/${id}/${p}/catalog.html`))?.[1];
    const [speed, direction] = [await file("81"), await file("61")];
    if (!speed || !direction) return null;
    const das = await text(`${BASE}/dodsC/${speed}.das`);
    const pos = await text(`${BASE}/dodsC/${speed}.ascii?latitude,longitude`);
    const lat = Number(/latitude, ([\d.-]+)/.exec(pos)?.[1]);
    const lng = Number(/longitude, ([\d.-]+)/.exec(pos)?.[1]);
    // title_no: "Middelvind-observasjoner fra værstasjonen Oslo (Blindern), OSLO, Norge, (WIGOS ...". Fallback: file name.
    const title = /title_no "[^"]*?værstasjonen (.+?), [^,]+, Norge/.exec(das)?.[1];
    const name = title ?? speed.split("/").pop()!.replace(/_wind_speed\.nc$/, "").replaceAll("_", " ");
    return Number.isFinite(lat) && Number.isFinite(lng) ? { id, name, lat, lng, speed, direction } : null;
  });
  const list = found.filter((s): s is Station => s !== null);
  await writeFile(cache, JSON.stringify(list, null, 1));
  return list;
}

/**
 * Minimal DAP2 binary reader: after the DDS text and "Data:\n", each array is two big-endian uint32 lengths and the
 * values (Float64, Float32, or bytes padded to 4), in the order the returned DDS lists them.
 */
function readDods(buf: Buffer): Record<string, Float64Array | Float32Array | Uint8Array> {
  const marker = buf.indexOf("\nData:\n");
  if (marker < 0) throw new Error(`not a DAP2 response: ${buf.subarray(0, 200).toString()}`);
  const dds = buf.subarray(0, marker).toString();
  const vars = [...dds.matchAll(/(Float64|Float32|Byte|Int16|Int32)\s+(\w+)\[/g)].map((m) => ({ type: m[1], name: m[2] }));
  const out: Record<string, Float64Array | Float32Array | Uint8Array> = {};
  let p = marker + 7;
  for (const v of vars) {
    const n = buf.readUInt32BE(p);
    p += 8;
    if (v.type === "Float64") {
      const a = new Float64Array(n);
      for (let i = 0; i < n; i++) a[i] = buf.readDoubleBE(p + i * 8);
      out[v.name] = a; p += n * 8;
    } else if (v.type === "Float32") {
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = buf.readFloatBE(p + i * 4);
      out[v.name] = a; p += n * 4;
    } else if (v.type === "Byte") {
      out[v.name] = Uint8Array.from(buf.subarray(p, p + n)); p += Math.ceil(n / 4) * 4;
    } else throw new Error(`unsupported DAP type ${v.type}`);
  }
  return out;
}

/** Terrain height in metres at a point (Kartverket hoydedata, DTM 1 m). undefined if the service has none. */
async function elevation(lat: number, lng: number): Promise<number | undefined> {
  const url = `https://ws.geonorge.no/hoydedata/v1/punkt?nord=${lat}&ost=${lng}&koordsys=4258&geojson=false`;
  const z = JSON.parse(await text(url)).punkter?.[0]?.z;
  return typeof z === "number" ? Math.round(z) : undefined;
}

/** Hourly values (time in s -> value) from FROM onwards, quality-flagged "very uncertain"/"erroneous" dropped. Cached. */
async function hourly(file: string): Promise<Map<number, number>> {
  const cache = `${DIR}/${file.split("/").slice(-3).join("_").replace(/\.nc$/, ".dods")}`;
  let buf: Buffer;
  if (existsSync(cache)) buf = await readFile(cache);
  else {
    const n = Number(/time = (\d+)\]/.exec(await text(`${BASE}/dodsC/${file}.dds`))?.[1]);
    if (!n) return new Map();
    // First index at or after FROM, from every 1000th time stamp (times are sorted).
    const step = 1000;
    // ASCII answer: "...", "time[1535]", "<values, comma separated>", "" ...
    const lines = (await text(`${BASE}/dodsC/${file}.ascii?time%5B0:${step}:${n - 1}%5D`)).split("\n");
    const sample = (lines[lines.findIndex((l) => l.startsWith("time[")) + 1] ?? "").split(",").map(Number);
    const at = sample.findIndex((t) => t >= FROM);
    if (at < 0) return new Map(); // nothing since FROM
    const start = Math.max(0, (at - 1) * step);
    const slab = `%5B${start}:1:${n - 1}%5D`;
    const res = await fetch(`${BASE}/dodsC/${file}.dods?time${slab},obs_corr${slab},obs_corr_qc_generic${slab}`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${file}`);
    buf = Buffer.from(await res.arrayBuffer());
    await writeFile(cache, buf);
  }
  const d = readDods(buf);
  const time = d.time as Float64Array, value = d.obs_corr as Float32Array, qc = d.obs_corr_qc_generic as Uint8Array;
  const out = new Map<number, number>();
  for (let i = 0; i < time.length; i++) {
    const t = Math.round(time[i]);
    if (t < FROM || t % 3600 !== 0) continue;
    if (!Number.isFinite(value[i]) || value[i] <= -32767 || value[i] < 0) continue;
    if (qc && (qc[i] === 5 || qc[i] === 6 || qc[i] === 7)) continue; // very uncertain or erroneous (128 = not set: kept)
    out.set(t, value[i]);
  }
  return out;
}

const [minLng, minLat, maxLng, maxLat] = await studyBbox();
const near = (await stations()).filter((s) =>
  s.lat >= minLat - MARGIN.lat && s.lat <= maxLat + MARGIN.lat && s.lng >= minLng - MARGIN.lng && s.lng <= maxLng + MARGIN.lng);
console.log(`vindroser: ${near.length} stations with wind near Oslo + Akershus`);

const rows: { id: string; name: string; lat: number; lng: number; elevationM?: number; hours: number; calmHours: number; from: string; to: string; rose: number[][] }[] = [];
for (const s of near) {
  try {
    const [speed, dir] = [await hourly(s.speed), await hourly(s.direction)];
    const rose = Array.from({ length: 16 }, () => BANDS.map(() => 0));
    let hours = 0, calm = 0, first = Infinity, last = 0;
    for (const [t, v] of speed) {
      const d = dir.get(t);
      if (d == null) continue;
      hours++;
      first = Math.min(first, t); last = Math.max(last, t);
      if (v < CALM) { calm++; continue; }
      const sector = Math.floor((((d % 360) + 360 + 11.25) % 360) / 22.5);
      rose[sector][BANDS.findIndex((b) => v < b)]++;
    }
    if (hours < MIN_HOURS) {
      console.log(`  ${s.id} ${s.name}: only ${hours} hours since 2016, left out`);
      continue;
    }
    const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
    const elevationM = await elevation(s.lat, s.lng).catch(() => undefined);
    rows.push({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, elevationM, hours, calmHours: calm, from: day(first), to: day(last), rose });
    console.log(`  ${s.id} ${s.name} (${elevationM ?? "?"} moh): ${hours} hours ${day(first)}..${day(last)}`);
  } catch (err) {
    console.log(`  ${s.id} ${s.name}: failed (${(err as Error).message.slice(0, 120)}), left out`);
  }
}
if (!rows.length) throw new Error("vindroser: no station data, check https://thredds.met.no");

const json = `${DIR}/vindroser.json`;
await writeFile(json, JSON.stringify(rows));
await conn.run(`
  CREATE OR REPLACE TABLE vindroser AS
  SELECT id AS stationId, name, elevationM, hours::INTEGER AS hours, calmHours::INTEGER AS calmHours,
    "from"::DATE AS periodFrom, "to"::DATE AS periodTo, to_json(rose)::VARCHAR AS rose,
    'MET Norway' AS source, ST_Point(lng, lat) AS geom
  FROM read_json('${json}', columns = {id: 'VARCHAR', name: 'VARCHAR', lat: 'DOUBLE', lng: 'DOUBLE', elevationM: 'INTEGER', hours: 'INTEGER',
    calmHours: 'INTEGER', "from": 'VARCHAR', "to": 'VARCHAR', rose: 'INTEGER[][]'})
`);
const [{ n }] = await query<{ n: number }>("SELECT count(*)::INTEGER AS n FROM vindroser");
console.log(`vindroser: ${n} stations`);
