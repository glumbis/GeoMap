// The map on the address page: the Omnium basemap (basemap.ts), strictly top-down.
// Map layer files in src/features/ get the map once it has loaded: export default function (map: Map).
import { Map, Marker, NavigationControl, ScaleControl } from "maplibre-gl";
import { basemapStyle } from "./basemap";

const features = import.meta.glob<{ default: (map: Map) => void | Promise<void> }>("../features/*.ts", { eager: true });

let map: Map | undefined;
let pin: Marker | undefined;

function pinElement(): HTMLElement {
  const el = document.createElement("div");
  el.className = "map-pin";
  // Orange teardrop with a white dot, as in the logo.
  el.innerHTML = `<svg viewBox="0 0 32 44" aria-hidden="true">
    <path d="M16 1C7.7 1 1 7.6 1 15.8 1 26.5 16 43 16 43s15-16.5 15-27.2C31 7.6 24.3 1 16 1z" fill="var(--orange)" stroke="#fff" stroke-width="2"/>
    <circle cx="16" cy="16" r="5.5" fill="#fff"/></svg>`;
  return el;
}

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const NORWAY: [number, number] = [15, 65];
const OVERVIEW: [number, number] = [10.75, 59.9];
let host: HTMLElement | undefined; // the map lives in this element; it is moved between pages so the map survives
let flight = 0; // bumped on every new flight so old callbacks do nothing

/** Put the map host into `container` and create the map if needed. Returns true if the map is new. */
function ensureMap(container: HTMLElement, center: [number, number], zoom: number): boolean {
  if (!host) {
    host = document.createElement("div");
    host.className = "map-host";
  }
  if (host.parentElement !== container) container.prepend(host);
  if (map) {
    map.resize();
    return false;
  }
  map = new Map({
    container: host,
    center,
    zoom,
    // Top-down only: no tilt, no rotation.
    maxPitch: 0,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    style: basemapStyle(),
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(new ScaleControl(), "bottom-left");
  if (import.meta.env.DEV) Object.assign(window, { map }); // debug in the browser console: map.getStyle()

  const m = map;
  m.on("load", () => {
    for (const [path, mod] of Object.entries(features)) {
      // One broken feature never takes down the others.
      Promise.resolve()
        .then(() => mod.default(m))
        .catch((err) => console.error(`feature ${path} failed`, err));
    }
  });
  return true;
}

function dropPin(lng: number, lat: number) {
  if (!map) return;
  pin?.remove();
  const el = pinElement();
  el.classList.add("is-drop");
  pin = new Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Show the map in `container`, flying to the address and dropping the pin when it arrives. Reuses the map if it is already there. */
export function showMap(container: HTMLElement, lng: number, lat: number) {
  const fresh = ensureMap(container, NORWAY, 4.2);
  const m = map!;
  const id = ++flight;
  pin?.remove();
  pin = undefined;
  m.stop();

  if (reduceMotion()) {
    m.jumpTo({ center: [lng, lat], zoom: 16 });
    dropPin(lng, lat);
    return;
  }
  const fly = () => {
    if (id !== flight) return;
    // The pin drops when the flight ends, also when the user cut it short.
    m.once("moveend", () => id === flight && dropPin(lng, lat));
    m.flyTo({ center: [lng, lat], zoom: 16, duration: fresh ? 3600 : 3000, curve: 1.5, essential: false, easing: easeInOut });
  };
  if (fresh) {
    // Start over Norway; go once the first view has its tiles (or after 300 ms at the latest).
    let started = false;
    const go = () => {
      if (started) return;
      started = true;
      fly();
    };
    m.once("idle", go);
    setTimeout(go, 300);
  } else {
    fly();
  }
}

/** Show the map without an address pin (the /kart page). */
export function showMapOverview(container: HTMLElement) {
  const fresh = ensureMap(container, OVERVIEW, 10.5);
  const m = map!;
  flight++;
  pin?.remove();
  pin = undefined;
  m.stop();
  if (fresh) return;
  if (reduceMotion()) m.jumpTo({ center: OVERVIEW, zoom: 10.5 });
  else m.flyTo({ center: OVERVIEW, zoom: 10.5, duration: 2000, curve: 1.5, essential: false });
}

export function destroyMap() {
  flight++;
  pin?.remove();
  map?.remove();
  host?.remove();
  map = undefined;
  pin = undefined;
  host = undefined;
}
