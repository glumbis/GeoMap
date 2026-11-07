// Reverse search criteria (api/src/finnCriteria.ts). No database needed: `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CriteriaError, criteriaWhere, matchKommune, parseBbox, parseLimit, parseQuery, sanitizeAi } from "../src/finnCriteria.ts";

test("query params: numbers, flags and kommune are parsed; empty params ignored", () => {
  const c = parseQuery({ minFamily: "60", quiet: "1", noHazard: "true", maxSchoolM: "1000", minTransitDepartures: "50", kommune: " Bærum ", minScore: "" });
  assert.deepEqual(c, { minFamily: 60, maxSchoolM: 1000, minTransitDepartures: 50, noHazard: true, quiet: true, kommune: "Bærum" });
});

test("query params: flag 0 means no criterion", () => {
  assert.deepEqual(parseQuery({ quiet: "0", noHazard: "false" }), {});
});

test("query params: bad input is an error, never silently fixed", () => {
  assert.throws(() => parseQuery({ minScore: "abc" }), CriteriaError);
  assert.throws(() => parseQuery({ minScore: "101" }), CriteriaError);
  assert.throws(() => parseQuery({ maxSchoolM: "50" }), CriteriaError);
  assert.throws(() => parseQuery({ maxSchoolM: "20000" }), CriteriaError);
  assert.throws(() => parseQuery({ quiet: "maybe" }), CriteriaError);
  assert.throws(() => parseQuery({ kommune: "'; DROP TABLE x; --" }), CriteriaError);
  assert.throws(() => parseBbox("1,2,3"), CriteriaError);
  assert.throws(() => parseBbox("11,60,10,59"), CriteriaError);
  assert.throws(() => parseLimit("0"), CriteriaError);
  assert.throws(() => parseLimit("2.5"), CriteriaError);
});

test("limit: default 5000, capped at 10000", () => {
  assert.equal(parseLimit(undefined), 5000);
  assert.equal(parseLimit("99999"), 10000);
  assert.deepEqual(parseBbox("10.6,59.8,10.9,60"), [10.6, 59.8, 10.9, 60]);
});

test("AI output: unknown keys dropped, numbers clamped, flags only when true", () => {
  const c = sanitizeAi(
    { minFamily: 150, maxSchoolM: 20, maxGroceryM: "800", quiet: true, noHazard: false, minScore: "høy", pool: true, kommune: "bærum" },
    ["Oslo", "0301", "Bærum", "3201"],
  );
  assert.deepEqual(c, { minFamily: 100, maxSchoolM: 100, maxGroceryM: 800, quiet: true, kommune: "Bærum" });
  assert.deepEqual(sanitizeAi({ kommune: "Bergen" }, ["Oslo"]), {});
  assert.deepEqual(sanitizeAi(null), {});
  assert.deepEqual(sanitizeAi([1, 2]), {});
});

test("SQL: each criterion becomes one comparison with a numbered param; flags need a known value", () => {
  const { where, params } = criteriaWhere({ minScore: 70, maxSchoolM: 1000, quiet: true, noHazard: true, kommune: "Oslo" });
  assert.deepEqual(where, ["score >= $1", "schoolM <= $2", "hazard = false", "quiet = true", "(kommunenummer = $3 OR lower(kommune) = lower($3))"]);
  assert.deepEqual(params, [70, 1000, "Oslo"]);
  assert.deepEqual(criteriaWhere({}), { where: [], params: [] });
});

test("kommune: forgiving match (case, ae/oe/aa, trailing 'kommune'), written as in the list", () => {
  const list = ["Oslo", "0301", "Bærum", "3201", "Lørenskog", "3222", "Ås", "3218", "Nordre Follo"];
  assert.equal(matchKommune("Baerum", list), "Bærum");
  assert.equal(matchKommune("bærum kommune", list), "Bærum");
  assert.equal(matchKommune("Lorenskog", list), "Lørenskog");
  assert.equal(matchKommune("Loerenskog", list), "Lørenskog");
  assert.equal(matchKommune("Oslo kommune", list), "Oslo");
  assert.equal(matchKommune("aas", list), "Ås");
  assert.equal(matchKommune("nordre-follo", list), "Nordre Follo");
  assert.equal(matchKommune("3201", list), "3201");
  assert.equal(matchKommune("lør", list), undefined);
  assert.equal(matchKommune("Bergen", list), undefined);
  assert.deepEqual(sanitizeAi({ kommune: "Baerum kommune" }, list), { kommune: "Bærum" });
});