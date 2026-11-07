// Omnium Rapport: an in-depth PDF about one address. Spec: docs/REPORT.md.
// Built only from the address profile and summary (no data of its own), plus hazard zones for the map.
// The one API response that is not JSON (AGENTS.md -> "API conventions").
import { readFileSync } from "node:fs";
import { compareWithArea, type Area, type AreaComparison } from "./area.ts";
import { DATA_POINTS, NEAREST_STEPS, type Severity } from "./datapoints.ts";
import { query } from "./db.ts";
import { htmlToPdf } from "./pdf.ts";
import { buildProfile, findRows, type MissingDataPoint, type PresentDataPoint, type Profile } from "./profile.ts";
import type { Rating } from "./rating.ts";
import { buildSummary, type Summary } from "./summary.ts";
import { clock, compassWord, fetchHorizon, horizonAt, hoursMin, sunAbove, sunPath, sunYear, type SunDay, type SunYear } from "./sun.ts";
import { addressArea, addressShares, loadedTables, nearestZoneM, type AreaShares, type Share, type ZoneSource } from "./zones.ts";
import { BANDS, SECTORS, directionText, pickStation, sectorName, stationText, summarise, windMeaning, type WindRose } from "./wind.ts";

// Colours: copied from web/src/style.css (the web tokens can't reach a PDF). Keep in step with that file.
const C = {
  ink: "#15233a", muted: "#5b6676", line: "#e7e0da", paper: "#fcf7f5", navy: "#1a3d57", teal: "#0c5e68",
  orange: "#ec7f33", good: "#41aa79", warn: "#e0a43a", bad: "#d4553a", unknown: "#9aa3ad",
};

const LOGO = `data:image/png;base64,${readFileSync(new URL("../../web/public/logo-mark.png", import.meta.url)).toString("base64")}`;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());

// ---------- Words and colours for scores (same thresholds as the web app) ----------

const scoreColour = (s: number) => (s >= 60 ? C.good : s >= 40 ? C.warn : C.bad);
const scoreWord = (s: number) => (s >= 80 ? "Svært god" : s >= 60 ? "God" : s >= 40 ? "Middels" : "Svak");
/** docs/PROFILE.md: a capped score is never called "God"; the cap reason replaces the word. */
const ratingWord = (r: Rating) =>
  r.status === "ok" ? (r.cappedBy?.length ? r.cappedBy[0].text : scoreWord(r.score!)) : r.status === "informational" ? "Kun fakta" : "Kan ikke vurderes";
const SEVERITY: Record<Severity, { word: string; colour: string }> = {
  high: { word: "Høy", colour: C.bad }, medium: { word: "Middels", colour: C.warn }, low: { word: "Lav", colour: C.unknown },
};
const EFFECT = { good: C.good, bad: C.bad, neutral: C.unknown };
const MISSING: Record<MissingDataPoint["reason"], string> = {
  notLoaded: "Ikke lastet inn ennå", noCoverage: "Kilden dekker ikke denne adressen", sourceUnavailable: "Kilden svarer ikke nå",
  outsideArea: "Utenfor Oslo og Akershus",
};

// ---------- Static maps: Kartverket tiles laid out in HTML, hazard zones drawn as SVG on top ----------

const TILE = 256;
interface Frame { z: number; left: number; top: number; w: number; h: number }

function frame(lng: number, lat: number, z: number, w: number, h: number): Frame {
  const n = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  const x = ((lng + 180) / 360) * n;
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { z, left: x - w / 2, top: y - h / 2, w, h };
}

/** Screen pixel inside the frame for a lng/lat. */
function px(f: Frame, lng: number, lat: number): [number, number] {
  const n = TILE * 2 ** f.z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * n - f.left, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n - f.top];
}

function bbox(f: Frame): [number, number, number, number] {
  const n = TILE * 2 ** f.z;
  const lng = (x: number) => (x / n) * 360 - 180;
  const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lng(f.left), lat(f.top + f.h), lng(f.left + f.w), lat(f.top)];
}

function tiles(f: Frame, layer: string): string {
  const out: string[] = [];
  for (let tx = Math.floor(f.left / TILE); tx * TILE < f.left + f.w; tx++) {
    for (let ty = Math.floor(f.top / TILE); ty * TILE < f.top + f.h; ty++) {
      const url = `https://cache.kartverket.no/v1/wmts/1.0.0/${layer}/default/webmercator/${f.z}/${ty}/${tx}.png`;
      out.push(`<img src="${url}" style="left:${(tx * TILE - f.left).toFixed(1)}px;top:${(ty * TILE - f.top).toFixed(1)}px" alt="">`);
    }
  }
  return out.join("");
}

const PIN = `<svg class="pin" viewBox="0 0 24 34" width="26" height="37"><path d="M12 33C12 33 1 19.5 1 12a11 11 0 0 1 22 0c0 7.5-11 21-11 21z" fill="${C.orange}" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="4.2" fill="#fff"/></svg>`;

/** credit: who drew the overlay (default NVE, the hazard map). */
function map(f: Frame, layer: string, lng: number, lat: number, overlay = "", credit = "NVE"): string {
  const [x, y] = px(f, lng, lat);
  return `<div class="map ${layer}" style="width:${f.w}px;height:${f.h}px">
    <div class="tiles">${tiles(f, layer)}</div>
    <svg class="overlay" width="${f.w}" height="${f.h}">${overlay}</svg>
    <div class="pin-at" style="left:${x}px;top:${y}px">${PIN}</div>
    <div class="map-credit">© Kartverket${overlay && credit ? `, ${esc(credit)}` : ""}</div>
  </div>`;
}

const HAZARD_COLOURS: Record<string, string> = {
  quickClay: C.bad, flood200: "#2f7fb5", rockfall: "#8a5a3c", debrisFlow: C.warn, avalanche: "#6a5acd", stormSurge: C.teal,
};

interface Zone { id: string; label: string; colour: string; path: string }

/** One table's polygons inside the map frame as one SVG path ("" when none). `where` is fixed SQL, never user input. */
async function zonePath(f: Frame, table: string, where?: string, limit = 600): Promise<string> {
  const [minLng, minLat, maxLng, maxLat] = bbox(f);
  const tolerance = (maxLng - minLng) / f.w; // about one pixel
  const env = "ST_MakeEnvelope($1, $2, $3, $4)";
  const rows = await query<{ g: string }>(
    `SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Intersection(ST_MakeValid(geom), ${env}), $5)) AS g
     FROM ${table} WHERE ST_Intersects(geom, ${env})${where ? ` AND (${where})` : ""} LIMIT ${limit}`,
    [minLng, minLat, maxLng, maxLat, tolerance],
  );
  return rows.map((r) => geoPath(JSON.parse(r.g), f)).join(" ").trim();
}

/** Hazard zones inside the map frame, as SVG paths. A layer that fails is left out of the map (and logged). */
async function hazardZones(f: Frame): Promise<Zone[]> {
  const loaded = await loadedTables();
  const zones: Zone[] = [];
  for (const dp of DATA_POINTS.filter((d) => HAZARD_COLOURS[d.id] && d.find.kind === "within" && loaded.has(d.table))) {
    try {
      const path = await zonePath(f, dp.table, dp.find.where, 300);
      if (path) zones.push({ id: dp.id, label: dp.label, colour: HAZARD_COLOURS[dp.id], path });
    } catch (err) {
      console.error(`report: hazard zones for ${dp.id} failed:`, (err as Error).message);
    }
  }
  return zones;
}

function geoPath(g: any, f: Frame): string {
  const ring = (r: number[][]) => r.map(([lng, lat], i) => `${i ? "L" : "M"}${px(f, lng, lat).map((v) => v.toFixed(1)).join(" ")}`).join("") + "Z";
  if (g.type === "Polygon") return g.coordinates.map(ring).join("");
  if (g.type === "MultiPolygon") return g.coordinates.flatMap((p: number[][][]) => p.map(ring)).join("");
  if (g.type === "GeometryCollection") return g.geometries.map((x: any) => geoPath(x, f)).join("");
  return ""; // lines and points left over from clipping
}

// ---------- Charts (inline SVG / HTML, no library) ----------

/** 0-100 bar with the score as the fill; neutral (no score) shows a dash. */
function bar(score: number | undefined, height = 8): string {
  if (score == null) return `<div class="bar empty" style="height:${height}px"></div>`;
  return `<div class="bar" style="height:${height}px"><div style="width:${Math.max(score, 1.5)}%;background:${scoreColour(score)}"></div></div>`;
}

/** The big score scale on the cover: 0-100 with the three bands and a marker. */
function scale(score: number): string {
  return `<div class="scale">
    <div class="bands"><span style="flex:40;background:${C.bad}"></span><span style="flex:20;background:${C.warn}"></span><span style="flex:40;background:${C.good}"></span></div>
    <div class="marker" style="left:${score}%"></div>
    <div class="ticks"><span>0</span><span style="left:40%">40</span><span style="left:60%">60</span><span style="left:80%">80</span><span style="right:0">100</span></div>
  </div>`;
}

function scoreBadge(r: Rating): string {
  if (r.status === "ok") return `<span class="badge" style="border-color:${scoreColour(r.score!)}"><b>${r.score}</b><small>/100</small></span>`;
  return `<span class="badge muted">${esc(ratingWord(r))}</span>`;
}

// ---------- Wind rose (api/src/wind.ts, MET Norway stations) ----------

/** Wind speed bands, light -> dark, one hue (teal ramp, checked: monotone lightness, light end visible on white). */
const WIND_RAMP = ["#8dc0bd", "#62a6a2", "#3a8b89", "#1c7376", "#0c5e68", "#063a42"];
const pct1 = (x: number) => `${(Math.round(x * 1000) / 10).toString().replace(".", ",")} %`;

/** Polar stacked bars: 16 sectors, bands stacked outwards, radius = share of all hours. Native <title> per segment. */
function windRoseSvg(w: WindRose): string {
  const R = 118, gapDeg = 1.2, half = 11.25 - gapDeg;
  const shares = w.rose.map((s) => s.map((h) => h / w.hours));
  const max = Math.max(...shares.map((s) => s.reduce((a, b) => a + b, 0)));
  const step = max > 0.3 ? 0.1 : 0.05;
  const top = Math.max(step, Math.ceil(max / step - 1e-9) * step);
  const r = (share: number) => (share / top) * R;
  const xy = (rad: number, deg: number): [number, number] => {
    const a = (deg * Math.PI) / 180;
    return [rad * Math.sin(a), -rad * Math.cos(a)];
  };
  const pt = (rad: number, deg: number) => xy(rad, deg).map((v) => v.toFixed(1)).join(" ");
  const wedge = (r0: number, r1: number, mid: number) => {
    const a0 = mid - half, a1 = mid + half;
    return `M${pt(r0, a0)}L${pt(r1, a0)}A${r1.toFixed(1)} ${r1.toFixed(1)} 0 0 1 ${pt(r1, a1)}L${pt(r0, a1)}` +
      (r0 > 0 ? `A${r0.toFixed(1)} ${r0.toFixed(1)} 0 0 0 ${pt(r0, a0)}Z` : "Z");
  };
  // Ring labels go along the quietest direction, half a sector off, so they sit between two direction labels.
  const totals = shares.map((s) => s.reduce((a, b) => a + b, 0));
  const quiet = totals.indexOf(Math.min(...totals));
  const rings: string[] = [];
  for (let i = 1; i * step <= top + 1e-9; i++) {
    const v = i * step;
    rings.push(`<circle r="${r(v).toFixed(1)}" fill="none" stroke="${C.line}" stroke-width="0.8"/>`);
    const [x, y] = xy(r(v), quiet * 22.5 + 11.25);
    rings.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy="2.5" text-anchor="middle" class="ring-label">${Math.round(v * 100)} %</text>`);
  }
  const segments = shares.flatMap((bands, i) => {
    let acc = 0;
    return bands.map((share, b) => {
      if (!share) return "";
      const r0 = r(acc), r1 = r(acc + share);
      acc += share;
      return `<path d="${wedge(r0, r1, i * 22.5)}" fill="${WIND_RAMP[b]}" stroke="#fff" stroke-width="0.8"><title>${SECTORS[i]}, ${BANDS[b].label.toLowerCase()}: ${pct1(share)} av timene</title></path>`;
    });
  }).join("");
  const labels = SECTORS.map((name, i) => {
    const [x, y] = xy(R + 13, i * 22.5);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" dy="3" text-anchor="middle" class="${i % 4 ? "dir" : "dir main"}">${name}</text>`;
  }).join("");
  return `<svg class="rose" viewBox="-150 -150 300 300" width="300" height="300" role="img" aria-label="Vindrose for ${esc(w.station)}: vindretning og vindstyrke i prosent av timene">
    ${rings.join("")}<line x1="0" y1="${-R}" x2="0" y2="${R}" stroke="${C.line}" stroke-width="0.8"/><line x1="${-R}" y1="0" x2="${R}" y2="0" stroke="${C.line}" stroke-width="0.8"/>
    ${segments}${labels}</svg>`;
}

function windSection(w: WindRose | undefined): string {
  const head = `<p class="kicker">Del 6</p><h2>Vind</h2>`;
  if (!w) return `${head}<p class="note">Ingen værstasjon fra Meteorologisk institutt med vindmålinger innen 25 km, så vi kan ikke vise vindrose for denne adressen.</p>`;
  const s = summarise(w);
  const m = windMeaning(s);
  return `${head}
  <p class="lead">Hvor vinden kommer fra og hvor sterk den er, time for time. ${esc(stationText(w))}.</p>
  <div class="wind">
    <div>${windRoseSvg(w)}
      <ul class="wind-legend">${BANDS.map((b, i) => `<li><i style="background:${WIND_RAMP[i]}"></i>${esc(b.label)} <span>${esc(b.range)}</span></li>`).join("")}</ul>
    </div>
    <div class="wind-facts">
      <p><span class="label">Mest vind fra</span><br><b>${esc(directionText(s))}</b><br><small>${pct1(s.shares[s.main])} av timene fra ${esc(sectorName(s.main))}${s.second != null ? `, ${pct1(s.shares[s.second])} fra ${esc(sectorName(s.second))}` : ""}</small></p>
      <p><span class="label">Frisk bris eller mer (8 m/s +)</span><br><b>${pct1(s.strongShare)}</b> av timene</p>
      <p><span class="label">Stille (under 0,3 m/s)</span><br><b>${pct1(s.calmShare)}</b> av timene</p>
      <h3 class="mini">Hva betyr det?</h3>
      <p><b>Å bo her:</b> ${esc(m.living)}</p>
      <p><b>Å bygge her:</b> ${esc(m.building)}</p>
    </div>
  </div>
  <p class="note">Vindrosen viser hvor vinden blåser <i>fra</i>. Hver stolpe er en retning, lengden er andelen av alle timer ${esc(w.periodFrom.slice(0, 4))}–${esc(w.periodTo.slice(0, 4))} (${w.hours.toLocaleString("nb-NO")} timer, én måling per time), og fargene er vindstyrke. Målt 10 m over bakken på stasjonen; vinden ved huset kan avvike på grunn av terreng, skog og bygninger. Kilde: Meteorologisk institutt (CC BY 4.0).</p>`;
}

// ---------- Nearby services: distance to the nearest of each, on one shared metre axis ----------

const SERVICES: { id: keyof typeof NEAREST_STEPS; label: string }[] = [
  { id: "transitStop", label: "Holdeplass" }, { id: "groceryStore", label: "Dagligvare" }, { id: "kindergarten", label: "Barnehage" },
  { id: "school", label: "Grunnskole" }, { id: "doctor", label: "Legekontor" }, { id: "pharmacy", label: "Apotek" },
];
/** Walking speed for "min å gå": 5 km/h, on the straight line (real paths are longer). */
const WALK_M_PER_MIN = 5000 / 60;
const walkMin = (m: number) => Math.max(1, Math.round(m / WALK_M_PER_MIN));
const metresText = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${KM.format(m / 1000)} km`);

interface ServiceRow { label: string; m?: number; name?: string; none?: string; full: number }

function serviceRows(p: Profile): ServiceRow[] {
  const points = new Map(p.categories.flatMap((c) => c.dataPoints).map((d) => [d.id, d]));
  const missing = new Map(p.categories.flatMap((c) => c.missing).map((d) => [d.id, d]));
  return SERVICES.flatMap(({ id, label }): ServiceRow[] => {
    const full = NEAREST_STEPS[id][0][0];
    const d = points.get(id);
    if (d) {
      if (typeof d.value !== "number") return [{ label, full, none: d.display }];
      const name = /\((.*)\)$/.exec(d.display)?.[1];
      return [{ label, full, m: d.value, ...(name && { name }) }];
    }
    const m = missing.get(id);
    return m ? [{ label, full, none: `Ikke tilgjengelig · ${MISSING[m.reason]}` }] : [];
  });
}

/** Horizontal bars, one hue; a light band per row marks the distance that still gives full score for that service. */
function servicesSvg(rows: ServiceRow[]): string {
  const LW = 170, PW = 340, VW = 162, RH = 42, W = LW + PW + VW, top = 4;
  const far = Math.max(1000, ...rows.map((r) => r.m ?? 0), ...rows.map((r) => r.full));
  const cap = 3000;
  const max = Math.min(cap, Math.ceil(far / 500) * 500);
  const step = max > 2000 ? 1000 : 500;
  const x = (m: number) => LW + (Math.min(m, max) / max) * PW;
  const H = top + rows.length * RH;
  const grid = Array.from({ length: max / step + 1 }, (_, i) => i * step).map((v) =>
    `<line x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${top}" y2="${H}" stroke="${C.line}" stroke-width="0.8"/>` +
    `<text x="${x(v).toFixed(1)}" y="${H + 13}" text-anchor="${v === 0 ? "start" : v === max ? "end" : "middle"}" class="tick">${v === 0 ? "0" : metresText(v)}</text>`).join("");
  const body = rows.map((r, i) => {
    const y = top + i * RH, mid = y + RH / 2;
    const band = `<rect x="${LW}" y="${y + 6}" width="${(x(r.full) - LW).toFixed(1)}" height="${RH - 12}" fill="${C.good}" fill-opacity="0.13"/>`;
    const label = `<text x="0" y="${r.name ? mid - 2 : mid + 4}" class="svc">${esc(r.label)}</text>` +
      (r.name ? `<text x="0" y="${mid + 11}" class="svc-name">${esc(r.name.length > 32 ? `${r.name.slice(0, 31)}…` : r.name)}</text>` : "");
    const rule = `<line x1="0" x2="${W}" y1="${y + RH}" y2="${y + RH}" stroke="${C.line}" stroke-width="0.8"/>`;
    if (r.m == null) {
      return `${rule}${band}${label}<text x="${LW + 6}" y="${mid + 3.5}" class="svc-none">${esc(r.none ?? "")}</text>`;
    }
    const w = Math.max(x(r.m) - LW, 2), over = r.m > max;
    const bar = `<path d="M${LW} ${mid - 5}h${(w - 2).toFixed(1)}a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-${(w - 2).toFixed(1)}z" fill="${C.navy}"><title>${esc(r.label)}: ${metresText(r.m)} i luftlinje, ca. ${walkMin(r.m)} min å gå</title></path>` +
      (over ? `<path d="M${LW + PW + 3} ${mid - 5}l6 5l-6 5z" fill="${C.navy}"/>` : "");
    const value = `<text x="${LW + PW + 16}" y="${mid - 1}" class="svc-m">${metresText(r.m)}</text><text x="${LW + PW + 16}" y="${mid + 12}" class="svc-walk">ca. ${walkMin(r.m)} min å gå</text>`;
    return `${rule}${band}${label}${bar}${value}`;
  }).join("");
  return `<svg class="services" viewBox="0 0 ${W} ${H + 18}" width="100%" role="img" aria-label="Avstand i luftlinje til nærmeste holdeplass, butikk, barnehage, skole, lege og apotek">${grid}${body}</svg>`;
}

function servicesSection(p: Profile): string {
  const head = `<p class="kicker">Del 3</p><h2>Nærmiljø</h2><h3>Hverdagen rundt adressen</h3>`;
  const rows = serviceRows(p);
  if (!rows.length) return `${head}<p class="note">Ingen tjenestedata for denne adressen.</p>`;
  const found = rows.filter((r) => r.m != null);
  const near = found.filter((r) => r.m! <= 800); // about 10 minutes on foot
  const lead = found.length
    ? `${near.length} av ${rows.length} er innen ca. 10 minutters gange (800 m i luftlinje).${near.length && near.length < found.length ? ` Lengst unna: ${found.reduce((a, b) => (b.m! > a.m! ? b : a)).label.toLowerCase()}.` : ""}`
    : "Ingen av tjenestene er funnet i nærheten.";
  return `${head}
  <p class="lead">Avstand til nærmeste holdeplass, dagligvarebutikk, barnehage, grunnskole, legekontor og apotek. ${esc(lead)}</p>
  ${servicesSvg(rows)}
  <p class="legend"><i style="background:${C.navy}"></i>Avstand i luftlinje <i style="background:${C.good};opacity:.3"></i>Så nær at det gir full poengsum for tjenesten</p>
  <p class="note">Gangtid er regnet med 5 km/t på luftlinjen; den faktiske gangveien er som regel lengre. Lengre enn ${metresText(3000)} vises med pil. Kilder: Entur (holdeplasser), Utdanningsdirektoratet (skoler og barnehager), OpenStreetMap-bidragsytere (butikk, apotek, lege; ODbL).</p>`;
}

// ---------- Shared by the hazard, noise and sun pages ----------

/** Where the address is, for the "how common is this here" numbers (zones.ts). */
interface Place { lng: number; lat: number; kommune: string; kommuneName: string; grunnkrets?: string; grunnkretsName?: string }

const pctText = (x: number) =>
  x === 0 ? "0 %" : x < 0.1 ? "under 0,1 %" : `${(x < 10 ? Math.round(x * 10) / 10 : Math.round(x)).toString().replace(".", ",")} %`;
const roundM = (m: number) => (m < 100 ? Math.max(5, Math.round(m / 5) * 5) : m < 1000 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50);
const distText = (m: number) => { const r = roundM(m); return r < 1000 ? `ca. ${r} m` : `ca. ${KM.format(r / 1000)} km`; };
/** "a, b og c" */
const listNo = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} og ${xs[xs.length - 1]}`);
/** "Bærum 2,3 % · krets 0 %" */
const sharesText = (s: AreaShares | undefined, place: Place) =>
  s?.kommune ? [`${place.kommuneName} ${pctText(s.kommune.percent)}`, ...(s.grunnkrets ? [`krets ${pctText(s.grunnkrets.percent)}`] : [])].join(" · ") : "";

async function sharesFor(sources: ZoneSource[], place: Place): Promise<AreaShares | undefined> {
  try {
    return await addressShares(sources, place.kommune, place.grunnkrets);
  } catch (err) {
    console.error(`report: address shares for ${sources.map((s) => s.table).join("+")} failed:`, (err as Error).message);
    return undefined;
  }
}

const readings = (p: Profile) => new Map(p.categories.flatMap((c) => c.dataPoints).map((d) => [d.id, d]));
const missings = (p: Profile) => new Map(p.categories.flatMap((c) => c.missing).map((d) => [d.id, d]));

// ---------- Distance to hazard zones (Del 2) ----------

const LADDER: { id: string; label: string }[] = [
  { id: "quickClay", label: "Kvikkleire (faresone)" }, { id: "quickClayAwareness", label: "Kvikkleire (aktsomhet)" },
  { id: "flood200", label: "Flom (200-årssone)" }, { id: "floodAwareness", label: "Flom (aktsomhet)" },
  { id: "rockfall", label: "Steinsprang" }, { id: "debrisFlow", label: "Jord- og flomskred" },
  { id: "avalanche", label: "Snøskred" }, { id: "stormSurge", label: "Stormflo (i dag)" },
];
const LADDER_FAR_M = 2000;
/** Evenly spaced ticks: the scale is stretched near the property, where a few metres matter most. */
const LADDER_TICKS = [0, 50, 100, 250, 500, 1000, 2000];

type LadderState = "inside" | "outside" | "far" | "notMapped" | "missing" | "other";
interface LadderRow {
  id: string; label: string; state: LadderState; text: string;
  distanceM?: number; note?: string; severity?: Severity; shares?: AreaShares;
}

async function hazardLadder(p: Profile, place: Place): Promise<LadderRow[]> {
  const points = readings(p), missing = missings(p);
  const rows: LadderRow[] = [];
  for (const { id, label } of LADDER) {
    const dp = DATA_POINTS.find((d) => d.id === id);
    if (!dp) continue;
    const base = { id, label };
    const r = points.get(id);
    if (!r) {
      const m = missing.get(id);
      if (m) rows.push({ ...base, state: "missing", text: MISSING[m.reason] });
      continue;
    }
    const src: ZoneSource = { table: dp.table, ...(dp.near?.where && { where: dp.near.where }) };
    const shares = await sharesFor([src], place);
    const row = { ...base, ...(shares && { shares }) };
    const future = id === "stormSurge" && r.value === 2100; // outside today's zone, inside the 2100 one
    if (r.value === "ikkeKartlagt") rows.push({ ...row, state: "notMapped", text: "Ikke kartlagt her" });
    else if (r.effect === "bad" && !future) rows.push({ ...row, state: "inside", text: "Innenfor", ...(r.warning && { severity: r.warning.severity }) });
    else if (r.effect === "good" || future) {
      const d = await nearestZoneM(src, place.lng, place.lat, LADDER_FAR_M);
      const note = future ? "i 2100-sonen med havnivåstigning" : undefined;
      rows.push(d == null
        ? { ...row, state: "far", text: "Over 2 km unna", ...(note && { note }) }
        : { ...row, state: "outside", distanceM: d, text: `${distText(d)} unna`, ...(note && { note }) });
    } else rows.push({ ...row, state: "other", text: r.display });
  }
  return rows;
}

const HATCH = `<pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fff"/><line x1="0" y1="0" x2="0" y2="5" stroke="${C.unknown}" stroke-width="1.4"/></pattern>`;

function ladderSvg(rows: LadderRow[], place: Place): string {
  const LW = 136, PW = 270, TX = LW + PW + 20, W = 672, RH = 33, top = 20, bh = 12;
  const n = LADDER_TICKS.length - 1;
  const x = (d: number) => {
    const m = Math.min(Math.max(d, 0), LADDER_FAR_M);
    let i = 0;
    while (i < n - 1 && m > LADDER_TICKS[i + 1]) i++;
    return LW + (PW * (i + (m - LADDER_TICKS[i]) / (LADDER_TICKS[i + 1] - LADDER_TICKS[i]))) / n;
  };
  const H = top + rows.length * RH;
  const grid = LADDER_TICKS.map((t) => `<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${top}" y2="${H}" stroke="${C.line}" stroke-width="0.8"/>` +
    (t ? `<text x="${x(t).toFixed(1)}" y="${top - 6}" text-anchor="${t === LADDER_FAR_M ? "end" : "middle"}" class="tick">${t < 1000 ? `${t} m` : `${t / 1000} km`}</text>` : "")).join("");
  const body = rows.map((r, i) => {
    const y = top + i * RH, mid = y + RH / 2, y0 = mid - bh / 2;
    let track = `<line x1="${LW}" x2="${LW + PW}" y1="${mid}" y2="${mid}" stroke="${C.line}" stroke-width="1.2"/>`;
    if (r.state === "inside") {
      const hot = r.severity === "high" ? C.bad : C.warn;
      track += `<rect x="${LW}" y="${y0}" width="${PW}" height="${bh}" fill="${hot}" fill-opacity="${r.severity === "high" || r.severity === "medium" ? 0.55 : 0.35}"><title>${esc(r.label)}: eiendommen ligger i sonen</title></rect>`;
    } else if (r.state === "outside") {
      const x0 = x(r.distanceM!);
      track += `<rect x="${x0.toFixed(1)}" y="${y0}" width="${(LW + PW - x0).toFixed(1)}" height="${bh}" fill="${C.navy}" fill-opacity="0.18"/>` +
        `<line x1="${x0.toFixed(1)}" x2="${x0.toFixed(1)}" y1="${y0 - 2}" y2="${y0 + bh + 2}" stroke="${C.navy}" stroke-width="2.5"><title>${esc(r.label)}: ${esc(r.text)}</title></line>`;
    } else if (r.state === "far") {
      track += `<path d="M${LW + PW + 2} ${mid - 4}l6 4l-6 4z" fill="${C.muted}"/>`;
    } else if (r.state === "notMapped") {
      track = `<rect x="${LW}" y="${y0}" width="${PW}" height="${bh}" fill="url(#hatch)" opacity="0.7"/>`;
    }
    const sev = r.state === "inside" && r.severity ? ` · ${SEVERITY[r.severity].word.toLowerCase()}` : "";
    const second = [r.note, r.shares ? `I sonen: ${sharesText(r.shares, place)}` : ""].filter(Boolean).join(" · ");
    return `<line x1="0" x2="${W}" y1="${y + RH}" y2="${y + RH}" stroke="${C.line}" stroke-width="0.8"/>
      <text x="0" y="${mid + 3.5}" class="lad-label">${esc(r.label)}</text>${track}
      <text x="${TX}" y="${second ? mid - 2 : mid + 3.5}" class="lad-status">${esc(r.text)}${esc(sev)}</text>
      ${second ? `<text x="${TX}" y="${mid + 9.5}" class="lad-sub">${esc(second)}</text>` : ""}`;
  }).join("");
  const me = `<line x1="${LW}" x2="${LW}" y1="${top - 3}" y2="${H}" stroke="${C.orange}" stroke-width="2.5"/><text x="${LW}" y="${top - 6}" text-anchor="middle" class="tick me">Eiendommen</text>`;
  return `<svg class="ladder" viewBox="0 0 ${W} ${H + 4}" width="100%" role="img" aria-label="Avstand fra eiendommen til nærmeste faresone av hver type"><defs>${HATCH}</defs>${grid}${body}${me}</svg>`;
}
function ladderSection(rows: LadderRow[], place: Place): string {
  if (!rows.length) return "";
  const inside = rows.filter((r) => r.state === "inside");
  const closest = rows.filter((r) => r.state === "outside").sort((a, b) => a.distanceM! - b.distanceM!)[0];
  const verdict = inside.length
    ? `Eiendommen ligger i ${inside.length === 1 ? "én" : inside.length} av ${rows.length} sonetyper: ${listNo(inside.map((r) => r.label.toLowerCase()))}.`
    : "Eiendommen ligger ikke i noen av sonene.";
  const close = closest ? ` Nærmeste sone utenfor: ${closest.label.toLowerCase()}, ${closest.text}.` : "";
  return `<div class="keep"><h3>Avstand til faresoner</h3>
  <p class="lead">Hvor langt det er i luftlinje fra eiendommen til kanten av nærmeste kartlagte sone av hver type, og hvor stor andel av gateadressene i ${esc(place.kommuneName)}${place.grunnkrets ? " og i grunnkretsen" : ""} som ligger i en slik sone. ${esc(verdict + close)}</p>
  ${ladderSvg(rows, place)}
  <p class="legend"><span class="swatch" style="background:${C.orange};height:3mm;width:2px"></span>Eiendommen <i style="background:${C.bad};opacity:.55"></i><i style="background:${C.warn};opacity:.5;margin-left:0"></i>Eiendommen ligger i sonen (rød: alvorlig) <i style="background:${C.navy};opacity:.25"></i>Sonen begynner her <i class="hatched"></i>Ikke kartlagt</p>
  <p class="note">Skalaen er strukket nær eiendommen, der få meter betyr mest. «Ikke kartlagt» betyr at NVE ikke har vurdert området; det er ikke det samme som trygt. Andelene er regnet fra Kartverkets adresseregister mot de samme sonene.</p></div>`;
}

// ---------- Noise (Del 4) ----------

interface NoiseDef {
  id: string; label: string; sub: string; yellow: number; red: number; who: number;
  zone: ZoneSource; redZone: ZoneSource; zoneWord: string; redWord: string;
}
/** Zone limits from T-1442 (Lden): road 55/65, rail 58/68, aircraft 52/62. WHO 2018 guideline values: 53, 54, 45 dB. */
const NOISE: NoiseDef[] = [
  { id: "roadNoise", label: "Vei", sub: "Riks- og fylkesvei (T-1442)", yellow: 55, red: 65, who: 53,
    zone: { table: "veistoy" }, redZone: { table: "veistoy", where: "lower(stoysone) LIKE 'r%'" }, zoneWord: "Gul sone", redWord: "Rød sone" },
  { id: "roadNoiseStrategic", label: "Vei, alle veier", sub: "Strategisk støykart 2021", yellow: 55, red: 65, who: 53,
    zone: { table: "stoy_strategisk", where: "lden >= 55" }, redZone: { table: "stoy_strategisk", where: "lden >= 65" }, zoneWord: "55 dB-sone", redWord: "65 dB-sone" },
  { id: "railNoise", label: "Jernbane", sub: "Bane NOR (ikke T-bane og trikk)", yellow: 58, red: 68, who: 54,
    zone: { table: "banestoy" }, redZone: { table: "banestoy", where: "stoysone = 'rød'" }, zoneWord: "Gul sone", redWord: "Rød sone" },
  { id: "aircraftNoise", label: "Fly", sub: "Avinor (Gardermoen)", yellow: 52, red: 62, who: 45,
    zone: { table: "flystoy" }, redZone: { table: "flystoy", where: "stoysone = 'rød'" }, zoneWord: "Gul sone", redWord: "Rød sone" },
];
const NOISE_NEAR_M = 1000;

type NoiseState = "red" | "yellow" | "below" | "none" | "unknown";
interface NoiseRow extends NoiseDef { state: NoiseState; level?: [number, number]; below?: number; text: string; detail?: string; shares?: AreaShares }

async function noiseRows(p: Profile, place: Place): Promise<NoiseRow[]> {
  const points = readings(p), missing = missings(p);
  const oslo = place.kommune === "0301";
  const rows: NoiseRow[] = [];
  for (const def of NOISE) {
    const r = points.get(def.id), m = missing.get(def.id);
    if (!r && !m) continue;
    let row: NoiseRow;
    if (!r) {
      if (def.id === "roadNoiseStrategic" && oslo && m!.reason === "noCoverage") {
        // Oslo is mapped with every road, from 50 dB: no band here means under 50 dB (or a gap in the model).
        row = { ...def, state: "none", below: 50, text: "Under 50 dB i kartet" };
      } else {
        const text = m!.reason !== "noCoverage" ? MISSING[m!.reason]
          : def.id === "roadNoise" ? "Ikke kartlagt i Oslo" : "Ikke beregnet her";
        const detail = m!.reason !== "noCoverage" ? undefined
          : def.id === "roadNoise" ? "Se strategisk støykart under" : "Kartet dekker bare store veier her";
        row = { ...def, state: "unknown", text, ...(detail && { detail }) };
      }
    } else if (def.id === "roadNoiseStrategic") {
      const lden = Number(r.value);
      const state: NoiseState = lden >= def.red ? "red" : lden >= def.yellow ? "yellow" : "below";
      row = { ...def, state, level: [lden, lden >= 75 ? 80 : lden + 5], text: lden >= 75 ? "Over 75 dB" : `${lden}–${lden + 5} dB` };
    } else if (r.value === "rød") {
      row = { ...def, state: "red", level: [def.red, 80], text: `Rød sone · over ${def.red} dB` };
    } else if (r.value === "gul") {
      row = { ...def, state: "yellow", level: [def.yellow, def.red], text: `Gul sone · ${def.yellow}–${def.red} dB` };
    } else {
      row = { ...def, state: "none", below: def.yellow, text: `Ikke i støysone · under ${def.yellow} dB` };
    }
    // How close is the next, louder zone?
    if (row.state === "none" || row.state === "below" || row.state === "yellow") {
      const target = row.state === "yellow" ? def.redZone : def.zone;
      const word = row.state === "yellow" ? def.redWord : def.zoneWord;
      const d = await nearestZoneM(target, place.lng, place.lat, NOISE_NEAR_M).catch(() => undefined);
      row.detail = d == null ? `Ingen ${word.toLowerCase()} innen 1 km` : `${word} ${distText(d)} unna`;
    }
    // Shares only where the map covers the whole kommune: T-1442 road noise outside Oslo, the strategic map in Oslo.
    const covered = def.id === "roadNoise" ? !oslo : def.id === "roadNoiseStrategic" ? oslo : true;
    if (covered && row.state !== "unknown") {
      const shares = await sharesFor([def.zone], place);
      if (shares) row.shares = shares;
    }
    rows.push(row);
  }
  return rows;
}

function noiseSvg(rows: NoiseRow[], place: Place): string {
  const LW = 136, PW = 280, TX = LW + PW + 20, W = 672, RH = 44, top = 4, lo = 40, hi = 80, th = 16;
  const x = (db: number) => LW + ((Math.max(lo, Math.min(hi, db)) - lo) / (hi - lo)) * PW;
  const H = top + rows.length * RH;
  const grid = [40, 50, 60, 70, 80].map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${H}" stroke="${C.line}" stroke-width="0.8"/>` +
    `<text x="${x(v)}" y="${H + 12}" text-anchor="${v === lo ? "start" : v === hi ? "end" : "middle"}" class="tick">${v} dB</text>`).join("");
  const body = rows.map((r, i) => {
    const y = top + i * RH, mid = y + RH / 2, t0 = mid - th / 2;
    let track = `<rect x="${LW}" y="${t0}" width="${PW}" height="${th}" fill="${C.line}" fill-opacity="0.45"/>`;
    if (r.state !== "unknown") {
      track += `<rect x="${x(r.yellow)}" y="${t0}" width="${x(r.red) - x(r.yellow)}" height="${th}" fill="${C.warn}" fill-opacity="0.32"/>` +
        `<rect x="${x(r.red)}" y="${t0}" width="${x(hi) - x(r.red)}" height="${th}" fill="${C.bad}" fill-opacity="0.26"/>` +
        `<line x1="${x(r.who)}" x2="${x(r.who)}" y1="${t0 - 3}" y2="${t0 + th + 3}" stroke="${C.ink}" stroke-width="1" stroke-dasharray="2 1.5"><title>WHO anbefaler under ${r.who} dB</title></line>`;
      if (r.level) {
        const [a, b] = r.level;
        track += `<rect x="${x(a)}" y="${mid - 4}" width="${Math.max(x(b) - x(a), 3)}" height="8" rx="2" fill="${C.navy}"><title>${esc(r.label)}: ${esc(r.text)}</title></rect>` +
          (b >= hi && (r.state === "red") ? `<path d="M${x(hi) + 3} ${mid - 4}l6 4l-6 4z" fill="${C.navy}"/>` : "");
      } else if (r.below != null) {
        track += `<rect x="${x(lo) + 0.6}" y="${mid - 4}" width="${x(r.below) - x(lo) - 1.2}" height="8" rx="2" fill="#fff" stroke="${C.navy}" stroke-width="1.2"><title>${esc(r.label)}: ${esc(r.text)}</title></rect>`;
      }
    } else {
      track += `<text x="${LW + PW / 2}" y="${mid + 3}" text-anchor="middle" class="n-unknown">${esc(r.text)}</text>`;
    }
    const lines = [r.state === "unknown" ? "" : r.text, r.detail ?? "", r.shares ? `Adresser i sone: ${sharesText(r.shares, place)}` : ""].filter(Boolean);
    const ys = lines.length === 1 ? [mid + 3.5] : lines.length === 2 ? [mid - 2, mid + 9.5] : [mid - 8, mid + 3, mid + 13.5];
    const text = lines.map((l, j) => `<text x="${TX}" y="${ys[j]}" class="${j === 0 && r.state !== "unknown" ? "lad-status" : "lad-sub"}">${esc(l)}</text>`).join("");
    return `<line x1="0" x2="${W}" y1="${y + RH}" y2="${y + RH}" stroke="${C.line}" stroke-width="0.8"/>
      <text x="0" y="${mid - 1}" class="lad-label">${esc(r.label)}</text><text x="0" y="${mid + 10}" class="lad-sub">${esc(r.sub)}</text>${track}${text}`;
  }).join("");
  return `<svg class="noise" viewBox="0 0 ${W} ${H + 16}" width="100%" role="img" aria-label="Støynivå ved eiendommen fra vei, jernbane og fly, i dB Lden">${grid}${body}</svg>`;
}

interface NoiseMap { yellow: string; red: string; strategic: boolean; sources: string[] }

/** Noise zones in the map frame: T-1442 road, rail and aircraft zones; where no road zone is drawn, the strategic map (55/65 dB). */
async function noiseMap(f: Frame): Promise<NoiseMap> {
  const loaded = await loadedTables();
  const yellow: string[] = [], red: string[] = [], sources = new Set<string>();
  const add = async (table: string, y: string, r: string, source: string) => {
    if (!loaded.has(table)) return false;
    const [a, b] = [await zonePath(f, table, y), await zonePath(f, table, r)];
    if (a) yellow.push(a);
    if (b) red.push(b);
    if (a || b) sources.add(source);
    return Boolean(a || b);
  };
  const road = await add("veistoy", "NOT lower(stoysone) LIKE 'r%'", "lower(stoysone) LIKE 'r%'", "Statens vegvesen");
  const strategic = !road && (await add("stoy_strategisk", "lden >= 55 AND lden < 65", "lden >= 65", "Statens vegvesen (strategisk støykart)"));
  await add("banestoy", "stoysone = 'gul'", "stoysone = 'rød'", "Bane NOR");
  await add("flystoy", "stoysone = 'gul'", "stoysone = 'rød'", "Avinor");
  return { yellow: yellow.join(" "), red: red.join(" "), strategic, sources: [...sources] };
}

function noiseStats(rows: NoiseRow[], place: Place): string {
  const withShares = rows.filter((r) => r.shares?.kommune);
  if (!withShares.length) return "";
  const cell = (s?: Share) => (s ? `<div class="mbar"><i style="width:${Math.min(100, Math.max(s.percent, s.percent ? 1 : 0))}%"></i></div><b>${pctText(s.percent)}</b>` : `<span class="muted">–</span>`);
  const n = withShares[0].shares!;
  return `<h3 class="mini">Hvor vanlig er støysone her?</h3>
  <table class="plain nstats"><thead><tr><th>Kilde</th><th>Grunnkretsen${place.grunnkretsName ? ` ${esc(place.grunnkretsName)}` : ""}</th><th>${esc(place.kommuneName)}</th></tr></thead>
  <tbody>${withShares.map((r) => `<tr><td>${esc(r.label)}</td><td>${cell(r.shares!.grunnkrets)}</td><td>${cell(r.shares!.kommune)}</td></tr>`).join("")}</tbody></table>
  <p class="note">Andel av gateadressene som ligger i gul eller rød sone (strategisk kart: 55 dB eller mer)${n.grunnkrets ? `, av ${n.grunnkrets.addresses.toLocaleString("nb-NO")} adresser i grunnkretsen` : ""} og ${n.kommune!.addresses.toLocaleString("nb-NO")} i kommunen.</p>`;
}

const NOISE_FRAME = (lng: number, lat: number) => frame(lng, lat, 16, 672, 300);
/** Low enough that the map and the distance chart share one page. */
const HAZARD_FRAME = (lng: number, lat: number) => frame(lng, lat, 15, 672, 330);

function noiseSection(rows: NoiseRow[], nm: NoiseMap | undefined, place: Place): string {
  const head = `<p class="kicker">Del 4</p><h2>Støy</h2>`;
  if (!rows.length) return `${head}<p class="note">Ingen støydata for denne adressen.</p>`;
  // The strategic map repeats the road zones outside Oslo: name it only when the T-1442 road row is quiet or unknown.
  const roadLoud = rows.some((r) => r.id === "roadNoise" && (r.state === "red" || r.state === "yellow"));
  const loud = rows.filter((r) => (r.state === "red" || r.state === "yellow") && !(r.id === "roadNoiseStrategic" && roadLoud));
  const say = (r: NoiseRow) => r.id === "roadNoiseStrategic" ? `veistøy på ${r.text}` : `${r.state === "red" ? "rød" : "gul"} støysone fra ${r.label.toLowerCase()}`;
  let verdict: string;
  if (loud.length) {
    const worst = loud.find((r) => r.state === "red") ?? loud[0];
    const common = worst.shares?.kommune ? ` Det gjelder ${pctText(worst.shares.kommune.percent)} av gateadressene i ${place.kommuneName}${worst.shares.grunnkrets ? ` og ${pctText(worst.shares.grunnkrets.percent)} i grunnkretsen` : ""}.` : "";
    verdict = `Eiendommen har ${listNo(loud.map(say))}.${common}`;
  } else {
    verdict = "Eiendommen ligger ikke i noen kartlagt støysone fra vei, jernbane eller fly.";
  }
  const f = NOISE_FRAME(place.lng, place.lat);
  const overlay = nm ? `<path d="${nm.yellow}" fill="${C.warn}" fill-opacity="0.38" stroke="${C.warn}" stroke-width="0.8"/><path d="${nm.red}" fill="${C.bad}" fill-opacity="0.38" stroke="${C.bad}" stroke-width="0.8"/>` : "";
  const mapLegend = nm && (nm.yellow || nm.red)
    ? `<i style="background:${C.warn};opacity:.6"></i>Gul sone <i style="background:${C.bad};opacity:.6"></i>Rød sone${nm.strategic ? " (veistøy fra strategisk støykart: gul = 55–65 dB, rød = over 65 dB)" : ""} <span>Kilder: ${esc(nm.sources.join(", "))}</span>`
    : "Ingen støysoner i kartutsnittet.";
  return `${head}
  <p class="lead">Støynivå ved eiendommen etter de offentlige støykartene, som Lden: et døgnmiddel der kveld og natt teller ekstra. ${esc(verdict)}</p>
  ${noiseSvg(rows, place)}
  <p class="legend"><i style="background:${C.navy}"></i>Nivå ved eiendommen <i class="outline"></i>Under sonegrensen <i style="background:${C.warn};opacity:.5"></i>Gul sone <i style="background:${C.bad};opacity:.45"></i>Rød sone <span class="who-swatch"></span>WHO-anbefaling</p>
  ${map(f, "topograatone", place.lng, place.lat, overlay, nm?.sources.map((x) => x.replace(/ \(.*\)$/, "")).filter((x, i, xs) => xs.indexOf(x) === i).join(", "))}
  <p class="legend">${mapLegend} <span class="pin-legend">${PIN}</span>Eiendommen</p>
  ${noiseStats(rows, place)}
  <p class="note">Gul sone: boliger kan bygges med støytiltak. Rød sone: ikke egnet for nye boliger (retningslinje T-1442). 10 dB mer oppleves omtrent som dobbelt så høyt. Nivåene er beregnet utendørs ved fasaden, ikke inne. WHO anbefaler under 53 dB fra vei, 54 dB fra jernbane og 45 dB fra fly (2018). Kilder: Statens vegvesen, Bane NOR, Avinor.</p>`;
}

// ---------- Sun and daylight (Del 5) ----------

/** Categorical, checked with the dataviz validator (direct labels carry identity too). */
const SUN_DAYS = [
  { key: "winter" as const, label: "21. des", date: [2025, 11, 21] as const, colour: "#2a78d6" },
  { key: "summer" as const, label: "21. juni", date: [2025, 5, 21] as const, colour: "#eb6834" },
  { key: "equinox" as const, label: "20. mars", date: [2025, 2, 20] as const, colour: "#1baf7a" },
];
const TERRAIN = "#bfb5a3";
const MONTHS = ["jan", "feb", "mar", "apr", "mai", "jun", "jul", "aug", "sep", "okt", "nov", "des"];
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}. ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const h1 = (min: number) => (Math.round(min / 6) / 10).toFixed(1).replace(".", ",");

function sunPathSvg(y: SunYear, lat: number, lng: number): string {
  const W = 672, H = 250, ml = 30, mr = 6, mt = 10, mb = 20, pw = W - ml - mr, ph = H - mt - mb, maxEl = 60;
  const X = (az: number) => ml + (az / 360) * pw;
  const Y = (el: number) => mt + ph * (1 - Math.max(-2, el) / maxEl);
  const flat = y.horizon.source === "flat";
  const grid = [0, 10, 20, 30, 40, 50, 60].map((v) => `<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v ? C.line : C.ink}" stroke-width="${v ? 0.8 : 1}"/><text x="${ml - 4}" y="${Y(v) + 3}" text-anchor="end" class="tick">${v}°</text>`).join("") +
    ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV", "N"].map((d, i) => `<line x1="${X(i * 45)}" x2="${X(i * 45)}" y1="${mt}" y2="${mt + ph}" stroke="${C.line}" stroke-width="0.8"/><text x="${X(i * 45)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === 8 ? "end" : "middle"}" class="tick${i % 2 ? "" : " main"}">${d}</text>`).join("");
  let terrain = "";
  if (!flat) {
    const pts = Array.from({ length: 361 }, (_, az) => `${X(az).toFixed(1)} ${Y(horizonAt(y.horizon, az)).toFixed(1)}`);
    terrain = `<path d="M${X(0)} ${Y(0)}L${pts.join("L")}L${X(360)} ${Y(0)}Z" fill="${TERRAIN}" fill-opacity="0.75" stroke="#8c826f" stroke-width="0.8"><title>Terrenghorisont</title></path>`;
  }
  const curves = SUN_DAYS.map((d) => {
    const pts = sunPath(d.date[0], d.date[1], d.date[2], lat, lng, 5);
    const vis = pts.map((p) => sunAbove(p, flat ? 0 : Math.max(0, horizonAt(y.horizon, p.azimuth))));
    const segs: string[] = [];
    let start = 0;
    for (let i = 1; i <= pts.length; i++) {
      if (i === pts.length || vis[i] !== vis[start]) {
        const seg = pts.slice(start, Math.min(i + 1, pts.length)).map((p, j) => `${j ? "L" : "M"}${X(p.azimuth).toFixed(1)} ${Y(p.elevation).toFixed(1)}`).join("");
        segs.push(vis[start]
          ? `<path d="${seg}" fill="none" stroke="${d.colour}" stroke-width="2.4" stroke-linejoin="round"/>`
          : `<path d="${seg}" fill="none" stroke="${d.colour}" stroke-width="1.3" stroke-dasharray="3 2.5" opacity="0.75"/>`);
        start = i;
      }
    }
    const every = d.key === "winter" ? 1 : 2;
    const hours = pts.filter((p) => p.min % 60 === 0 && p.elevation > 0.5);
    const dots = hours.map((p) => `<circle cx="${X(p.azimuth).toFixed(1)}" cy="${Y(p.elevation).toFixed(1)}" r="2.6" fill="${d.colour}" stroke="#fff" stroke-width="1"><title>${d.label} kl. ${clock(p.min)}: ${p.elevation.toFixed(0)}° over horisonten, mot ${compassWord(p.azimuth)}</title></circle>`).join("");
    const labels = d.key === "equinox" ? "" : hours.filter((p) => (p.min / 60) % every === 0).map((p) =>
      `<text x="${X(p.azimuth).toFixed(1)}" y="${(Y(p.elevation) - 5).toFixed(1)}" text-anchor="middle" class="hour">${p.min / 60}</text>`).join("");
    const peak = pts.reduce((a, b) => (b.elevation > a.elevation ? b : a));
    const ny = Y(peak.elevation) - (d.key === "equinox" ? 8 : 17);
    const name = `<line x1="${X(peak.azimuth) - 30}" x2="${X(peak.azimuth) - 18}" y1="${ny - 3}" y2="${ny - 3}" stroke="${d.colour}" stroke-width="2.4"/><text x="${X(peak.azimuth) - 15}" y="${ny}" class="curve">${d.label}</text>`;
    return segs.join("") + dots + labels + name;
  }).join("");
  return `<svg class="sunpath" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Solbane over terrenghorisonten ved eiendommen for 21. desember, 20. mars og 21. juni">
    <defs><clipPath id="sunclip"><rect x="${ml}" y="0" width="${pw}" height="${mt + ph}"/></clipPath></defs>
    ${grid}<g clip-path="url(#sunclip)">${terrain}${curves}</g></svg>`;
}

function sunMonthsSvg(y: SunYear): string {
  const W = 672, H = 158, ml = 30, mr = 6, mt = 6, mb = 46, pw = W - ml - mr, ph = H - mt - mb, max = 20 * 60;
  const flat = y.horizon.source === "flat";
  const Y = (min: number) => mt + ph * (1 - min / max);
  const bw = pw / 12, base = Y(0);
  const grid = [0, 6, 12, 18].map((h) => `<line x1="${ml}" x2="${W - mr}" y1="${Y(h * 60)}" y2="${Y(h * 60)}" stroke="${h ? C.line : C.ink}" stroke-width="${h ? 0.8 : 1}"/><text x="${ml - 4}" y="${Y(h * 60) + 3}" text-anchor="end" class="tick">${h} t</text>`).join("");
  const bars = y.months.map((d, i) => {
    const cx = ml + (i + 0.5) * bw;
    const day = `<rect x="${(cx - bw * 0.31).toFixed(1)}" y="${Y(d.flatMin).toFixed(1)}" width="${(bw * 0.62).toFixed(1)}" height="${(base - Y(d.flatMin)).toFixed(1)}" fill="${C.line}"><title>15. ${MONTHS[i]}: dagen er ${hoursMin(d.flatMin)}</title></rect>`;
    const sun = flat ? "" : `<path d="M${(cx - bw * 0.17).toFixed(1)} ${base}V${(Y(d.terrainMin) + 2).toFixed(1)}a2 2 0 0 1 2 -2h${(bw * 0.34 - 4).toFixed(1)}a2 2 0 0 1 2 2V${base}Z" fill="#eb6834"><title>15. ${MONTHS[i]}: mulig direkte sol ${hoursMin(d.terrainMin)}</title></path>`;
    const txt = `<text x="${cx.toFixed(1)}" y="${base + 12}" text-anchor="middle" class="tick main">${MONTHS[i]}</text>` +
      `<text x="${cx.toFixed(1)}" y="${base + 25}" text-anchor="middle" class="tick">${h1(d.flatMin)}</text>` +
      (flat ? "" : `<text x="${cx.toFixed(1)}" y="${base + 37}" text-anchor="middle" class="num-sun">${h1(d.terrainMin)}</text>`);
    return day + sun + txt;
  }).join("");
  const rowLabels = `<text x="0" y="${base + 25}" class="tick">Dag</text>${flat ? "" : `<text x="0" y="${base + 37}" class="tick main">Sol</text>`}`;
  return `<svg class="sunmonths" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Dagslengde og mulig direkte sol per måned, i timer">${grid}${bars}${rowLabels}</svg>`;
}

function sunSection(y: SunYear | undefined, place: Place): string {
  const head = `<p class="kicker">Del 5</p><h2>Sol og lys</h2>`;
  if (!y) return `${head}<p class="note">Solberegningen var ikke tilgjengelig.</p>`;
  const flat = y.horizon.source === "flat";
  const w = y.winter, s = y.summer;
  const span = (d: SunDay) => (flat
    ? (d.sunrise != null ? `sola opp ${clock(d.sunrise)}, ned ${clock(d.sunset!)}` : "sola er under horisonten")
    : d.firstSun != null ? `sol ${clock(d.firstSun)}–${clock(d.lastSun!)} · dagen er ${hoursMin(d.flatMin)}` : `ingen direkte sol · dagen er ${hoursMin(d.flatMin)}`);
  const big = (d: SunDay) => (flat ? hoursMin(d.flatMin) : d.terrainMin ? hoursMin(d.terrainMin) : "Ingen sol");
  const tile = (label: string, value: string, sub: string) => `<div class="tile"><p class="label">${esc(label)}</p><p class="big">${esc(value)}</p><p class="sub">${esc(sub)}</p></div>`;
  const fourth = y.noSun
    ? tile("Uten direkte sol", `${y.noSun.days} dager`, `ca. ${dayMonth(y.noSun.from)} – ${dayMonth(y.noSun.to)}: sola når ikke over terrenget`)
    : !flat && y.eveningSunUntil != null
      ? tile("Kveldssol midtsommer", `til ${clock(y.eveningSunUntil)}`, `terrenget er høyest mot ${compassWord(y.highest.azimuth)} (${KM.format(y.highest.height)}°)`)
      : tile("Høyeste sol", `${KM.format(Math.round(s.noonElevation))}°`, `midtsommer, midtvinter ${KM.format(Math.round(w.noonElevation * 10) / 10)}°`);
  let lead: string;
  if (flat) {
    lead = "Terrenghorisonten var ikke tilgjengelig da rapporten ble laget, så tallene gjelder flatt terreng uten åser rundt.";
  } else {
    const lost = w.flatMin - w.terrainMin;
    const winter = w.terrainMin === 0 ? "Midtvinters kommer ikke sola over terrenget her."
      : lost < 10 ? `Terrenget skygger nesten ikke for vintersola: ${hoursMin(w.terrainMin)} mulig sol midtvinters.`
      : `Midtvinters kan sola skinne her i ${hoursMin(w.terrainMin)}, mot ${hoursMin(w.flatMin)} på flatt terreng: åsene rundt tar ${Math.round((100 * lost) / w.flatMin)} %.`;
    const summer = s.firstSun != null ? ` Midtsommers er det mulig sol fra ${clock(s.firstSun)} til ${clock(s.lastSun!)}.` : "";
    const dark = y.noSun ? ` Fra ca. ${dayMonth(y.noSun.from)} til ${dayMonth(y.noSun.to)} (${y.noSun.days} dager) når sola ikke over terrenget i det hele tatt.` : "";
    lead = winter + summer + dark;
  }
  const height = y.horizon.elevationM != null ? ` Eiendommen ligger ca. ${Math.round(y.horizon.elevationM)} moh. i høydemodellen.` : "";
  return `${head}
  <p class="lead">${esc(lead)}</p>
  <div class="tiles">${tile("Midtvinter 21. des", big(w), span(w))}${tile("Jevndøgn 20. mars", big(y.equinox), span(y.equinox))}${tile("Midtsommer 21. juni", big(s), span(s))}${fourth}</div>
  <h3 class="mini">Solbane og terreng</h3>
  <p class="lead">Hvor sola står gjennom dagen (retning og høyde), med terrenget rundt eiendommen. Tallene på kurvene er klokkeslett. Stiplet: sola er bak terrenget.</p>
  ${sunPathSvg(y, place.lat, place.lng)}
  <p class="legend">${SUN_DAYS.map((d) => `<span class="swatch" style="background:${d.colour};height:2.5px;width:5mm"></span>${d.label}`).join(" ")} ${flat ? "" : `<i style="background:${TERRAIN}"></i>Terreng`} <span class="swatch dashed"></span>Bak terrenget</p>
  <h3 class="mini">Gjennom året</h3>
  <p class="lead">Timer per dag den 15. i hver måned: lys stolpe er dagslengden${flat ? "" : ", oransje er mulig direkte sol over terrenget"}.</p>
  ${sunMonthsSvg(y)}
  <p class="note">Mulig direkte sol er tiden sola står over terrenget, uten skyer, bygninger eller trær, som i praksis gir mindre sol. Terrenget er regnet fra en høydemodell (PVGIS, EUs forskningssenter JRC) som fanger åser og daler, ikke nære detaljer.${esc(height)} Solbanen er beregnet med NOAAs formler. Klokkeslett i norsk tid, med sommertid i juni. Kilde: PVGIS © European Union, 2001–2026.</p>`;
}

// ---------- Compared to the area (api/src/area.ts): histogram of the other addresses' scores ----------

/** 10 bars (0-9 ... 90-100), coloured like scores; the address's own score as a line, the median as a tick. */
function histogram(area: Area, score: number | null): string {
  const W = 300, H = 74, gap = 2, bw = W / 10;
  const max = Math.max(...area.histogram, 1);
  const bars = area.histogram.map((n, i) => {
    const h = n ? Math.max((n / max) * H, 1.5) : 0;
    return `<rect x="${(i * bw + gap / 2).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${h.toFixed(1)}" fill="${scoreColour(i * 10 + 5)}" fill-opacity="0.55"/>`;
  }).join("");
  const x = (v: number) => ((Math.min(v, 99.9) / 100) * W).toFixed(1);
  const median = `<line x1="${x(area.medianScore)}" x2="${x(area.medianScore)}" y1="${H}" y2="${H + 5}" stroke="${C.muted}" stroke-width="1.5"/>`;
  const me = score != null
    ? `<line x1="${x(score)}" x2="${x(score)}" y1="0" y2="${H + 5}" stroke="${C.orange}" stroke-width="2.5"/><text x="${x(score)}" y="-3" text-anchor="middle" font-size="9" font-weight="600" fill="${C.ink}">${score}</text>`
    : "";
  const ticks = [0, 50, 100].map((v) => `<text x="${v === 100 ? W : x(v)}" y="${H + 15}" text-anchor="${v === 0 ? "start" : v === 100 ? "end" : "middle"}" font-size="7.5" fill="${C.muted}">${v}</text>`).join("");
  return `<svg class="hist" viewBox="0 -12 ${W} ${H + 30}" width="100%" role="img" aria-label="Fordeling av poeng i ${esc(area.name)}">
    <line x1="0" x2="${W}" y1="${H}" y2="${H}" stroke="${C.ink}" stroke-width="1"/>${bars}${median}${me}${ticks}</svg>`;
}

function areaBlock(kind: string, area: Area, score: number | null): string {
  const n = area.addresses.toLocaleString("nb-NO");
  const where = `${n} adresser i ${kind} ${esc(area.name)}`;
  const pc = area.percentile;
  const line = pc == null ? `${where}.`
    : pc < 3 ? `Lavere enn nesten alle de ${where}.`
    : pc > 97 ? `Høyere enn nesten alle de ${where}.`
    : `Bedre enn ca. <b>${pc} %</b> av ${where}.`;
  return `<div class="area"><p class="area-head"><span class="label">${kind === "grunnkretsen" ? "Grunnkrets" : "Kommune"}</span><br><b>${esc(area.name)}</b></p>
    ${histogram(area, score)}
    <p class="area-line">${line} Median ${area.medianScore}.</p></div>`;
}

function areaSection(cmp: AreaComparison | undefined): string {
  const head = `<h3>Sammenlignet med området</h3>`;
  if (!cmp || (!cmp.grunnkrets && !cmp.kommune)) {
    return `${head}<p class="note">Sammenligning med området er ikke tilgjengelig: poengene for de andre adressene er ikke beregnet ennå.</p>`;
  }
  const blocks = [cmp.grunnkrets && areaBlock("grunnkretsen", cmp.grunnkrets, cmp.score), cmp.kommune && areaBlock("kommunen", cmp.kommune, cmp.score)].filter(Boolean).join("");
  const when = DATE.format(new Date(`${cmp.computedAt}Z`));
  return `${head}<p class="lead">Hvor adressen ligger mot andre gateadresser i samme grunnkrets og kommune, regnet med de samme reglene.</p>
  <div class="areas">${blocks}</div>
  <p class="note"><span class="swatch" style="background:${C.orange}"></span>Denne adressen · <span class="swatch tick"></span>Median.${cmp.score == null ? ` Adressen har ingen samlet poengsum (${esc(cmp.reason ?? "")}), så den er ikke plassert.` : ""} Poengene for de andre adressene er beregnet ${esc(when)}.</p>`;
}

// ---------- The document ----------

const KM = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Oslo" });

interface Extras { place: Place; ladder: LadderRow[]; noise: NoiseRow[]; noiseMap?: NoiseMap; sun?: SunYear }

function render(p: Profile, s: Summary, zones: Zone[], x: Extras, area?: AreaComparison, wind?: WindRose): string {
  const a = p.address;
  const sourceOf = new Map(p.sources.map((x) => [x.id, x]));
  const r = p.rating;
  const ok = r.status === "ok";
  const date = DATE.format(new Date());
  const place = `${a.postcode} ${titleCase(a.place)}`;
  const kommune = `${titleCase(a.municipality)} kommune`;
  const matrikkel = a.gnr != null && a.bnr != null ? `Gnr. ${a.gnr} / Bnr. ${a.bnr}` : "";
  const capped = ok && r.cappedBy?.length;

  const coverMap = frame(a.lng, a.lat, 16, 672, 280);
  const hazardMap = HAZARD_FRAME(a.lng, a.lat);
  const overlay = zones.map((z) => `<path d="${z.path}" fill="${z.colour}" fill-opacity="0.32" stroke="${z.colour}" stroke-width="1.2" fill-rule="evenodd"/>`).join("");

  const present = p.categories.reduce((n, c) => n + c.dataPoints.length, 0);
  const expected = present + p.categories.reduce((n, c) => n + c.missing.length, 0);
  const totalWeight = p.categories.reduce((n, c) => n + c.weight, 0);
  const qs = p.questions.filter((q) => q.dataPointId);
  const always = p.questions.filter((q) => !q.dataPointId);
  const allMissing = p.categories.flatMap((c) => c.missing.map((m) => ({ ...m, category: c.name })));

  const warningRow = (w: Profile["warnings"][number]) => {
    const sev = SEVERITY[w.severity];
    const cat = p.categories.find((c) => c.id === w.categoryId)?.name ?? "";
    return `<li><span class="sev" style="background:${sev.colour}">${sev.word}</span><span class="w-text">${esc(w.text)}</span><span class="w-cat">${esc(cat)}</span></li>`;
  };

  // Common things to check (radon, awareness areas): no severity, never cap the score; say how common they are in the municipality.
  const checkRow = (c: Profile["checks"][number]) => {
    const cat = p.categories.find((x) => x.id === c.categoryId)?.name ?? "";
    const share = c.areaShare ? ` · gjelder ${c.areaShare.percent} % av arealet i ${esc(titleCase(c.areaShare.municipality))}` : "";
    return `<li><span class="sev" style="background:${C.muted}">SJEKK</span><span class="w-text">${esc(c.text)}${share}</span><span class="w-cat">${esc(cat)}</span></li>`;
  };

  const pointRow = (d: PresentDataPoint) => {
    const src = sourceOf.get(d.source);
    return `<div class="dp">
      <div class="dp-head">
        <span class="dot" style="background:${EFFECT[d.effect]}"></span>
        <span class="dp-label">${esc(d.label)}</span>
        <span class="dp-value">${esc(d.display)}</span>
        <span class="dp-score">${d.score != null ? `${bar(d.score, 6)}<b>${d.score}</b>` : `<span class="na">Ikke vurdert</span>`}</span>
      </div>
      ${d.warning ? `<p class="dp-warn" style="border-color:${SEVERITY[d.warning.severity].colour}">${esc(d.warning.text)}</p>` : ""}
      ${d.explanation ? `<p class="dp-expl">${esc(d.explanation)}</p>` : ""}
      <p class="dp-src">Kilde: ${esc(src ? `${src.name}, ${src.owner}` : d.source)}</p>
    </div>`;
  };

  const missingRow = (m: MissingDataPoint) => {
    const src = sourceOf.get(m.source);
    return `<div class="dp missing"><div class="dp-head">
      <span class="dot hollow"></span><span class="dp-label">${esc(m.label)}</span>
      <span class="dp-value">Ikke tilgjengelig · ${MISSING[m.reason]}</span><span class="dp-score"></span></div>
      <p class="dp-src">Kilde: ${esc(src ? `${src.name}, ${src.owner}` : m.source)}</p></div>`;
  };

  const summaryHtml = s.aiGenerated
    ? `<p class="summary">${esc(s.text)}</p><p class="note">AI-generert av ${esc(s.model ?? "Claude")} kun fra faktasetningene i denne rapporten. Kontroller alltid mot datapunktene og kildene.</p>`
    : `<ul class="facts">${s.facts.slice(0, 8).map((f) => `<li>${esc(f.text)}</li>`).join("")}</ul><p class="note">Faktasetninger fra datakildene.</p>`;

  return `<!doctype html><html lang="nb"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=block" rel="stylesheet">
<style>${CSS}</style></head><body>

<!-- ============ 1. Cover ============ -->
<section class="cover">
  <header class="masthead">
    <div class="brand"><img class="logo" src="${LOGO}" alt=""><span>Omnium</span></div>
    <div class="meta"><b>Eiendomsrapport</b><br>${esc(date)}<br><span class="mono">${esc(a.id)}</span></div>
  </header>
  <div class="rule"></div>
  <p class="kicker">Alt offentlig tilgjengelig om eiendommen</p>
  <h1>${esc(a.text)}</h1>
  <p class="sub">${esc(place)} · ${esc(kommune)}${matrikkel ? ` · ${matrikkel}` : ""}</p>
  ${map(coverMap, "topo", a.lng, a.lat)}

  <div class="verdict">
    <div class="big">
      <p class="label">Samlet vurdering</p>
      ${ok ? `<p class="num">${r.score}<small>/100</small></p>` : `<p class="num na">–</p>`}
      <p class="word" style="color:${ok ? scoreColour(r.score!) : C.muted}">${esc(ratingWord(r))}</p>
      ${ok ? scale(r.score!) : `<p class="reason">${esc(r.reason ?? "")}</p>`}
    </div>
    <div class="facts-col">
      ${r.weakestCategory ? `<p><span class="label">Svakeste kategori</span><br><b>${esc(r.weakestCategory.name)}</b> ${r.weakestCategory.score}/100</p>` : ""}
      <p><span class="label">Datagrunnlag</span><br><b>${r.coverage.present} av ${r.coverage.expected}</b> datapunkter funnet</p>
      ${capped ? `<p><span class="label">Begrenset av</span><br>${r.cappedBy!.map((c) => esc(c.text)).join("<br>")}</p>` : ""}
    </div>
  </div>

  ${p.warnings.length ? `<h3 class="mini">Viktigste funn</h3><ul class="warnings">${p.warnings.slice(0, 3).map(warningRow).join("")}</ul>` : `<p class="note">Ingen alvorlige funn i dataene vi har.</p>`}
  <p class="disclaimer">Rapporten samler offentlige data om stedet. Den er ikke en tilstandsrapport, en takst eller en garanti for at en risiko ikke finnes. Data vi ikke har, er oppgitt som manglende.</p>
</section>

<!-- ============ 2. Overview ============ -->
<section class="page">
  <p class="kicker">Del 1</p><h2>Oversikt</h2>
  <h3>Sammendrag</h3>
  ${summaryHtml}

  <h3>Kategorier</h3>
  <table class="cats">
    <thead><tr><th>Kategori</th><th class="r">Vekt</th><th class="barcol">Poeng</th><th class="r">Resultat</th></tr></thead>
    <tbody>${p.categories.map((c) => `<tr>
      <td><b>${esc(c.name)}</b>${c.rating.cappedBy?.length ? `<br><small class="capnote">Begrenset: ${esc(c.rating.cappedBy[0].text)}</small>` : ""}</td>
      <td class="r muted">${c.rating.status === "ok" ? `${Math.round((c.weight / totalWeight) * 100)} %` : "–"}</td>
      <td class="barcol">${c.rating.status === "ok" ? bar(c.rating.score, 10) : `<span class="na">${esc(ratingWord(c.rating))}</span>`}</td>
      <td class="r">${c.rating.status === "ok" ? `<b class="score" style="color:${scoreColour(c.rating.score!)}">${c.rating.score}</b>` : "–"}</td>
    </tr>`).join("")}</tbody>
  </table>

  <h3>Perspektiver</h3>
  <p class="lead">Samme data, vektet for fire ulike behov.</p>
  <div class="persp">${p.perspectives.map((x) => {
    const pr = x.rating;
    const pulls = pr.factors.filter((f) => f.score < 60).slice(0, 3);
    return `<div class="pcard">
      <div class="phead"><span class="pname">${esc(x.name)}</span>${pr.status === "ok" ? `<span class="pscore" style="color:${scoreColour(pr.score!)}">${pr.score}</span>` : `<span class="na">${esc(ratingWord(pr))}</span>`}</div>
      <p class="pq">${esc(x.question)}</p>
      ${pr.status === "ok" ? bar(pr.score, 8) : ""}
      <p class="pull">${pulls.length ? `Trekker ned: ${pulls.map((f) => `${esc(f.label)} (${f.score})`).join(", ")}` : "Ingen datapunkter trekker tydelig ned."}</p>
    </div>`;
  }).join("")}</div>

  ${areaSection(area)}
</section>

<!-- ============ 3. Hazards ============ -->
<section class="page">
  <p class="kicker">Del 2</p><h2>Funn og faresoner</h2>
  <p class="lead">Kartet viser NVEs fare- og aktsomhetssoner rundt eiendommen (ca. ${KM.format((hazardMap.w * 156543 * Math.cos((a.lat * Math.PI) / 180)) / 2 ** hazardMap.z / 1000)} km bredt).</p>
  ${map(hazardMap, "topograatone", a.lng, a.lat, overlay)}
  <p class="legend">${zones.length ? zones.map((z) => `<i style="background:${z.colour};opacity:.6"></i>${esc(z.label)}`).join(" ") : "Ingen fare- eller aktsomhetssoner i kartutsnittet."} <span class="pin-legend">${PIN}</span>Eiendommen</p>

  ${ladderSection(x.ladder, x.place)}

  <h3>Alle funn</h3>
  ${p.warnings.length ? `<ul class="warnings">${p.warnings.map(warningRow).join("")}</ul>` : `<p class="note">Ingen funn som gir advarsel.</p>`}
  ${p.checks.length ? `<h3 class="mini">Sjekk dette</h3><ul class="warnings">${p.checks.map(checkRow).join("")}</ul>` : ""}
  <p class="note">Et funn kommer alltid fra et datapunkt med kilde, aldri fra AI. Alvorlige funn begrenser poengsummen, slik at én stor risiko ikke kan veies opp av gode forhold ellers.</p>
</section>

<!-- ============ 3b. Nearby services ============ -->
<section class="page">
  ${servicesSection(p)}
</section>

<!-- ============ 3c. Noise ============ -->
<section class="page">
  ${noiseSection(x.noise, x.noiseMap, x.place)}
</section>

<!-- ============ 3d. Sun ============ -->
<section class="page">
  ${sunSection(x.sun, x.place)}
</section>

<!-- ============ 3e. Wind ============ -->
<section class="page">
  ${windSection(wind)}
</section>

<!-- ============ 4. Categories ============ -->
<section class="page">
  <p class="kicker">Del 7</p><h2>Detaljer per kategori</h2>
  ${p.categories.map((c) => `<div class="cat">
    <div class="cat-head"><h3>${esc(c.name)}</h3>${scoreBadge(c.rating)}</div>
    <p class="cat-sub">${c.rating.status === "ok" ? esc(ratingWord(c.rating)) : esc(c.rating.reason ?? "")} · ${c.dataPoints.length} av ${c.dataPoints.length + c.missing.length} datapunkter</p>
    ${c.dataPoints.map(pointRow).join("")}${c.missing.map(missingRow).join("")}
  </div>`).join("")}
</section>

<!-- ============ 5. Questions ============ -->
<section class="page">
  <p class="kicker">Del 8</p><h2>Spørsmål å stille</h2>
  <p class="lead">Før visning eller bud: spørsmål til selger, megler eller kommunen, ut fra funnene i rapporten.</p>
  ${qs.length ? qs.map((q) => `<div class="qgroup"><p class="qtopic"><b>${esc(q.topic)}</b> · ${esc(q.finding)}</p><ul class="checks">${q.items.map((i) => `<li><span class="box"></span>${esc(i)}</li>`).join("")}</ul></div>`).join("")
    : `<p class="note">Ingen funn i dataene som gir egne spørsmål.</p>`}
  ${always.map((q) => `<div class="qgroup"><p class="qtopic"><b>${esc(q.topic)}</b></p><ul class="checks">${q.items.map((i) => `<li><span class="box"></span>${esc(i)}</li>`).join("")}</ul></div>`).join("")}
</section>

<!-- ============ 6. About ============ -->
<section class="page">
  <p class="kicker">Del 9</p><h2>Om rapporten</h2>
  <h3>Slik regner vi</h3>
  <p>Hver kategori får 0–100 poeng ut fra datapunktene vi har. Samlet vurdering er et vektet snitt av kategoriene som kan vurderes. Alvorlige funn setter et tak: poengsummen skaleres inn under taket (poeng × tak / 100), slik at én alvorlig risiko aldri kan veies opp av gode forhold ellers. Data vi mangler, teller aldri som godt.</p>
  <p>Poengsummen sier hva offentlige data vi har, forteller om stedet. Den er ikke en sikkerhetsvurdering, et prissignal eller et løfte om at en risiko ikke finnes.</p>

  <h3>Datagrunnlag</h3>
  <p class="lead">${present} av ${expected} datapunkter funnet. Hver rute er ett datapunkt; tomme ruter mangler.</p>
  <div class="coverage">${p.categories.map((c) => `<div class="covrow"><span>${esc(c.name)}</span><span class="cells">${
    c.dataPoints.map((d) => `<i style="background:${EFFECT[d.effect]}"></i>`).join("") + c.missing.map(() => `<i class="hollow"></i>`).join("")
  }</span><span class="muted">${c.dataPoints.length}/${c.dataPoints.length + c.missing.length}</span></div>`).join("")}</div>
  <p class="legend"><i style="background:${C.good}"></i>Positivt <i style="background:${C.bad}"></i>Negativt <i style="background:${C.unknown}"></i>Nøytralt / fakta <i class="hollow"></i>Mangler</p>

  ${allMissing.length ? `<h3>Manglende data</h3><table class="plain"><thead><tr><th>Datapunkt</th><th>Kategori</th><th>Hvorfor</th></tr></thead><tbody>${
    allMissing.map((m) => `<tr><td>${esc(m.label)}${m.importance === "critical" ? " <small class=\"crit\">kritisk</small>" : ""}</td><td>${esc(m.category)}</td><td>${MISSING[m.reason]}</td></tr>`).join("")
  }</tbody></table>` : ""}

  <h3>Kilder og lisenser</h3>
  <table class="plain sources"><thead><tr><th>Kilde</th><th>Eier</th><th>Lisens</th><th>Lenke</th></tr></thead><tbody>${
    p.sources.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.owner)}</td><td>${esc(x.licence)}</td><td class="url"><a href="${esc(x.url)}">${esc(x.url.replace(/^https?:\/\//, ""))}</a></td></tr>`).join("")
  }</tbody></table>
  <p class="note">Kartgrunnlag © Kartverket. Laget av Omnium ${esc(date)} fra adresseprofil versjon ${p.version}. Data kan ha endret seg etter denne datoen.</p>
</section>
</body></html>`;
}

const CSS = `
@page { size: A4; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 9.5pt/1.5 "IBM Plex Sans", "Segoe UI", sans-serif; color: ${C.ink}; font-variant-numeric: tabular-nums; }
h1, h2, h3, .num, .summary, .pscore, .badge b, .score { font-family: "Source Serif 4", Georgia, serif; }
h1 { font-size: 30pt; line-height: 1.1; margin: 2mm 0 1mm; font-weight: 700; }
h2 { font-size: 22pt; margin: 0 0 4mm; font-weight: 700; border-bottom: 2.5px solid ${C.ink}; padding-bottom: 2mm; }
h3 { font-size: 13pt; margin: 7mm 0 2.5mm; font-weight: 600; border-top: 1px solid ${C.ink}; padding-top: 2mm; }
h3.mini { font-size: 11pt; margin-top: 5mm; }
p { margin: 0 0 2mm; }
.page { break-before: page; }
/* Nothing may hang below a section's last element: even 1 px spilled over a forced page break makes an empty page. */
.page > :last-child, .page > :last-child > :last-child { margin-bottom: 0 !important; padding-bottom: 0 !important; }
h2 + h3 { border-top: 0; padding-top: 0; margin-top: 3mm; } /* no double rule under a section title */
.kicker { text-transform: uppercase; letter-spacing: .14em; font-size: 7.5pt; font-weight: 600; color: ${C.teal}; margin: 0 0 1mm; }
.lead { color: ${C.muted}; margin-bottom: 3mm; }
.note { color: ${C.muted}; font-size: 8pt; margin-top: 2mm; }
.muted { color: ${C.muted}; }
.na { color: ${C.muted}; font-size: 8.5pt; font-style: italic; }
.label { text-transform: uppercase; letter-spacing: .1em; font-size: 7pt; font-weight: 600; color: ${C.muted}; }
.mono { font-family: Consolas, monospace; font-size: 8pt; }
.r { text-align: right; }

/* cover */
.masthead { display: flex; justify-content: space-between; align-items: flex-end; }
.brand { display: flex; align-items: center; gap: 3mm; }
.brand span { font: 700 22pt/1 "Source Serif 4", Georgia, serif; letter-spacing: -.01em; }
.logo { height: 13mm; clip-path: circle(47.5% at 50% 50%); } /* cuts the off-white rim of logo-mark.png */
.meta { text-align: right; font-size: 8pt; color: ${C.muted}; line-height: 1.5; }
.meta b { color: ${C.ink}; text-transform: uppercase; letter-spacing: .12em; }
.rule { border-top: 3px solid ${C.ink}; margin: 3mm 0 6mm; }
.sub { color: ${C.muted}; font-size: 10.5pt; margin-bottom: 5mm; }
.verdict { display: grid; grid-template-columns: 1.35fr 1fr; gap: 8mm; margin-top: 6mm; border-top: 2.5px solid ${C.ink}; padding-top: 4mm; }
.num { font-size: 54pt; font-weight: 700; line-height: 1; margin: 1mm 0; }
.num small { font-size: 16pt; color: ${C.muted}; font-weight: 400; margin-left: 1mm; }
.word { font-size: 12pt; font-weight: 600; margin-bottom: 3mm; }
.facts-col p { border-top: 1px solid ${C.line}; padding-top: 2mm; margin-bottom: 3mm; }
.facts-col p:first-child { border-top: 0; padding-top: 0; }
.scale { position: relative; height: 9mm; }
.bands { display: flex; height: 2.2mm; gap: 1px; }
.marker { position: absolute; top: -1.4mm; width: 3px; height: 5mm; background: ${C.ink}; transform: translateX(-50%); }
.ticks { position: relative; font-size: 6.5pt; color: ${C.muted}; margin-top: 1mm; height: 3mm; }
.ticks span { position: absolute; transform: translateX(-50%); }
.ticks span:first-child { transform: none; } .ticks span:last-child { transform: none; }
.disclaimer { margin-top: 6mm; font-size: 7.5pt; color: ${C.muted}; border-top: 1px solid ${C.line}; padding-top: 2mm; }

/* maps */
.map { position: relative; overflow: hidden; background: #f7efe3; border: 1px solid ${C.ink}; }
.map .tiles img { position: absolute; width: ${TILE}px; height: ${TILE}px; }
.map.topo .tiles { filter: saturate(.75) contrast(.92) brightness(1.03); }
.map.topograatone .tiles { opacity: .85; }
.overlay { position: absolute; inset: 0; }
.pin-at { position: absolute; transform: translate(-50%, -100%); }
.pin-at .pin { display: block; }
.map-credit { position: absolute; right: 0; bottom: 0; background: rgba(255,255,255,.85); font-size: 6.5pt; padding: .5mm 1.5mm; color: ${C.muted}; }

/* warnings */
.warnings { list-style: none; padding: 0; margin: 0; }
.warnings li { display: grid; grid-template-columns: 17mm 1fr auto; gap: 3mm; align-items: baseline; padding: 1.8mm 0; border-bottom: 1px solid ${C.line}; }
.sev { color: #fff; font-size: 7pt; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; text-align: center; padding: .4mm 0; border-radius: 1px; }
.w-text { font-weight: 500; }
.w-cat { color: ${C.muted}; font-size: 8pt; }

/* summary */
.summary { font-size: 11pt; line-height: 1.55; }
.facts { padding-left: 5mm; margin: 0; } .facts li { margin-bottom: 1mm; }

/* bars and tables */
.bar { background: ${C.line}; width: 100%; border-radius: 1px; overflow: hidden; }
.bar > div { height: 100%; }
.bar.empty { background: repeating-linear-gradient(90deg, ${C.line} 0 3px, transparent 3px 6px); }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: .08em; color: ${C.muted}; font-weight: 600; padding: 1mm 0; border-bottom: 1px solid ${C.ink}; }
td { padding: 1.6mm 0; border-bottom: 1px solid ${C.line}; vertical-align: middle; }
.cats td:first-child { width: 38%; } .cats .barcol { width: 40%; padding: 0 5mm; } .cats .score { font-size: 14pt; }
.capnote { color: ${C.bad}; }
.plain td { font-size: 8.5pt; padding: 1.4mm 2mm 1.4mm 0; }
.sources .url { font-size: 7pt; word-break: break-all; }
.sources .url a { color: ${C.teal}; text-decoration: none; }
.crit { color: ${C.bad}; font-weight: 600; }

/* perspectives */
.persp { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; }
.pcard { border-top: 2px solid ${C.ink}; padding-top: 2mm; }
.phead { display: flex; justify-content: space-between; align-items: baseline; }
.pname { font-weight: 600; font-size: 11pt; }
.pscore { font-size: 18pt; font-weight: 700; }
.pcard .pname { font-size: 10pt; }
.pq { color: ${C.muted}; font-size: 8pt; margin-bottom: 2mm; }
.pull { font-size: 7.5pt; margin-top: 2mm; color: ${C.muted}; line-height: 1.4; }

/* coverage */
.covrow { display: grid; grid-template-columns: 45mm 1fr 12mm; align-items: center; padding: 1.2mm 0; border-bottom: 1px solid ${C.line}; }
.cells { display: flex; gap: 1.2mm; }
.cells i, .legend i { display: inline-block; width: 3.2mm; height: 3.2mm; border-radius: 1px; }
i.hollow { border: 1px solid ${C.unknown}; background: transparent !important; }
.legend { font-size: 8pt; color: ${C.muted}; margin-top: 2mm; display: flex; flex-wrap: wrap; align-items: center; gap: 1.5mm 2mm; }
.legend i { vertical-align: middle; margin-left: 2mm; }
.pin-legend svg { width: 9px; height: 13px; vertical-align: middle; margin-left: 2mm; }

/* categories */
.cat { margin-bottom: 5mm; }
.cat-head { display: flex; justify-content: space-between; align-items: center; border-top: 2.5px solid ${C.ink}; margin-top: 6mm; padding-top: 2mm; break-after: avoid; }
.cat-head h3 { border: 0; margin: 0; padding: 0; font-size: 15pt; }
.cat-sub { color: ${C.muted}; font-size: 8.5pt; break-after: avoid; }
.badge { border: 2px solid; padding: .5mm 2.5mm; font-size: 9pt; }
.badge b { font-size: 14pt; } .badge small { color: ${C.muted}; }
.badge.muted { border-color: ${C.line}; color: ${C.muted}; font-style: italic; }
.dp { padding: 2.2mm 0; border-bottom: 1px solid ${C.line}; break-inside: avoid; }
.dp-head { display: grid; grid-template-columns: 4mm 44mm 1fr 30mm; gap: 2mm; align-items: baseline; }
.dot { width: 2.6mm; height: 2.6mm; border-radius: 50%; display: inline-block; }
.dot.hollow { border: 1px solid ${C.unknown}; }
.dp-label { font-weight: 600; }
.dp-score { display: flex; align-items: center; gap: 2mm; justify-content: flex-end; }
.dp-score .bar { width: 18mm; }
.dp-score b { width: 6mm; text-align: right; }
.dp-warn { margin: 1.2mm 0 0 6mm; padding-left: 2mm; border-left: 2.5px solid; font-weight: 500; font-size: 8.5pt; }
.dp-expl { margin: 1.2mm 0 0 6mm; color: ${C.muted}; font-size: 8pt; line-height: 1.45; }
.dp-src { margin: .8mm 0 0 6mm; color: ${C.muted}; font-size: 7pt; }
.missing .dp-label, .missing .dp-value { color: ${C.unknown}; }

/* wind */
.wind { display: grid; grid-template-columns: 300px 1fr; gap: 8mm; align-items: start; margin-top: 2mm; }
.rose { display: block; overflow: visible; }
.rose .dir { font-size: 7.5px; fill: ${C.muted}; }
.rose .dir.main { font-size: 9px; font-weight: 600; fill: ${C.ink}; }
.rose .ring-label { font-size: 6.5px; fill: ${C.muted}; paint-order: stroke; stroke: #fff; stroke-width: 2.5px; }
.wind-legend { list-style: none; padding: 0; margin: 3mm 0 0; display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 4mm; font-size: 7.5pt; }
.wind-legend i { display: inline-block; width: 3mm; height: 3mm; border-radius: 1px; margin-right: 1.5mm; vertical-align: -0.4mm; }
.wind-legend span { color: ${C.muted}; }
.wind-facts p { border-top: 1px solid ${C.line}; padding-top: 2mm; margin-bottom: 3mm; }
.wind-facts p:first-child { border-top: 0; padding-top: 0; }
.wind-facts h3.mini { margin-top: 4mm; }

/* nearby services */
.services { display: block; overflow: visible; margin-top: 2mm; }
.services .svc { font-size: 11px; font-weight: 600; fill: ${C.ink}; }
.services .svc-name { font-size: 9px; fill: ${C.muted}; }
.services .svc-m { font-size: 11px; font-weight: 600; fill: ${C.ink}; }
.services .svc-walk { font-size: 9px; fill: ${C.muted}; }
.services .svc-none { font-size: 9.5px; font-style: italic; fill: ${C.muted}; }
.services .tick { font-size: 8.5px; fill: ${C.muted}; }

/* hazard distances, noise, sun */
.keep { break-inside: avoid; }
.ladder, .noise, .sunpath, .sunmonths { display: block; overflow: visible; margin-top: 2mm; }
.ladder .lad-label, .noise .lad-label { font-size: 10px; font-weight: 600; fill: ${C.ink}; }
.lad-status { font-size: 9.5px; font-weight: 600; fill: ${C.ink}; }
.lad-sub { font-size: 8px; fill: ${C.muted}; }
.ladder .tick, .noise .tick, .sunpath .tick, .sunmonths .tick { font-size: 8px; fill: ${C.muted}; }
.ladder .tick.me { fill: ${C.ink}; font-weight: 600; }
.sunpath .tick.main, .sunmonths .tick.main { fill: ${C.ink}; font-weight: 600; }
.n-unknown { font-size: 8.5px; font-style: italic; fill: ${C.muted}; }
.sunpath .hour { font-size: 7.5px; fill: ${C.ink}; paint-order: stroke; stroke: #fff; stroke-width: 2.5px; }
.sunpath .curve { font-size: 9px; font-weight: 600; fill: ${C.ink}; paint-order: stroke; stroke: #fff; stroke-width: 3px; }
.sunmonths .num-sun { font-size: 8px; font-weight: 600; fill: ${C.ink}; }
i.hatched { background: repeating-linear-gradient(45deg, ${C.unknown} 0 1.2px, #fff 1.2px 3.5px) !important; border: 1px solid ${C.line}; }
i.outline { background: #fff !important; border: 1.2px solid ${C.navy}; }
.who-swatch { display: inline-block; width: 0; height: 3.2mm; border-left: 1px dashed ${C.ink}; margin: 0 1mm 0 2mm; vertical-align: middle; }
.swatch.dashed { width: 5mm; height: 0; border-top: 1.3px dashed ${C.muted}; background: none; margin-left: 2mm; }
.nstats td { width: 36%; } .nstats td:first-child { width: 28%; }
.nstats .mbar { display: inline-block; width: 30mm; height: 2.2mm; background: ${C.line}; vertical-align: middle; margin-right: 2mm; border-radius: 1px; overflow: hidden; }
.nstats .mbar i { display: block; height: 100%; background: ${C.navy}; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 3mm 0 2mm; }
.tile { border-top: 2px solid ${C.ink}; padding-top: 1.5mm; break-inside: avoid; }
.tile .big { font: 700 15pt/1.15 "Source Serif 4", Georgia, serif; margin: .5mm 0 1mm; }
.tile .sub { color: ${C.muted}; font-size: 7.5pt; line-height: 1.4; }
.map + .legend { margin-bottom: 1mm; }

/* compared to the area */
.areas { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
.area { break-inside: avoid; }
.area-head { margin-bottom: 3mm; }
.hist { display: block; overflow: visible; }
.area-line { font-size: 8.5pt; margin-top: 1mm; }
.swatch { display: inline-block; width: 3mm; height: 1mm; vertical-align: middle; margin-right: 1mm; }
.swatch.tick { width: 1px; height: 2.5mm; background: ${C.muted}; }

/* questions */
.qgroup { margin-bottom: 4mm; break-inside: avoid; }
.qtopic { border-bottom: 1px solid ${C.ink}; padding-bottom: 1mm; margin-bottom: 1.5mm; }
.checks { list-style: none; padding: 0; margin: 0; }
.checks li { display: grid; grid-template-columns: 6mm 1fr; padding: 1.4mm 0; border-bottom: 1px dotted ${C.line}; }
.box { width: 3.4mm; height: 3.4mm; border: 1.2px solid ${C.ink}; margin-top: .6mm; }
`;

const HEADER = (address: string) => `<div style="width:100%;font:7pt 'Segoe UI',sans-serif;color:${C.muted};padding:0 16mm;display:flex;justify-content:space-between;letter-spacing:.06em">
  <span><b style="color:${C.ink}">OMNIUM</b> · EIENDOMSRAPPORT</span><span>${esc(address)}</span></div>`;
const FOOTER = `<div style="width:100%;font:7pt 'Segoe UI',sans-serif;color:${C.muted};padding:0 16mm;display:flex;justify-content:space-between">
  <span>Offentlige data. Ikke en tilstandsrapport eller takst.</span><span>Side <span class="pageNumber"></span> av <span class="totalPages"></span></span></div>`;

/** The nearest station's rose, only when the profile has the wind data point (same station as on the address page). */
async function windRose(p: Profile): Promise<WindRose | undefined> {
  const dp = DATA_POINTS.find((d) => d.id === "wind");
  const present = p.categories.some((c) => c.dataPoints.some((d) => d.id === "wind"));
  if (!dp || !present) return undefined;
  return pickStation(await findRows(dp.table, dp.find, p.address.lng, p.address.lat)) ?? undefined;
}

async function reportHtml(id: string) {
  const [profile, summary] = await Promise.all([buildProfile(id), buildSummary(id)]);
  const a = profile.address;
  const log = (what: string) => (err: unknown) => { console.error(`report: ${what} failed:`, (err as Error).message); return undefined; };
  const info = await addressArea(a.id, a.municipalityNumber).catch(log("address area"));
  const place: Place = {
    lng: a.lng, lat: a.lat, kommune: a.municipalityNumber, kommuneName: info?.kommuneName ?? titleCase(a.municipality),
    ...(info?.grunnkrets && { grunnkrets: info.grunnkrets }), ...(info?.grunnkretsName && { grunnkretsName: info.grunnkretsName }),
  };
  // The terrain horizon comes from the internet (PVGIS): start it first, it runs while the database works.
  const horizon = fetchHorizon(a.lat, a.lng);
  const zones = await hazardZones(HAZARD_FRAME(a.lng, a.lat));
  const area = await compareWithArea(profile).catch(log("area comparison"));
  const wind = await windRose(profile).catch(log("wind rose"));
  const ladder = (await hazardLadder(profile, place).catch(log("hazard distances"))) ?? [];
  const noise = (await noiseRows(profile, place).catch(log("noise"))) ?? [];
  const nm = await noiseMap(NOISE_FRAME(a.lng, a.lat)).catch(log("noise map"));
  const sun = sunYear(a.lat, a.lng, await horizon);
  const extras: Extras = { place, ladder, noise, ...(nm && { noiseMap: nm }), sun };
  return { html: render(profile, summary, zones, extras, area, wind), addressId: a.id, title: `${a.text}, ${a.postcode} ${titleCase(a.place)}` };
}

/** The report as a PDF. Throws the same 400/404/503 errors as the profile. */
export async function buildReport(id: string): Promise<{ pdf: Uint8Array; addressId: string }> {
  const { html, addressId, title } = await reportHtml(id);
  const pdf = await htmlToPdf(html, { header: HEADER(title), footer: FOOTER });
  return { pdf, addressId };
}

// Printed by the visitor's own browser instead of our Chromium (hosts with too little memory, docs/REPORT.md).
// On screen: the A4 pages on grey with a print button. In print: page margins, the toolbar hidden.
const PAGE_CSS = `
@page { margin: 20mm 16mm 18mm; }
@media screen {
  html { background: #e9e6df; }
  body { max-width: 210mm; margin: 0 auto; padding: 16mm; background: #fff; }
  .print-bar { position: sticky; top: 0; z-index: 10; display: flex; gap: 3mm; align-items: center; justify-content: space-between;
    max-width: 210mm; margin: 0 auto; padding: 3mm 16mm; background: ${C.ink}; color: #fff; font: 10pt "IBM Plex Sans", sans-serif; }
  .print-bar button { font: inherit; font-weight: 600; padding: 1.5mm 4mm; border: 0; border-radius: 4px; background: #fff; color: ${C.ink}; cursor: pointer; }
}
@media print { .print-bar { display: none; } }`;

/** The report as a printable HTML page; the browser's print dialog saves it as PDF. `print` opens the dialog on load. */
export async function buildReportPage(id: string, print: boolean): Promise<string> {
  const { html, title } = await reportHtml(id);
  const bar = `<div class="print-bar"><span>Omnium-rapport · ${esc(title)}</span><button type="button" onclick="print()">Lagre som PDF / skriv ut</button></div>`;
  // Wait for map tiles (load) and web fonts before the dialog, or the PDF prints half-empty.
  const script = print ? `<script>addEventListener("load", () => document.fonts.ready.then(() => setTimeout(print, 300)));</script>` : "";
  return html
    .replace("</head>", `<title>Omnium-rapport · ${esc(title)}</title><style>${PAGE_CSS}</style>${script}</head>`)
    .replace("<body>", `<body>${bar}`);
}
