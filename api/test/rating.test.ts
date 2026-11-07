// Rating rules from docs/PROFILE.md ("When can we rate?", "Severity caps"). No database needed: `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Category, Reading, Severity } from "../src/datapoints.ts";
import { rateCategory, rateOverall, type Scored } from "../src/rating.ts";

const good = (id: string, importance: Scored["importance"] = "normal"): Scored => ({
  id, label: id, importance, reading: { value: null, display: "ok", effect: "good" },
});
const warn = (id: string, severity: Severity, score = 0): Scored => ({
  id, label: id, importance: "critical",
  reading: { value: 1, display: "funn", effect: "bad", score, warning: { severity, text: `${id} ${severity}` } },
});
const neutral = (id: string, importance: Scored["importance"] = "critical"): Scored => ({
  id, label: id, importance, reading: { value: "ikkeKartlagt", display: "Ikke kartlagt her", effect: "neutral" } satisfies Reading,
});
const cat = (id: string, weight = 10, required = false): Category => ({ id, name: id, weight, required });

/** Overall rating for one required hazards category plus four all-good categories. */
function overall(hazards: Scored[]) {
  const rated = (category: Category, present: Scored[]) => ({ category, present, rating: rateCategory(present, []) });
  return rateOverall([
    rated(cat("hazards", 25, true), hazards),
    ...["a", "b", "c", "d"].map((id) => rated(cat(id), [good(`${id}1`), good(`${id}2`)])),
  ]);
}

test("missing critical data: category and overall say insufficient data, never a number", () => {
  const r = rateCategory([good("rockfall")], [{ id: "quickClay", label: "Kvikkleire", importance: "critical" }]);
  assert.equal(r.status, "insufficientData");
  assert.equal(r.score, undefined);
  assert.match(r.reason!, /Kvikkleire/);

  const o = rateOverall([{ category: cat("hazards", 25, true), present: [good("rockfall")], rating: r }]);
  assert.equal(o.status, "insufficientData");
  assert.equal(o.score, undefined);
});

test("missing data never counts as good: a category with nothing is unavailable", () => {
  const r = rateCategory([], [{ id: "x", label: "X", importance: "normal" }]);
  assert.equal(r.status, "unavailable");
  assert.equal(r.score, undefined);
});

test("'not mapped here' is not scored: it neither raises nor lowers the category", () => {
  const withUnmapped = rateCategory([neutral("quickClay"), warn("rockfall", "low", 40), good("avalanche")], []);
  const without = rateCategory([warn("rockfall", "low", 40), good("avalanche")], []);
  assert.equal(withUnmapped.score, without.score);
});

test("no warnings: overall is the plain average", () => {
  const o = overall([good("quickClay", "critical"), good("flood", "critical")]);
  assert.equal(o.status, "ok");
  assert.equal(o.score, 100);
  assert.equal(o.cappedBy, undefined);
});

test("one medium warning caps the overall at 75", () => {
  const o = overall([warn("radon", "medium", 30), good("flood", "critical")]);
  assert.ok(o.score! <= 75);
  assert.deepEqual(o.cappedBy?.map((c) => c.dataPointId), ["radon"]);
});

test("one high warning caps the overall at 40, and the category at 30", () => {
  const o = overall([warn("quickClay", "high"), good("flood", "critical")]);
  assert.ok(o.score! <= 40);
  assert.equal(rateCategory([warn("quickClay", "high", 100)], []).score, 30);
});

test("soft caps: the underlying score is scaled into the cap, so capped addresses don't tie", () => {
  // Category: underlying 100 -> 60 (the cap), underlying 50 -> 30.
  assert.equal(rateCategory([warn("radon", "medium", 100)], []).score, 60);
  assert.equal(rateCategory([warn("radon", "medium", 100), good("x"), { ...good("y"), reading: { value: 1, display: "", effect: "bad", score: 0 } }], []).score, 40);
  const better = overall([warn("radon", "medium", 30), good("flood", "critical")]);
  const worse = overall([warn("radon", "medium", 30), { ...good("flood", "critical"), reading: { value: 1, display: "", effect: "bad", score: 40 } }]);
  assert.ok(better.score! > worse.score!, `${better.score} should beat ${worse.score}`);
});

test("caps stack: each further serious warning lowers the cap by 10, worst listed first", () => {
  const o = overall([warn("radon", "medium", 30), warn("quickClay", "high"), warn("noise", "medium", 20)]);
  assert.ok(o.score! <= 20); // cap 40 - 10 - 10
  assert.deepEqual(o.cappedBy?.map((c) => c.dataPointId), ["quickClay", "radon", "noise"]);
  assert.ok(o.cappedBy!.every((c) => c.cap === 20));
});

test("stacked caps never go below 10", () => {
  const many = ["a", "b", "c", "d", "e", "f"].map((id) => warn(id, "high"));
  assert.ok(overall(many).score! <= 10);
});

test("low warnings never cap the overall", () => {
  const o = overall([warn("pollutedGround", "low", 100), good("flood", "critical")]);
  assert.equal(o.score, 100);
  assert.equal(o.cappedBy, undefined);
});

test("a category with only unscored facts is 'informational', and doesn't block the overall", () => {
  const facts = [neutral("municipality", "normal"), neutral("population", "normal")];
  assert.equal(rateCategory(facts, []).status, "informational");
  const rated = (category: Category, present: Scored[]) => ({ category, present, rating: rateCategory(present, []) });
  // Facts-only category holds most of the weight: the overall is still rated from the rest.
  const o = rateOverall([rated(cat("hazards", 25, true), [good("quickClay", "critical")]), rated(cat("area", 75), facts)]);
  assert.equal(o.status, "ok");
  assert.equal(o.score, 100);
});
