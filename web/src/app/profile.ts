// Shape of GET /api/address/:id/profile, as the web app uses it. Source of truth: api/src/profile.ts + docs/PROFILE.md.

export type Severity = "high" | "medium" | "low";
export type Status = "ok" | "insufficientData" | "unavailable" | "informational";

export interface Rating {
  status: Status;
  score?: number;
  reason?: string;
  coverage: { present: number; expected: number; criticalMissing: number };
  cappedBy?: { dataPointId: string; cap: number; text: string }[];
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
  warning?: { severity: Severity; text: string };
  explanation?: string;
}

export interface Missing {
  id: string;
  label: string;
  importance: "critical" | "normal";
  source: string;
  reason: "noCoverage" | "sourceUnavailable" | "notLoaded";
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

export interface Profile {
  version: number;
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
  categories: Category[];
  sources: { id: string; name: string; owner: string; url: string; licence: string }[];
}
