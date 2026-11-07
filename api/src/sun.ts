// Sun and daylight at one address, for the report ("Sol og lys", docs/REPORT.md).
// Sun position: NOAA's solar position equations (accurate to about a minute for sunrise/sunset).
// Terrain: the horizon line around the point from PVGIS (EU Joint Research Centre, free, no key), computed from a
// digital elevation model. It knows hills and ridges, not buildings or trees. Without it (API down) we fall back to a
// flat horizon and say so.
// "Possible direct sun" = minutes when the sun is above the terrain horizon: no clouds, buildings or trees counted.

const RAD = Math.PI / 180;
const TZ = "Europe/Oslo";

export interface SunPosition { elevation: number; azimuth: number } // degrees; azimuth from north, clockwise

/** Sun position (true elevation, no refraction) at time t for a place. */
export function sunPosition(t: Date, lat: number, lng: number): SunPosition {
  const jd = t.getTime() / 86_400_000 + 2_440_587.5;
  const T = (jd - 2_451_545) / 36_525;
  const L0 = (((280.46646 + T * (36_000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35_999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime = 4 / RAD * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD) + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  const utcMin = (((t.getTime() / 60_000) % 1440) + 1440) % 1440;
  const ha = ((utcMin + eqTime + 4 * lng) / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZ = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const elevation = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
  const azimuth = ((Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180) % 360 + 360) % 360;
  return { elevation, azimuth };
}

/** Atmospheric refraction in degrees (Sæmundsson), lifts the sun near the horizon. */
const refraction = (h: number) => (h < -1.5 ? 0 : 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * RAD) / 60);

/** The sun's upper edge is above a horizon of `h` degrees (0 = flat; same as the -0.833° sunrise rule at 0). */
export const sunAbove = (p: SunPosition, h: number) => p.elevation + refraction(p.elevation) + 0.267 > h;

// ---------- Horizon ----------

/** Horizon height in degrees per compass azimuth, every `step` degrees from 0 (north). */
export interface Horizon { step: number; heights: number[]; source: "pvgis" | "flat"; elevationM?: number }

export const FLAT: Horizon = { step: 360, heights: [0], source: "flat" };

export function horizonAt(h: Horizon, azimuth: number): number {
  const n = h.heights.length;
  const x = (((azimuth % 360) + 360) % 360) / h.step;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return h.heights[i] * (1 - f) + h.heights[(i + 1) % n] * f;
}

const horizonCache = new Map<string, Horizon>();

/**
 * Terrain horizon from PVGIS (`printhorizon`). Its azimuth A counts from south (0), west positive, east negative;
 * we turn that into a compass azimuth (A + 180). Returns FLAT when the API does not answer within 8 s.
 */
export async function fetchHorizon(lat: number, lng: number): Promise<Horizon> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = horizonCache.get(key);
  if (hit) return hit;
  try {
    const url = `https://re.jrc.ec.europa.eu/api/v5_3/printhorizon?lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&outputformat=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`PVGIS ${res.status}`);
    const json = (await res.json()) as { inputs?: { location?: { elevation?: number } }; outputs?: { horizon_profile?: { A: number; H_hor: number }[] } };
    const profile = json.outputs?.horizon_profile ?? [];
    if (profile.length < 8) throw new Error("PVGIS: no horizon profile");
    const step = 360 / (profile.length - 1); // the last point repeats the first (A = -180 and 180)
    const heights = Array.from({ length: profile.length - 1 }, () => 0);
    for (const { A, H_hor } of profile.slice(0, -1)) heights[Math.round((((A + 180) % 360) + 360) % 360 / step) % heights.length] = Math.max(0, H_hor);
    const elevationM = json.inputs?.location?.elevation;
    const h: Horizon = { step, heights, source: "pvgis", ...(elevationM != null && { elevationM }) };
    horizonCache.set(key, h);
    return h;
  } catch (err) {
    console.error("sun: terrain horizon failed:", (err as Error).message);
    return FLAT;
  }
}

// ---------- Days ----------

/** Minutes between UTC and Norwegian time on a date (60 in winter, 120 in summer). */
function osloOffsetMin(y: number, m: number, d: number): number {
  const noon = new Date(Date.UTC(y, m, d, 12));
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(noon));
  return (hour - 12) * 60;
}

export interface SunDay {
  date: string; // YYYY-MM-DD
  /** Minutes the sun is above a flat horizon (day length) and above the terrain. */
  flatMin: number;
  terrainMin: number;
  /** Local clock minutes after midnight: sunrise/sunset over flat ground, first/last sun over the terrain. */
  sunrise?: number; sunset?: number; firstSun?: number; lastSun?: number;
  noonElevation: number;
}

/** One day, minute by minute (step 1) or coarser for whole-year scans. Times are Norwegian local time. */
export function sunDay(y: number, m: number, d: number, lat: number, lng: number, horizon: Horizon, step = 1): SunDay {
  const off = osloOffsetMin(y, m, d);
  const start = Date.UTC(y, m, d) - off * 60_000;
  let flatMin = 0, terrainMin = 0, noonElevation = -90;
  let sunrise: number | undefined, sunset: number | undefined, firstSun: number | undefined, lastSun: number | undefined;
  for (let min = 0; min < 1440; min += step) {
    const p = sunPosition(new Date(start + (min + step / 2) * 60_000), lat, lng);
    noonElevation = Math.max(noonElevation, p.elevation);
    if (sunAbove(p, 0)) {
      flatMin += step;
      sunrise ??= min;
      sunset = min + step;
    }
    if (sunAbove(p, Math.max(0, horizonAt(horizon, p.azimuth)))) {
      terrainMin += step;
      firstSun ??= min;
      lastSun = min + step;
    }
  }
  const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return { date, flatMin, terrainMin, noonElevation, ...(sunrise != null && { sunrise, sunset }), ...(firstSun != null && { firstSun, lastSun }) };
}

/** Sun path for a day: positions every `step` minutes while the sun is above the flat horizon (local clock minutes). */
export function sunPath(y: number, m: number, d: number, lat: number, lng: number, step = 10): (SunPosition & { min: number })[] {
  const off = osloOffsetMin(y, m, d);
  const start = Date.UTC(y, m, d) - off * 60_000;
  const out: (SunPosition & { min: number })[] = [];
  for (let min = 0; min <= 1440; min += step) {
    const p = sunPosition(new Date(start + min * 60_000), lat, lng);
    if (p.elevation > -1) out.push({ ...p, min });
  }
  return out;
}

export interface SunYear {
  horizon: Horizon;
  /** The 15th of every month. */
  months: SunDay[];
  /** Winter solstice, spring equinox, summer solstice (minute steps). */
  winter: SunDay; equinox: SunDay; summer: SunDay;
  /** Longest run of days with no direct sun over the terrain, if any (dates YYYY-MM-DD, across new year). */
  noSun?: { from: string; to: string; days: number };
  /** Summer solstice: last sun over the terrain after 18:00, if any (clock minutes). */
  eveningSunUntil?: number;
  /** Where the terrain is highest: compass azimuth and height in degrees. */
  highest: { azimuth: number; height: number };
}

/** Everything the report shows. Uses a fixed recent year (2025) so the result does not change by the day. */
export function sunYear(lat: number, lng: number, horizon: Horizon): SunYear {
  const Y = 2025;
  const months = Array.from({ length: 12 }, (_, m) => sunDay(Y, m, 15, lat, lng, horizon, 2));
  const winter = sunDay(Y, 11, 21, lat, lng, horizon);
  const equinox = sunDay(Y, 2, 20, lat, lng, horizon);
  const summer = sunDay(Y, 5, 21, lat, lng, horizon);

  // Days without sun: scan the year from 1 July (so a dark winter is one run), 4-minute steps are plenty here.
  let noSun: SunYear["noSun"];
  if (horizon.source === "pvgis") {
    let run: string[] = [];
    const flush = () => {
      if (run.length && (!noSun || run.length > noSun.days)) noSun = { from: run[0], to: run[run.length - 1], days: run.length };
      run = [];
    };
    for (let i = 0; i < 365; i++) {
      const t = new Date(Date.UTC(Y, 6, 1 + i));
      const day = sunDay(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), lat, lng, horizon, 4);
      if (day.terrainMin === 0) run.push(day.date); else flush();
    }
    flush();
  }
  const eveningSunUntil = summer.lastSun != null && summer.lastSun > 18 * 60 ? summer.lastSun : undefined;
  const highestIdx = horizon.heights.indexOf(Math.max(...horizon.heights));
  return {
    horizon, months, winter, equinox, summer, ...(noSun && { noSun }), ...(eveningSunUntil != null && { eveningSunUntil }),
    highest: { azimuth: highestIdx * horizon.step, height: horizon.heights[highestIdx] },
  };
}

// ---------- Words ----------

export const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
export const hoursMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} t ${String(Math.round(min % 60)).padStart(2, "0")} min` : `${Math.round(min)} min`);
const DIRS = ["nord", "nord-nordøst", "nordøst", "øst-nordøst", "øst", "øst-sørøst", "sørøst", "sør-sørøst", "sør", "sør-sørvest", "sørvest", "vest-sørvest", "vest", "vest-nordvest", "nordvest", "nord-nordvest"];
export const compassWord = (az: number) => DIRS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];
