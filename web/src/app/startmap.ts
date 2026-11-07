// The right-hand start map: Norway at first, user-controlled drag + zoom, a full-colour magnifying lens,
// a place-name tooltip when the cursor rests, and click-to-zoom with "Sjekk nærmeste adresse".
import { Map, NavigationControl, Popup } from "maplibre-gl";
import { basemapStyle } from "./basemap";
import { h, titleCase } from "./dom";

// Mainland Norway, including the far north and the eastern border in Finnmark.
const AREA: [[number, number], [number, number]] = [[4.5, 57.8], [31.5, 71.5]];
const REST_MS = 400;
const LENS_REM = 7; // lens radius: 14 rem across
const LERP = 0.16;

const NAMES = "https://ws.geonorge.no/stedsnavn/v1/punkt";
const POINTS = "https://ws.geonorge.no/adresser/v1/punktsok";
const addressId = (a: any) => `${a.kommunenummer}-${a.adressekode}-${a.nummer}${(a.bokstav ?? "").toUpperCase()}`;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Returns a stop() that removes the map and every listener/timer. `app` is the page element. */
export function createStartMap(app: HTMLElement, mapEl: HTMLElement, onAddress: (id: string) => void): () => void {
  const still = reduced();
  const map = new Map({
    container: mapEl,
    style: basemapStyle(),
    bounds: AREA,
    fitBoundsOptions: { padding: 48 },
    minZoom: 2,
    maxZoom: 17,
    dragRotate: false,
    pitchWithRotate: false,
    keyboard: false,
    attributionControl: { compact: true },
    locale: {
      "NavigationControl.ZoomIn": "Zoom inn",
      "NavigationControl.ZoomOut": "Zoom ut",
    },
  });
  map.touchZoomRotate.disableRotation();
  map.touchPitch.disable();
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  map.getCanvas().removeAttribute("tabindex"); // never take focus from the search field
  map.getCanvas().setAttribute("role", "img");
  map.getCanvas().setAttribute("aria-label", "Norgeskart");

  // Leave Norway in view until the user chooses to explore; there is no automatic pan.
  let popup: Popup | undefined;
  // Keep the search focused (and the slogan paused) while the map is dragged; MapLibre still gets the event.
  const keepSearchFocus = (e: MouseEvent) => {
    if (document.activeElement instanceof HTMLInputElement) e.preventDefault();
  };
  mapEl.addEventListener("mousedown", keepSearchFocus);

  // ---- Lens: an independent full-colour map stays centred on the cursor's geographic point ----
  const ring = h("div", { class: "start-lens", "aria-hidden": "true" });
  mapEl.append(ring);
  let lensMap: Map | undefined;
  if (!still && matchMedia("(any-hover: hover)").matches) {
    const lensEl = h("div", { class: "start-lens__map" });
    ring.append(lensEl);
    const style = basemapStyle();
    const raster = style.layers.find((layer) => layer.id === "basemap");
    if (raster?.type === "raster") raster.paint = { "raster-opacity": 1, "raster-fade-duration": 0 };
    lensMap = new Map({
      container: lensEl,
      style,
      interactive: false,
      attributionControl: false, // the main map already displays the same Kartverket attribution
      center: map.getCenter(),
      zoom: map.getZoom() + 0.75,
    });
    lensMap.getCanvas().removeAttribute("tabindex");
  }
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let r = 0;
  let tr = 0;
  let raf = 0;
  let overMap = false;
  const syncLens = () => {
    if (!lensMap || r <= 0.5) return;
    lensMap.jumpTo({ center: map.unproject([x, y]), zoom: map.getZoom() + 0.75 });
  };
  map.on("move", syncLens);
  const frame = () => {
    raf = 0;
    const k = still ? 1 : LERP;
    x += (tx - x) * k;
    y += (ty - y) * k;
    r += (tr - r) * (still ? 1 : 0.2);
    mapEl.style.setProperty("--lx", `${x.toFixed(1)}px`);
    mapEl.style.setProperty("--ly", `${y.toFixed(1)}px`);
    mapEl.style.setProperty("--lr", `${r.toFixed(1)}px`);
    mapEl.style.setProperty("--ls", (r / (LENS_REM * rem())).toFixed(3)); // 0..1 for the ring's scale
    app.classList.toggle("lens-on", r > 0.5);
    syncLens();
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
  map.on("movestart", hideTip);
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
      tip.style.left = `${Math.max(box.left + 8, Math.min(cx + 14, box.right - 200))}px`;
      tip.style.top = `${Math.min(cy + 18, innerHeight - 60)}px`;
      tip.hidden = false;
    } catch {
      /* offline or aborted: no tooltip */
    }
  }

  const onMove = (e: PointerEvent) => {
    const t = e.target as Element | null;
    overMap = !!t && !t.closest(".start-block, .start-tip, .maplibregl-popup, .maplibregl-ctrl");
    const box = mapEl.getBoundingClientRect();
    tx = e.clientX - box.left;
    ty = e.clientY - box.top;
    if (r < 1) {
      x = tx;
      y = ty;
    }
    tr = lensMap && overMap && !down && e.pointerType !== "touch" ? LENS_REM * rem() : 0;
    kick();
    if (!tip.hidden && Math.hypot(e.clientX - tipX, e.clientY - tipY) > 6) tip.hidden = true;
    clearTimeout(restTimer);
    if (overMap && !down && e.pointerType === "mouse") {
      tipX = e.clientX;
      tipY = e.clientY;
      restTimer = window.setTimeout(() => {
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
  mapEl.addEventListener("pointermove", onMove);
  mapEl.addEventListener("pointerleave", onLeave);
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
        if (hits.length) return onAddress(addressId(hits[0]));
        status.textContent = "Ingen adresse i nærheten";
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
    });
    const zoom = Math.min(17, Math.max(map.getZoom() + 1, 15));
    map.easeTo({ center: e.lngLat, zoom, duration: still ? 0 : 900 });
  });

  return () => {
    clearTimeout(restTimer);
    cancelAnimationFrame(raf);
    nameCtrl?.abort();
    addrCtrl?.abort();
    removeEventListener("pointerup", onUp);
    mapEl.removeEventListener("pointermove", onMove);
    mapEl.removeEventListener("pointerleave", onLeave);
    mapEl.removeEventListener("pointerdown", onDown);
    mapEl.removeEventListener("mousedown", keepSearchFocus);
    lensMap?.remove();
    ring.remove();
    tip.remove();
    map.remove();
  };
}
