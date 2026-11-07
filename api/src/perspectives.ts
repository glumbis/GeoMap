// Perspective scores (docs/PROFILE.md -> "Perspectives"): the same data points, weighted for one kind of use.
// Add a perspective = one entry below. Weights are relative inside a perspective; a data point not listed is ignored.
// `required`: if any of these is missing, the perspective says "insufficient data" instead of a number.
// UI text (name, question) is Norwegian bokmål.

export interface Perspective {
  id: string;
  name: string;
  /** The question the score answers, shown under the name. */
  question: string;
  weights: Record<string, number>;
  required: string[];
}

export const PERSPECTIVES: Perspective[] = [
  {
    id: "living",
    name: "Bo her",
    question: "Hvordan er det å bo her til daglig?",
    weights: {
      radon: 3, quickClay: 2, flood200: 2, stormSurge: 1, rockfall: 1, debrisFlow: 1, avalanche: 1,
      roadNoise: 2, roadNoiseStrategic: 2, aircraftNoise: 2, pollutedGround: 1,
      transitDepartures: 2, transitStop: 1, school: 1, kindergarten: 1, trails: 2,
      recreationArea: 1, violentCrime: 1, crimeRate: 1,
    },
    required: ["radon", "quickClay", "flood200"],
  },
  {
    id: "building",
    name: "Bygge her",
    question: "Hvor krevende er grunnen å bygge eller grave i?",
    weights: {
      quickClay: 4, soilType: 3, flood200: 3, pollutedGround: 3, bedrock: 2, radon: 2,
      rockfall: 2, debrisFlow: 2, stormSurge: 2, avalanche: 1,
    },
    required: ["quickClay", "soilType", "flood200"],
  },
  {
    id: "family",
    name: "Familie",
    question: "Hvor godt passer stedet for barnefamilier?",
    weights: {
      school: 3, kindergarten: 3, violentCrime: 3, trails: 2, roadNoise: 2, roadNoiseStrategic: 2, aircraftNoise: 2, radon: 2,
      crimeRate: 1, recreationArea: 1, quickClay: 1, flood200: 1, pollutedGround: 1, transitDepartures: 1,
    },
    required: ["school", "kindergarten", "radon"],
  },
  {
    id: "commuter",
    name: "Pendler",
    question: "Hvor lett er det å reise kollektivt herfra?",
    weights: { transitDepartures: 4, transitStop: 3 },
    required: ["transitDepartures", "transitStop"],
  },
];
