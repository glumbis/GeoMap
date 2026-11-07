// Address search with autocomplete (Geonorge adresser/v1/sok). Used on both pages.
// Only street addresses (Vegadresse), anywhere in Norway. Our data covers Oslo (0301) and Akershus (32xx),
// so hits there come first; Geonorge can't rank by that, so we ask for many hits and sort here.
import { h, titleCase } from "./dom";

export interface Hit {
  id: string;
  text: string;
  postcode: string;
  place: string;
  municipality: string;
}

const API = "https://ws.geonorge.no/adresser/v1/sok";
const MAX_SHOWN = 8;
// Ask for many hits nationwide (common street names have hundreds outside our area), but only the fields we use,
// so 1000 hits stay small and fast (about 0.5 s).
const FIELDS = ["adressetekst", "kommunenummer", "adressekode", "nummer", "bokstav", "postnummer", "poststed", "kommunenavn", "objtype"]
  .map((f) => `adresser.${f}`)
  .join(",");

/** 0 = Oslo, 1 = Akershus, 2 = rest of Norway (no data there yet, docs/PROFILE.md rule 6). */
const areaRank = (kommunenummer: string) => (kommunenummer === "0301" ? 0 : kommunenummer.startsWith("32") ? 1 : 2);

/** Address id as in docs/PROFILE.md: <kommunenummer>-<adressekode>-<nummer><bokstav>. */
const addressId = (a: any) => `${a.kommunenummer}-${a.adressekode}-${a.nummer}${(a.bokstav ?? "").toUpperCase()}`;

async function search(text: string, signal: AbortSignal): Promise<Hit[]> {
  const url = `${API}?sok=${encodeURIComponent(text)}&fuzzy=true&treffPerSide=1000&filtrer=${FIELDS}&utkoordsys=4326`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geonorge ${res.status}`);
  const body = await res.json();
  const q = text.trim().toLowerCase();
  const rank = (a: any) => ((a.adressetekst ?? "").toLowerCase().startsWith(q) ? 0 : 3) + areaRank(a.kommunenummer);
  const street = (a: any) => String(a.adressetekst ?? "").replace(/\s+\d+\s*[A-Za-z]?$/, "").toLowerCase();
  const wanted = q.replace(/\s+\d+\s*[A-Za-z]?$/, "");
  let found = (body.adresser ?? []).filter((a: any) => a.objtype === "Vegadresse");
  const exact = found.filter((a: any) => street(a).startsWith(wanted));
  if (exact.length) found = exact; // drop fuzzy hits from other streets
  return found
    .map((a: any, i: number) => ({ a, i }))
    .sort((x: any, y: any) => rank(x.a) - rank(y.a) || street(x.a).localeCompare(street(y.a), "nb") || Number(x.a.nummer) - Number(y.a.nummer) || String(x.a.bokstav ?? "").localeCompare(String(y.a.bokstav ?? "")) || x.i - y.i)
    .map((x: any) => x.a)
    .slice(0, MAX_SHOWN)
    .map((a: any) => ({
      id: addressId(a),
      text: a.adressetekst,
      postcode: a.postnummer,
      place: titleCase(a.poststed),
      municipality: titleCase(a.kommunenavn),
    }));
}

export function createSearch(opts: {
  size: "large" | "compact";
  onPick: (hit: Hit) => void;
  autofocus?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const input = h("input", {
    type: "search",
    class: "search-input",
    placeholder: "Skriv inn en adresse",
    autocomplete: "off",
    spellcheck: "false",
    role: "combobox",
    "aria-expanded": "false",
    "aria-controls": "search-list",
    "aria-label": "Søk etter adresse",
  });
  const list = h("ul", { class: "search-list", id: "search-list", role: "listbox", hidden: true });
  const root = h("div", { class: `search search--${opts.size}` }, input, list);

  let hits: Hit[] = [];
  let active = -1;
  let timer: number | undefined;
  let ctrl: AbortController | undefined;
  let requestId = 0;
  let loading = false;

  function setLoading(value: boolean) {
    input.setAttribute("aria-busy", String(value));
    if (loading === value) return;
    loading = value;
    opts.onLoadingChange?.(value);
  }

  let stale = false; // the list shows results for older text while a new search runs
  let pickWhenReady = false; // Enter pressed while stale: pick the first new result when it arrives

  function cancelPending() {
    requestId++;
    clearTimeout(timer);
    ctrl?.abort();
    ctrl = undefined;
    setLoading(false);
  }

  function show(items: Hit[] | string) {
    stale = false;
    list.classList.remove("is-stale");
    const pickFirst = pickWhenReady;
    pickWhenReady = false;
    const wasHidden = list.hidden === true;
    const before = [...list.children].map((li) => li.textContent);
    list.replaceChildren();
    if (typeof items === "string") {
      hits = [];
      list.append(h("li", { class: "search-empty" }, items));
    } else {
      hits = items;
      items.forEach((hit, i) => {
        const li = h(
          "li",
          { role: "option", id: `search-opt-${i}`, class: "search-hit" },
          h("span", { class: "search-hit-main" }, hit.text),
          h("span", { class: "search-hit-sub" }, `${hit.postcode} ${hit.place}${hit.municipality && hit.municipality.toLowerCase() !== hit.place.toLowerCase() ? `, ${hit.municipality}` : ""}`),
        );
        li.addEventListener("mousedown", (e) => {
          e.preventDefault(); // keep focus in the input
          pick(i);
        });
        li.addEventListener("mousemove", () => setActive(i));
        list.append(li);
      });
    }
    active = -1;
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    animateIn(wasHidden, before);
    if (pickFirst && hits.length) pick(0);
  }

  /** Smooth, not jumpy: the list glides in when it opens; after that only rows that changed fade in (a short stagger). */
  function animateIn(opening: boolean, before: (string | null)[]) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (opening) {
      list.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "ease-out" });
    }
    [...list.children].forEach((li, i) => {
      if (!opening && before[i] === li.textContent) return; // same row as before: leave it still
      li.animate([{ opacity: 0, transform: "translateY(-3px)" }, { opacity: 1, transform: "none" }], {
        duration: 160, delay: Math.min(i, 6) * 25, easing: "ease-out", fill: "backwards",
      });
    });
  }

  function close() {
    cancelPending();
    pickWhenReady = false;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function setActive(i: number) {
    active = i;
    [...list.children].forEach((li, j) => li.classList.toggle("is-active", j === i));
    if (i >= 0) {
      input.setAttribute("aria-activedescendant", `search-opt-${i}`);
      list.children[i]?.scrollIntoView({ block: "nearest" });
    }
  }

  function pick(i: number) {
    const hit = hits[i];
    if (!hit || list.hidden || stale) return; // results for older text: wait for the new ones
    input.value = `${hit.text}, ${hit.place}`;
    close();
    opts.onPick(hit);
  }

  input.addEventListener("input", () => {
    const text = input.value.trim();
    if (text.length < 2) {
      close();
      hits = [];
      list.replaceChildren();
      return;
    }
    // Keep the old results (dimmed, not pickable) until the new ones arrive: closing and reopening the list on every
    // letter made everything under it jump.
    cancelPending();
    stale = true;
    list.classList.add("is-stale");
    const mine = requestId;
    setLoading(true); // Include the debounce, so feedback starts as soon as a search is scheduled.
    timer = window.setTimeout(async () => {
      ctrl = new AbortController();
      try {
        const found = await search(text, ctrl.signal);
        if (mine !== requestId || !root.isConnected) return;
        show(found.length ? found : "Ingen adresser passer");
      } catch (err) {
        if (mine === requestId && root.isConnected && (err as Error).name !== "AbortError") {
          show("Adressesøket svarer ikke. Prøv igjen.");
        }
      } finally {
        if (mine === requestId) {
          ctrl = undefined;
          setLoading(false);
        }
      }
    }, 150);
  });

  input.addEventListener("keydown", (e) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && hits.length) {
      e.preventDefault();
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      setActive(e.key === "ArrowDown" ? (active + 1) % hits.length : active <= 0 ? hits.length - 1 : active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (stale) pickWhenReady = true;
      else pick(active >= 0 ? active : 0);
    } else if (e.key === "Escape") {
      close();
    }
  });
  input.addEventListener("blur", close);

  if (opts.autofocus) queueMicrotask(() => input.focus());
  return root;
}
