// Rating model. Rules: docs/PROFILE.md -> "When can we rate?". Caps + weakest category: suggestions.md #1.
// Scores use only data we have. Missing data never counts as good.
import type { Category, Reading, Severity } from "./datapoints.ts";

export type Status = "ok" | "insufficientData" | "unavailable";

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

export interface Rating {
  status: Status;
  score?: number;
  reason?: string;
  coverage: Coverage;
  /** Warnings that pulled the score down to a cap. */
  cappedBy?: Cap[];
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

// A high finding caps its category at 30 and the overall at 40; medium caps at 60 / 60. Low: no cap.
const CATEGORY_CAP: Partial<Record<Severity, number>> = { high: 30, medium: 60 };
const OVERALL_CAP: Partial<Record<Severity, number>> = { high: 40, medium: 60 };
const MIN_OK_WEIGHT = 0.6;

const list = (xs: string[]) => xs.join(", ");

function pointScore(r: Reading): number | undefined {
  if (r.score != null) return r.score;
  return r.effect === "good" ? 100 : r.effect === "bad" ? 0 : undefined;
}

function caps(points: Scored[], table: Partial<Record<Severity, number>>): Cap[] {
  return points.flatMap((p) => {
    const w = p.reading.warning;
    const cap = w && table[w.severity];
    return cap != null ? [{ dataPointId: p.id, cap, text: w!.text }] : [];
  });
}

function applyCaps(score: number, found: Cap[]): Pick<Rating, "score" | "cappedBy"> {
  const binding = found.filter((c) => c.cap < score);
  if (!binding.length) return { score: Math.round(score) };
  return { score: Math.round(Math.min(score, ...binding.map((c) => c.cap))), cappedBy: binding };
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
  const scores = present.map((p) => pointScore(p.reading)).filter((s): s is number => s != null);
  if (!scores.length) {
    return { status: "insufficientData", reason: "Datapunktene her er bare informasjon og gir ingen karakter ennå.", coverage };
  }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { status: "ok", ...applyCaps(avg, caps(present, CATEGORY_CAP)), coverage };
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

  const totalWeight = categories.reduce((s, c) => s + c.category.weight, 0);
  const okWeight = ok.reduce((s, c) => s + c.category.weight, 0);
  if (okWeight < MIN_OK_WEIGHT * totalWeight) {
    const notOk = categories.filter((c) => c.rating.status !== "ok").map((c) => c.category.name.toLowerCase());
    return {
      status: "insufficientData",
      reason: `Kan ikke gi samlet karakter: for lite data for ${list(notOk)}.`,
      coverage,
      ...(weakestCategory && { weakestCategory }),
    };
  }

  // Weighted average of rated categories only (weights rescaled), then capped by serious warnings anywhere.
  const avg = ok.reduce((s, c) => s + c.rating.score! * c.category.weight, 0) / okWeight;
  const allPresent = categories.flatMap((c) => c.present);
  return { status: "ok", ...applyCaps(avg, caps(allPresent, OVERALL_CAP)), coverage, weakestCategory };
}
