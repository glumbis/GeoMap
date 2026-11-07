// Wind roses from MET Norway stations (table `vindroser`, data/scripts/vindroser.ts): reading a station's rose, the main
// wind directions, and short, hand-written notes on what that means for living and building at the address.
// Used by the `wind` data point (datapoints.ts) and the PDF report (report.ts). No database access here.

/** 16 sectors of 22.5°, sector 0 = wind FROM north, clockwise. */
export const SECTORS = ["N", "NNØ", "NØ", "ØNØ", "Ø", "ØSØ", "SØ", "SSØ", "S", "SSV", "SV", "VSV", "V", "VNV", "NV", "NNV"];
const NAMES = [
  "nord", "nord-nordøst", "nordøst", "øst-nordøst", "øst", "øst-sørøst", "sørøst", "sør-sørøst",
  "sør", "sør-sørvest", "sørvest", "vest-sørvest", "vest", "vest-nordvest", "nordvest", "nord-nordvest",
];
/** Speed bands, same limits as data/scripts/vindroser.ts BANDS (m/s), with MET's Norwegian names. */
export const BANDS = [
  { label: "Flau vind", range: "0,3–1,5 m/s" },
  { label: "Svak vind", range: "1,6–3,3 m/s" },
  { label: "Lett bris", range: "3,4–5,4 m/s" },
  { label: "Laber bris", range: "5,5–7,9 m/s" },
  { label: "Frisk bris", range: "8,0–10,7 m/s" },
  { label: "Liten kuling eller mer", range: "10,8 m/s +" },
];
/** Bands from this index up count as strong wind (frisk bris, 8 m/s, and more). */
const STRONG_FROM = 4;
/** Share of hours with strong wind that makes a place "vindutsatt". */
const EXPOSED = 0.05;
/** Stations on hilltops (Tryvannshøgda, 529 moh) measure far more wind than the houses below: used only close by. */
const HILLTOP_M = 300;
const HILLTOP_MAX_M = 3000;

export interface WindRose {
  station: string;
  stationId: string;
  distanceM: number;
  elevationM?: number;
  hours: number;
  calmHours: number;
  periodFrom: string;
  periodTo: string;
  /** rose[sector][band] = hours. */
  rose: number[][];
}

export interface WindSummary {
  main: number;
  /** A second, clearly separate direction (at least 67.5° away, at least half as common), or undefined. */
  second?: number;
  /** Share of all hours (calm included) per sector, 0-1. */
  shares: number[];
  calmShare: number;
  strongShare: number;
  /** Sectors with the most shelter: opposite the main wind, or across a two-way (valley) wind. */
  lee: number[];
}

export const sectorName = (i: number) => NAMES[i];
const pct = (x: number) => (x > 0 && x < 0.01 ? "under 1 %" : `${Math.round(x * 100)} %`);
const dateOf = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

/** A `vindroser` row (from findRows, with distanceM) -> WindRose. null when the row is not usable. */
export function roseFromRow(row: Record<string, unknown>): WindRose | null {
  try {
    const rose = JSON.parse(String(row.rose)) as number[][];
    if (rose.length !== 16) return null;
    return {
      station: String(row.name), stationId: String(row.stationId), distanceM: Number(row.distanceM ?? 0),
      ...(row.elevationM != null && { elevationM: Number(row.elevationM) }),
      hours: Number(row.hours), calmHours: Number(row.calmHours), periodFrom: dateOf(row.periodFrom), periodTo: dateOf(row.periodTo), rose,
    };
  } catch {
    return null;
  }
}

/**
 * The station to use, from `vindroser` rows nearest first (find kind "around"): the nearest one, except that a hilltop
 * station counts only within HILLTOP_MAX_M. null when none is left.
 */
export function pickStation(rows: Record<string, unknown>[]): WindRose | null {
  for (const row of rows) {
    const hilltop = row.elevationM != null && Number(row.elevationM) >= HILLTOP_M;
    if (hilltop && Number(row.distanceM) > HILLTOP_MAX_M) continue;
    const w = roseFromRow(row);
    if (w) return w;
  }
  return null;
}

const gap = (a: number, b: number) => Math.min((a - b + 16) % 16, (b - a + 16) % 16);

export function summarise(w: WindRose): WindSummary {
  const totals = w.rose.map((s) => s.reduce((a, b) => a + b, 0));
  const shares = totals.map((t) => t / w.hours);
  const order = shares.map((s, i) => i).sort((a, b) => shares[b] - shares[a]);
  const main = order[0];
  const second = order.find((i) => gap(i, main) >= 3 && shares[i] >= shares[main] * 0.5);
  // Two-way wind (second roughly opposite, as along Oslo's valleys): shelter is across it. Otherwise opposite the main.
  const lee = second != null && gap(second, main) >= 6 ? [(main + 4) % 16, (main + 12) % 16] : [(main + 8) % 16];
  const strong = w.rose.reduce((n, s) => n + s.slice(STRONG_FROM).reduce((a, b) => a + b, 0), 0);
  return { main, second, shares, calmShare: w.calmHours / w.hours, strongShare: strong / w.hours, lee };
}

const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`);

/** "nord-nordøst (NNØ) og sør-sørvest (SSV)" */
export function directionText(s: WindSummary): string {
  const one = (i: number) => `${NAMES[i]} (${SECTORS[i]})`;
  return s.second != null ? `${one(s.main)} og ${one(s.second)}` : one(s.main);
}

/** Where it was measured, for every text that uses the rose. */
export function stationText(w: WindRose): string {
  const height = w.elevationM != null ? `, ${w.elevationM} moh.` : "";
  return `Målt på MET-stasjonen ${w.station}${height}, ${km(w.distanceM)} unna, ${w.periodFrom.slice(0, 4)}–${w.periodTo.slice(0, 4)}`;
}

/** Short notes for the report: what the wind means for living and for building here. Written by hand, never by the AI. */
export function windMeaning(s: WindSummary): { living: string; building: string } {
  const from = s.second != null ? `${SECTORS[s.main]} og ${SECTORS[s.second]}` : SECTORS[s.main];
  const lee = s.lee.map((i) => SECTORS[i]).join(" eller ");
  const exposed = s.strongShare >= EXPOSED;
  return {
    living: `Uteplass og balkong mot ${lee} får mest le.` +
      (exposed ? ` Vindutsatt: frisk bris eller mer ${pct(s.strongShare)} av timene.` : ` Sterk vind (8 m/s +) er sjelden her, ${pct(s.strongShare)} av timene.`),
    building: `Legg inngang og uteplass mot ${lee}, og tett godt rundt vinduer og dører mot ${from}.` +
      (exposed ? ` Ta høyde for vindlast og snødrev fra ${from}.` : ""),
  };
}

/** The data point's reading. Info only: wind is not scored. */
export function windReading(w: WindRose) {
  const s = summarise(w);
  return {
    value: SECTORS[s.main],
    display: `Mest fra ${directionText(s)}`,
    effect: "neutral" as const,
    explanation: `${stationText(w)}, 10 m over bakken. ${pct(s.shares[s.main])} av timene blåser det fra ${NAMES[s.main]}` +
      `${s.second != null ? `, ${pct(s.shares[s.second])} fra ${NAMES[s.second]}` : ""}; ${pct(s.calmShare)} er det stille. ` +
      "Vinden ved huset kan avvike på grunn av terreng, skog og bygninger.",
  };
}
