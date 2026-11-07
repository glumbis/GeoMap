import type { Map } from "maplibre-gl";

// Municipality borders from GET /api/kommuner. Template for a map layer feature: copy and adapt.
export default async function (map: Map) {
  const res = await fetch("/api/kommuner?limit=100");
  if (!res.ok) {
    // 503 = table not loaded (run the ingest). 502 = API not running / still starting.
    console.warn(`kommuner: HTTP ${res.status}`, await res.text());
    return;
  }

  map.addSource("kommuner", { type: "geojson", data: await res.json() });
  map.addLayer({
    id: "kommuner-line",
    type: "line",
    source: "kommuner",
    paint: { "line-color": "#5b4b8a", "line-width": 1.5, "line-opacity": 0.7 },
  });
}
