import { Popup, type Map } from "maplibre-gl";

// Example feature: click map -> nearest address from Kartverket's address API.
export default function addressClick(map: Map) {
  map.on("click", async (e) => {
    const { lat, lng } = e.lngLat;
    const url = `https://ws.geonorge.no/adresser/v1/punktsok?lat=${lat}&lon=${lng}&radius=200&treffPerSide=1`;
    const data = await fetch(url).then((r) => r.json());
    const text = data.adresser?.[0]?.adressetekst ?? "Ingen adresse i nærheten";
    new Popup().setLngLat(e.lngLat).setText(text).addTo(map);
  });
}
