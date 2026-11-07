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
      quickClayAwareness: 1, floodAwareness: 1,
      roadNoise: 2, roadNoiseStrategic: 2, railNoise: 2, aircraftNoise: 2, pollutedGround: 1, trafficVolume: 1, powerLine: 1,
      transitDepartures: 2, transitStop: 1, groceryStore: 2, doctor: 1, pharmacy: 1, school: 1, kindergarten: 1, trails: 2,
      greenArea: 2, recreationArea: 1, violentCrime: 1, crimeRate: 1, trafficAccidents: 1,
    },
    required: ["radon", "quickClay", "flood200"],
  },
  {
    id: "building",
    name: "Bygge her",
    question: "Hvor krevende er grunnen å bygge på?",
    weights: {
      // radon only 1: new buildings must have radon protection anyway (TEK17 §13-5).
      quickClay: 4, soilType: 3, flood200: 3, pollutedGround: 3, marineClay: 3, bedrock: 2, radon: 1,
      quickClayAwareness: 2, floodAwareness: 2, rockfall: 2, debrisFlow: 2, stormSurge: 2, avalanche: 1,
      // Power lines have a no-build belt along them.
      powerLine: 1,
    },
    required: ["quickClay", "soilType", "flood200"],
  },
  {
    id: "family",
    name: "Familie",
    question: "Hvor godt passer stedet for barnefamilier?",
    weights: {
      school: 3, kindergarten: 3, violentCrime: 3, schoolBullying: 2, trafficAccidents: 2, trails: 2, greenArea: 2,
      roadNoise: 2, roadNoiseStrategic: 2, railNoise: 2, aircraftNoise: 2, radon: 2,
      doctor: 2, groceryStore: 1, pharmacy: 1, trafficVolume: 1,
      crimeRate: 1, recreationArea: 1, quickClay: 1, flood200: 1, pollutedGround: 1, transitDepartures: 1,
    },
    required: ["school", "kindergarten", "radon"],
  },
  {
    id: "commuter",
    name: "Pendler",
    question: "Hvor lett er det å reise kollektivt herfra?",
    weights: { transitDepartures: 4, transitStop: 3, cityBike: 1 },
    required: ["transitDepartures", "transitStop"],
  },
  {
    id: "calm",
    name: "Stille og rolig",
    question: "Hvor lite støy og trafikk er det her?",
    weights: { roadNoise: 3, roadNoiseStrategic: 3, railNoise: 3, aircraftNoise: 3, trafficVolume: 3, powerLine: 1 },
    required: ["trafficVolume"],
  },
  {
    id: "nature",
    name: "Natur og friluft",
    question: "Hvor mye skog, mark og turstier er det rundt?",
    weights: { greenArea: 4, trails: 3, recreationArea: 1, protectedNature: 1 },
    required: ["greenArea", "trails"],
  },
  {
    id: "everyday",
    name: "Hverdagstilbud",
    question: "Hvor nær er butikk, lege, apotek og holdeplass?",
    weights: { groceryStore: 3, doctor: 2, pharmacy: 2, transitStop: 2, school: 1, kindergarten: 1, cityBike: 1 },
    required: ["groceryStore"],
  },
  {
    id: "safety",
    name: "Trygghet",
    question: "Hvor trygt er det i området og på veiene rundt?",
    // Crime in Oslo is shown but not scored (one number per bydel or city), so there it rests on the traffic data.
    weights: { violentCrime: 3, crimeRate: 2, trafficAccidents: 3, trafficVolume: 1 },
    required: ["trafficAccidents"],
  },
  {
    id: "costs",
    name: "Bokostnader",
    question: "Hva koster det å eie bolig her, sammenlignet med resten av Oslo og Akershus?",
    weights: { housePrice: 3, municipalFees: 2, propertyTax: 2 },
    required: ["housePrice"],
  },
];
