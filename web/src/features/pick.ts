import { Marker, Popup, type Map, type MapMouseEvent } from "maplibre-gl";
import { h, titleCase } from "../app/dom";
import { navigate } from "../app/router";
import { clickHook } from "./hazards";
import "./pick.css";

// "Drop a pin anywhere": click the map, get a temporary pin and the nearest address (Geonorge punktsok).
// The popup also holds the hazard blocks for that spot: hazards.ts hands every click to clickHook, so there is one popup.
// Any address in Norway, like search.ts. Address id as in docs/PROFILE.md.

const API = "https://ws.geonorge.no/adresser/v1/punktsok";
const RADIUS = 200;
const DOUBLE_CLICK_MS = 250;

const addressId = (a: any) => `${a.kommunenummer}-${a.adressekode}-${a.nummer}${(a.bokstav ?? "").toUpperCase()}`;

type Result =
  | { kind: "found"; id: string; text: string; place: string; meters: number }
  | { kind: "none" };

async function nearest(lng: number, lat: number, signal: AbortSignal): Promise<Result> {
  const url = `${API}?lat=${lat}&lon=${lng}&radius=${RADIUS}&koordsys=4326&utkoordsys=4326&treffPerSide=10`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geonorge ${res.status}`);
  const hits: any[] = ((await res.json()).adresser ?? [])
    .filter((a: any) => a.objtype === "Vegadresse")
    .sort((a: any, b: any) => a.meterDistanseTilPunkt - b.meterDistanseTilPunkt);
  const a = hits[0];
  if (!a) return { kind: "none" };
  return {
    kind: "found",
    id: addressId(a),
    text: a.adressetekst,
    place: `${a.postnummer} ${titleCase(a.poststed)}`,
    meters: Math.round(a.meterDistanseTilPunkt),
  };
}

function pinElement(): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "pick-pin";
  el.title = "Fjern markeringen";
  el.setAttribute("aria-label", "Fjern markeringen");
  return el;
}

export default function (map: Map) {
  let marker: Marker | undefined;
  let popup: Popup | undefined;
  let ctrl: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clear() {
    clearTimeout(timer);
    ctrl?.abort();
    const p = popup;
    popup = undefined; // so the close handler below knows we are already clearing
    p?.remove();
    marker?.remove();
    marker = undefined;
  }

  function place(e: MapMouseEvent, blocks: HTMLElement[]) {
    clearTimeout(timer);
    ctrl?.abort();
    const { lng, lat } = e.lngLat;
    const body = h("div", { class: "hz-popup__body pick-popup" }, ...blocks);
    const addr = h("div", { class: "pick-popup__address", "aria-live": "polite" }, h("span", { class: "pick-popup__muted" }, "Leter etter adresse …"));
    if (!blocks.length) body.append(h("p", { class: "pick-popup__muted pick-popup__none" }, "Ingen faresoner i de synlige kartlagene. Åpne adressen for full vurdering."));
    body.append(addr);

    // Wait out a possible double click (which zooms) before showing anything.
    timer = setTimeout(() => {
      const old = popup;
      popup = undefined;
      old?.remove();
      if (!marker) {
        const el = pinElement();
        el.addEventListener("click", (ev) => {
          ev.stopPropagation(); // not a new pick
          clear();
        });
        marker = new Marker({ element: el, anchor: "center" }).setLngLat(e.lngLat).addTo(map);
      } else {
        marker.setLngLat(e.lngLat);
      }
      const p = new Popup({ className: "hz-popup", maxWidth: "18rem", offset: 12, closeOnClick: false }).setLngLat(e.lngLat).setDOMContent(body).addTo(map);
      popup = p;
      p.on("close", () => {
        if (popup === p) clear();
      });

      const mine = new AbortController();
      ctrl = mine;
      nearest(lng, lat, mine.signal)
        .then((r) => addr.replaceChildren(...resultView(r)))
        .catch((err) => {
          if ((err as Error).name !== "AbortError") addr.replaceChildren(h("span", { class: "pick-popup__muted" }, "Adressesøket svarer ikke. Prøv igjen."));
        });
    }, DOUBLE_CLICK_MS);
  }

  function resultView(r: Result): HTMLElement[] {
    if (r.kind === "none") return [h("span", { class: "pick-popup__muted" }, "Ingen adresse i nærheten")];
    const link = h("a", { class: "pick-popup__link", href: `/a/${r.id}` }, "Sjekk denne adressen");
    link.addEventListener("click", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return; // let "open in new tab" work
      ev.preventDefault();
      navigate(`/a/${r.id}`);
    });
    return [
      h("strong", {}, r.text),
      h("span", { class: "pick-popup__muted" }, `${r.place} · ${r.meters} m unna`),
      link,
    ];
  }

  clickHook.current = place;
  map.on("dblclick", () => clearTimeout(timer));
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && (marker || popup)) clear();
  };
  document.addEventListener("keydown", onKey);
  // A new page (e.g. "Sjekk denne adressen" or browser back): the old pin and popup go away. The router fires popstate.
  window.addEventListener("popstate", clear);

  // Quiet hint in the Kartlag panel (or a tiny map hint if the panel is missing).
  const container = map.getContainer();
  container.querySelector(".pick-hint")?.remove();
  const panel = container.querySelector(".hz-panel");
  const hint = h("p", { class: panel ? "hz-panel__note pick-hint" : "pick-hint pick-hint--map" }, "Klikk i kartet for å sjekke et annet sted");
  (panel ?? container).append(hint);

  map.once("remove", () => {
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("popstate", clear);
    if (clickHook.current === place) clickHook.current = undefined;
    clear();
  });
}
