// Rating model. Rules: docs/PROFILE.md -> "When can we rate?". Caps + weakest category: suggestions.md #1.
// Scores use only data we have. Missing data never counts as good.
import type { Category, Reading, Severity } from "./datapoints.ts";

/** informational: the category has data, but only facts that are never scored (e.g. municipal stats). */
export type Status = "ok" | "insufficientData" | "unavailable" | "informational";

export interface Coverage {
  present: number;
  expected: number;
  criticalMissing: number;
}

export interface Cap {
  dataPointId: string;
  cap: number;
  text: string;
}

export interface Penalty {
  dataPointId: string;
  points: number;
  text: string;
}

export interface Rating {
  status: Status;
  score?: number;
  reason?: string;
  coverage: Coverage;
  /** Warnings that pulled the score down to a cap. */
  cappedBy?: Cap[];
  /** Points taken off after caps (overall and perspectives), e.g. for radon. */
  penalties?: Penalty[];
  /** Overall only: the weakest rated category, always shown next to the overall score. */
  weakestCategory?: { id: string; name: string; score: number };
}

/** A present data point as the rating sees it. */
export interface Scored {
  id: string;
  label: string;
  importance: "critical" | "normal";
  reading: Reading;
}

export interface MissingPoint {
  id: string;
  label: string;
  importance: "critical" | "normal";
}

// docs/PROFILE.md -> "Severity caps". Category: high caps at 30, medium at 60. Low: no cap.
// Overall and perspectives: the worst warning sets the cap (high 40, medium 75); each further high/medium warning lowers it by 10.
// Caps are soft: see applyCaps.
const CATEGORY_CAP: Partial<Record<Severity, number>> = { high: 30, medium: 60 };
const OVERALL_CAP: Partial<Record<Severity, number>> = { high: 40, medium: 75 };
const OVERALL_STEP = 10;
const OVERALL_FLOOR = 10;
const MIN_OK_WEIGHT = 0.6;

const list = (xs: string[]) => xs.join(", ");

function pointScore(r: Reading): number | undefined {
  if (r.score != null) return r.score;
  return r.effect === "good" ? 100 : r.effect === "bad" ? 0 : undefined;
}

function caps(points: Scored[], table: Partial<Record<Severity, number>>): Cap[] {
  return points.flatMap((p) => {
    const w = p.reading.warning;
    const cap = w && !w.check ? table[w.severity] : undefined; // checks never cap
    return cap != null ? [{ dataPointId: p.id, cap, text: w!.text }] : [];
  });
}

/** Overall: one stacked cap from all high/medium warnings. Every warning that counted is listed with the final cap. */
function overallCaps(points: Scored[]): Cap[] {
  const found = caps(points, OVERALL_CAP).sort((a, b) => a.cap - b.cap); // worst first
  if (!found.length) return [];
  const cap = Math.max(OVERALL_FLOOR, Math.min(...found.map((c) => c.cap)) - OVERALL_STEP * (found.length - 1));
  return found.map((c) => ({ ...c, cap }));
}

/**
 * Soft cap: the lowest cap becomes the ceiling, and the underlying score is scaled into it (score × cap / 100).
 * A serious warning still decides the range, but two capped addresses of different quality no longer tie at the cap.
 */
function applyCaps(score: number, found: Cap[]): Pick<Rating, "score" | "cappedBy"> {
  if (!found.length) return { score: Math.round(score) };
  const cap = Math.min(...found.map((c) => c.cap));
  return { score: Math.round((score * cap) / 100), cappedBy: found };
}

/**
 * Fixed point deductions (Reading.penalty) for things that must count but never cap, like radon.
 * Taken off the average before caps, so an already capped address is not pushed to the floor by them.
 */
function rateWithPenalties(avg: number, points: Scored[]): Pick<Rating, "score" | "cappedBy" | "penalties"> {
  const penalties = points.flatMap((p) =>
    p.reading.penalty ? [{ dataPointId: p.id, points: p.reading.penalty, text: p.reading.warning?.text ?? p.label }] : [],
  );
  const total = penalties.reduce((s, x) => s + x.points, 0);
  const rated = applyCaps(Math.max(0, avg - total), overallCaps(points));
  if (!penalties.length) return rated;
  // A soft cap scales the penalty too: report what each one really cost the shown score.
  const scale = rated.cappedBy?.length ? Math.min(...rated.cappedBy.map((c) => c.cap)) / 100 : 1;
  return { ...rated, penalties: penalties.map((x) => ({ ...x, points: Math.max(1, Math.round(x.points * scale)) })) };
}

/** Plain average of the scored points, before caps. undefined when none has a score. */
function average(present: Scored[]): number | undefined {
  const scores = present.map((p) => pointScore(p.reading)).filter((s): s is number => s != null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
}

export function rateCategory(present: Scored[], missing: MissingPoint[]): Rating {
  const criticalMissing = missing.filter((m) => m.importance === "critical");
  const coverage = { present: present.length, expected: present.length + missing.length, criticalMissing: criticalMissing.length };

  if (!present.length) return { status: "unavailable", reason: "Ingen data for denne kategorien ennå.", coverage };
  if (criticalMissing.length) {
    return { status: "insufficientData", reason: `Mangler viktige data: ${list(criticalMissing.map((m) => m.label))}.`, coverage };
  }
  if (present.length * 2 < coverage.expected) {
    return { status: "insufficientData", reason: `For få datapunkter (${present.length} av ${coverage.expected}).`, coverage };
  }
  const avg = average(present);
  if (avg == null) return { status: "informational", reason: "Bare fakta om stedet, ingen karakter.", coverage };
  return { status: "ok", ...applyCaps(avg, caps(present, CATEGORY_CAP)), coverage };
}

/** One data point's part in a perspective score, biggest impact on the score first. */
export interface Factor {
  dataPointId: string;
  label: string;
  weight: number;
  score: number;
}

/**
 * Perspective score: weighted average of the listed data points that have a score, then soft caps from their
 * high/medium warnings (same caps as the overall). Missing required points -> insufficient data.
 */
export function ratePerspective(
  points: { point: Scored; weight: number }[],
  missing: (MissingPoint & { required: boolean })[],
): Rating & { factors: Factor[] } {
  const coverage = { present: points.length, expected: points.length + missing.length, criticalMissing: missing.filter((m) => m.required).length };
  const factors = points
    .flatMap(({ point, weight }) => {
      const score = pointScore(point.reading);
      return score == null ? [] : [{ dataPointId: point.id, label: point.label, weight, score }];
    })
    .sort((a, b) => (100 - b.score) * b.weight - (100 - a.score) * a.weight);
  const requiredMissing = missing.filter((m) => m.required);
  if (requiredMissing.length) {
    return { status: "insufficientData", reason: `Mangler viktige data: ${list(requiredMissing.map((m) => m.label))}.`, coverage, factors };
  }
  if (!factors.length) return { status: "unavailable", reason: "Ingen data som gir karakter her.", coverage, factors };
  const total = factors.reduce((s, f) => s + f.weight, 0);
  const avg = factors.reduce((s, f) => s + f.score * f.weight, 0) / total;
  const listed = points.map((p) => p.point);
  return { status: "ok", ...rateWithPenalties(avg, listed), coverage, factors };
}

export function rateOverall(categories: { category: Category; rating: Rating; present: Scored[] }[]): Rating {
  const coverage = categories.reduce<Coverage>(
    (sum, c) => ({
      present: sum.present + c.rating.coverage.present,
      expected: sum.expected + c.rating.coverage.expected,
      criticalMissing: sum.criticalMissing + c.rating.coverage.criticalMissing,
    }),
    { present: 0, expected: 0, criticalMissing: 0 },
  );

  const ok = categories.filter((c) => c.rating.status === "ok");
  const weakest = [...ok].sort((a, b) => a.rating.score! - b.rating.score!)[0];
  const weakestCategory = weakest && { id: weakest.category.id, name: weakest.category.name, score: weakest.rating.score! };

  if (!coverage.present) return { status: "unavailable", reason: "Vi har ingen data for denne adressen ennå.", coverage };

  const requiredNotOk = categories.filter((c) => c.category.required && c.rating.status !== "ok");
  if (requiredNotOk.length) {
    return {
      status: "insufficientData",
      reason: `Kan ikke gi samlet karakter: mangler data for ${list(requiredNotOk.map((c) => c.category.name.toLowerCase()))}.`,
      coverage,
      ...(weakestCategory && { weakestCategory }),
    };
  }

  // Fact-only categories can never be scored, so they don't count against the 60% rule.
  const totalWeight = categories.filter((c) => c.rating.status !== "informational").reduce((s, c) => s + c.category.weight, 0);
  const okWeight = ok.reduce((s, c) => s + c.category.weight, 0);
  if (okWeight < MIN_OK_WEIGHT * totalWeight) {
    const notOk = categories.filter((c) => c.rating.status !== "ok" && c.rating.status !== "informational").map((c) => c.category.name.toLowerCase());
    return {
      status: "insufficientData",
      reason: `Kan ikke gi samlet karakter: for lite data for ${list(notOk)}.`,
      coverage,
      ...(weakestCategory && { weakestCategory }),
    };
  }

  // Weighted average of rated categories only (weights rescaled), then capped by serious warnings anywhere.
  // Uses each category's score before its own cap, so one warning is not scaled down twice.
  const avg = ok.reduce((s, c) => s + average(c.present)! * c.category.weight, 0) / okWeight;
  const allPresent = categories.flatMap((c) => c.present);
  return { status: "ok", ...rateWithPenalties(avg, allPresent), coverage, weakestCategory };
}
