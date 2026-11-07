// The interactive map behind the start page: drag + zoom, a slow idle pan, a cursor "lens" that reveals the map
// un-faded, a place-name tooltip when the cursor rests, and click-to-zoom with "Sjekk nærmeste adresse".
import { Map, Popup } from "maplibre-gl";
import { basemapStyle } from "./basemap";
import { h, titleCase } from "./dom";

const CENTER: [number, number] = [10.7, 59.915]; // a little west of Oslo centre, so the city sits right of the text
const WAYPOINTS: [number, number][] = [
  [10.73, 59.925],
  [10.69, 59.9],
  [10.66, 59.92],
  [10.72, 59.935],
  [10.7, 59.915],
];
const IDLE_START_MS = 4000;
const IDLE_RESUME_MS = 6000;
const LEG_MS = 30000;
const REST_MS = 400;
const LENS_REM = 7; // lens radius: 14 rem across
const LERP = 0.16;

const NAMES = "https://ws.geonorge.no/stedsnavn/v1/punkt";
const POINTS = "https://ws.geonorge.no/adresser/v1/punktsok";
const inArea = (kommunenummer: string) => kommunenummer === "0301" || kommunenummer.startsWith("32");
const addressId = (a: any) => `${a.kommunenummer}-${a.adressekode}-${a.nummer}${(a.bokstav ?? "").toUpperCase()}`;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Returns a stop() that removes the map and every listener/timer. `app` is the page element. */
export function createStartMap(app: HTMLElement, mapEl: HTMLElement, onAddress: (id: string) => void): () => void {
  const still = reduced();
  const map = new Map({
    container: mapEl,
    style: basemapStyle(),
    center: CENTER,
    zoom: 13,
    minZoom: 8.5,
    maxZoom: 17,
    dragRotate: false,
    pitchWithRotate: false,
    keyboard: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.disableRotation();
  map.getCanvas().removeAttribute("tabindex"); // never take focus from the search field

  // ---- Idle pan: a slow tour of Oslo while nobody touches the map ----
  let drifting = false;
  let wi = 0;
  let idleTimer: number | undefined;
  let popup: Popup | undefined;
  const driftNext = () => {
    if (!drifting) return;
    map.easeTo({ center: WAYPOINTS[wi++ % WAYPOINTS.length], duration: LEG_MS, easing: (t) => 0.5 - Math.cos(Math.PI * t) / 2, essential: false });
  };
  const startDrift = () => {
    if (still || popup || document.hidden) return;
    drifting = true;
    driftNext();
  };
  const scheduleIdle = (ms: number) => {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(startDrift, ms);
  };
  map.on("moveend", () => driftNext());
  const touched = () => {
    if (drifting) {
      drifting = false;
      map.stop();
    }
    scheduleIdle(IDLE_RESUME_MS);
  };
  mapEl.addEventListener("pointerdown", touched);
  mapEl.addEventListener("wheel", touched, { passive: true });
  mapEl.addEventListener("touchstart", touched, { passive: true });
  // Keep the search focused (and the slogan paused) while the map is dragged; MapLibre still gets the event.
  mapEl.addEventListener("mousedown", (e) => {
    if (document.activeElement instanceof HTMLInputElement) e.preventDefault();
  });
  scheduleIdle(IDLE_START_MS);

  // ---- Lens: the fade layer gets a soft hole that follows the cursor, with an ink ring ----
  const ring = h("div", { class: "start-lens", "aria-hidden": "true" });
  app.append(ring);
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let r = 0;
  let tr = 0;
  let raf = 0;
  let overMap = false;
  const frame = () => {
    raf = 0;
    const k = still ? 1 : LERP;
    x += (tx - x) * k;
    y += (ty - y) * k;
    r += (tr - r) * (still ? 1 : 0.2);
    app.style.setProperty("--lx", `${x.toFixed(1)}px`);
    app.style.setProperty("--ly", `${y.toFixed(1)}px`);
    app.style.setProperty("--lr", `${r.toFixed(1)}px`);
    app.style.setProperty("--ls", (r / (LENS_REM * rem())).toFixed(3)); // 0..1 for the ring's scale
    app.classList.toggle("lens-on", r > 0.5);
    if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3 || Math.abs(tr - r) > 0.3) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };

  // ---- Place name when the cursor rests ----
  const tip = h("div", { class: "start-tip", "aria-hidden": "true", hidden: true });
  app.append(tip);
  let restTimer: number | undefined;
  let nameCtrl: AbortController | undefined;
  let tipX = 0;
  let tipY = 0;
  let down = false;
  const hideTip = () => {
    clearTimeout(restTimer);
    nameCtrl?.abort();
    tip.hidden = true;
  };
  async function showName(cx: number, cy: number) {
    const box = mapEl.getBoundingClientRect();
    const p = map.unproject([cx - box.left, cy - box.top]);
    nameCtrl?.abort();
    nameCtrl = new AbortController();
    try {
      const res = await fetch(`${NAMES}?nord=${p.lat}&ost=${p.lng}&koordsys=4258&radius=500&treffPerSide=1&utkoordsys=4258`, { signal: nameCtrl.signal });
      if (!res.ok) return;
      const hit = ((await res.json()).navn ?? [])[0];
      const name: string | undefined = hit?.stedsnavn?.[0]?.["skrivemåte"] ?? hit?.skrivemåte;
      if (!name) return;
      const kommune: string | undefined = hit?.kommuner?.[0]?.kommunenavn;
      tip.replaceChildren(h("strong", {}, name));
      if (kommune) tip.append(h("span", {}, titleCase(kommune)));
      tip.style.left = `${Math.min(cx + 14, innerWidth - 200)}px`;
      tip.style.top = `${Math.min(cy + 18, innerHeight - 60)}px`;
      tip.hidden = false;
    } catch {
      /* offline or aborted: no tooltip */
    }
  }

  const onMove = (e: PointerEvent) => {
    const t = e.target as Element | null;
    overMap = !!t && !t.closest(".start-block, .start-tip, .maplibregl-popup, .maplibregl-ctrl");
    tx = e.clientX;
    ty = e.clientY;
    if (r < 1) {
      x = tx;
      y = ty;
    }
    tr = overMap && !down && e.pointerType !== "touch" ? LENS_REM * rem() : 0;
    kick();
    if (!tip.hidden && Math.hypot(e.clientX - tipX, e.clientY - tipY) > 6) tip.hidden = true;
    clearTimeout(restTimer);
    if (overMap && !down && e.pointerType === "mouse") {
      tipX = e.clientX;
      tipY = e.clientY;
      restTimer = window.setTimeout(() => {
        if (drifting) touched(); // a resting cursor pauses the idle pan, so the name can show
        if (!map.isMoving()) void showName(tipX, tipY);
      }, REST_MS);
    }
  };
  const onLeave = () => {
    tr = 0;
    hideTip();
    kick();
  };
  const onDown = () => {
    down = true;
    tr = 0;
    hideTip();
    kick();
  };
  const onUp = () => {
    down = false;
  };
  app.addEventListener("pointermove", onMove);
  app.addEventListener("pointerleave", onLeave);
  mapEl.addEventListener("pointerdown", onDown);
  addEventListener("pointerup", onUp);

  // ---- Click: zoom there, offer the nearest address ----
  let addrCtrl: AbortController | undefined;
  map.on("click", (e) => {
    hideTip();
    popup?.remove();
    const status = h("span", { class: "sm-popup__status", "aria-live": "polite" });
    const btn = h("button", { type: "button", class: "sm-popup__btn" }, "Sjekk nærmeste adresse");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.textContent = "Leter etter adresse …";
      addrCtrl?.abort();
      addrCtrl = new AbortController();
      try {
        const res = await fetch(`${POINTS}?lat=${e.lngLat.lat}&lon=${e.lngLat.lng}&radius=300&koordsys=4326&utkoordsys=4326&treffPerSide=10`, { signal: addrCtrl.signal });
        if (!res.ok) throw new Error(`Geonorge ${res.status}`);
        const hits: any[] = ((await res.json()).adresser ?? [])
          .filter((a: any) => a.objtype === "Vegadresse")
          .sort((a: any, b: any) => a.meterDistanseTilPunkt - b.meterDistanseTilPunkt);
        const a = hits.find((x) => inArea(x.kommunenummer));
        if (a) return onAddress(addressId(a));
        status.textContent = hits.length ? "Utenfor Oslo og Akershus" : "Ingen adresse i nærheten";
        btn.disabled = false;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        status.textContent = "Adressesøket svarer ikke. Prøv igjen.";
        btn.disabled = false;
      }
    });
    popup = new Popup({ className: "sm-popup", closeButton: true, closeOnClick: false, offset: 10, maxWidth: "16rem" })
      .setLngLat(e.lngLat)
      .setDOMContent(h("div", { class: "sm-popup__body" }, btn, status))
      .addTo(map);
    const mine = popup;
    mine.on("close", () => {
      if (popup === mine) popup = undefined;
      addrCtrl?.abort();
      scheduleIdle(IDLE_RESUME_MS);
    });
    const zoom = Math.min(17, Math.max(map.getZoom() + 1, 15));
    map.easeTo({ center: e.lngLat, zoom, duration: still ? 0 : 900 });
  });

  return () => {
    clearTimeout(idleTimer);
    clearTimeout(restTimer);
    cancelAnimationFrame(raf);
    nameCtrl?.abort();
    addrCtrl?.abort();
    drifting = false;
    removeEventListener("pointerup", onUp);
    app.removeEventListener("pointermove", onMove);
    app.removeEventListener("pointerleave", onLeave);
    ring.remove();
    tip.remove();
    map.remove();
  };
}
