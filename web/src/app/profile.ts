// Shape of GET /api/address/:id/profile, as the web app uses it. Source of truth: api/src/profile.ts + docs/PROFILE.md.

export type Severity = "high" | "medium" | "low";
export type Status = "ok" | "insufficientData" | "unavailable" | "informational";

export interface Rating {
  status: Status;
  score?: number;
  reason?: string;
  coverage: { present: number; expected: number; criticalMissing: number };
  cappedBy?: { dataPointId: string; cap: number; text: string }[];
  /** Points taken off for things that count but never cap (radon, awareness areas). */
  penalties?: { dataPointId: string; points: number; text: string }[];
  weakestCategory?: { id: string; name: string; score: number };
}

export interface DataPoint {
  id: string;
  label: string;
  importance: "critical" | "normal";
  source: string;
  value: unknown;
  display: string;
  unit?: string;
  effect: "good" | "neutral" | "bad";
  score?: number;
  warning?: { severity: Severity; text: string; check?: true };
  explanation?: string;
}

export interface Missing {
  id: string;
  label: string;
  importance: "critical" | "normal";
  source: string;
  reason: "noCoverage" | "sourceUnavailable" | "notLoaded" | "outsideArea";
}

export interface Category {
  id: string;
  name: string;
  weight: number;
  required: boolean;
  rating: Rating;
  dataPoints: DataPoint[];
  missing: Missing[];
}

export interface Perspective {
  id: string;
  name: string;
  question: string;
  rating: Omit<Rating, "weakestCategory"> & { factors: { dataPointId: string; label: string; weight: number; score: number }[] };
}

/** "Spør megleren": questions for the viewing, written by hand on the API side (api/src/questions.ts). */
export interface QuestionGroup {
  /** Left out on the last group, "Alltid lurt". */
  dataPointId?: string;
  categoryId?: string;
  topic: string;
  finding?: string;
  items: string[];
}

export interface Profile {
  version: number;
  perspectives?: Perspective[];
  address: {
    id: string;
    text: string;
    postcode: string;
    place: string;
    municipality: string;
    municipalityNumber: string;
    gnr?: number;
    bnr?: number;
    lng: number;
    lat: number;
  };
  rating: Rating;
  warnings: { severity: Severity; text: string; dataPointId: string; categoryId: string }[];
  /** Common things to check (radon, awareness areas). areaShare: percent of the municipality's area with the same finding. */
  checks?: { text: string; dataPointId: string; categoryId: string; areaShare?: { percent: number; municipality: string } }[];
  categories: Category[];
  questions?: QuestionGroup[];
  sources: { id: string; name: string; owner: string; url: string; licence: string }[];
}
