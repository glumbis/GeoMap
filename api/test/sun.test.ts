// Sun position and daylight (api/src/sun.ts). No database or network needed: `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAT, clock, compassWord, horizonAt, sunDay, sunYear, type Horizon } from "../src/sun.ts";

const OSLO = { lat: 59.9139, lng: 10.7522 };
const near = (actual: number, expected: number, tol: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} not within ${tol} of ${expected}`);
const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

test("Oslo sunrise and sunset match the almanac within 3 minutes (local time, summer time in June)", () => {
  const june = sunDay(2025, 5, 21, OSLO.lat, OSLO.lng, FLAT);
  near(june.sunrise!, hm("03:54"), 3, "21 June sunrise");
  near(june.sunset!, hm("22:44"), 3, "21 June sunset");
  const dec = sunDay(2025, 11, 21, OSLO.lat, OSLO.lng, FLAT);
  near(dec.sunrise!, hm("09:18"), 3, "21 Dec sunrise");
  near(dec.sunset!, hm("15:12"), 3, "21 Dec sunset");
});

test("noon sun height in Oslo: about 53.5° at midsummer and 6.6° at midwinter", () => {
  near(sunDay(2025, 5, 21, OSLO.lat, OSLO.lng, FLAT).noonElevation, 53.5, 0.3, "June");
  near(sunDay(2025, 11, 21, OSLO.lat, OSLO.lng, FLAT).noonElevation, 6.6, 0.3, "December");
});

test("with a flat horizon the terrain sun equals the day length", () => {
  const d = sunDay(2025, 2, 20, OSLO.lat, OSLO.lng, FLAT);
  assert.equal(d.terrainMin, d.flatMin);
});

test("a ridge to the south shortens the winter sun, and a high one removes it", () => {
  const ridge = (deg: number): Horizon => ({ step: 90, heights: [0, 0, deg, 0], source: "pvgis" }); // N, E, S, W
  const low = sunDay(2025, 11, 21, OSLO.lat, OSLO.lng, ridge(4));
  const flat = sunDay(2025, 11, 21, OSLO.lat, OSLO.lng, FLAT);
  assert.ok(low.terrainMin < flat.flatMin, `${low.terrainMin} < ${flat.flatMin}`);
  const y = sunYear(OSLO.lat, OSLO.lng, ridge(12));
  assert.equal(y.winter.terrainMin, 0);
  assert.ok(y.noSun && y.noSun.days > 20, `noSun ${JSON.stringify(y.noSun)}`);
  assert.ok(y.noSun!.from < "2025-12-21" && y.noSun!.to > "2025-12-21", "the dark spell spans midwinter");
});

test("horizon interpolation wraps around north", () => {
  const h: Horizon = { step: 90, heights: [10, 0, 0, 2], source: "pvgis" };
  assert.equal(horizonAt(h, 0), 10);
  assert.equal(horizonAt(h, 315), 6);
  assert.equal(horizonAt(h, 360), 10);
});

test("words", () => {
  assert.equal(clock(9 * 60 + 5), "09:05");
  assert.equal(compassWord(180), "sør");
  assert.equal(compassWord(350), "nord");
  assert.equal(compassWord(225), "sørvest");
});
