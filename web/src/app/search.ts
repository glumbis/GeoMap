// Address search with autocomplete (Geonorge adresser/v1/sok). Used on both pages.
// Only street addresses (Vegadresse) in Oslo (0301) and Akershus (32xx). Geonorge can't filter on several
// municipalities at once, so we ask for more hits and filter here.
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

const inArea = (kommunenummer: string) => kommunenummer === "0301" || kommunenummer.startsWith("32");

/** Address id as in docs/PROFILE.md: <kommunenummer>-<adressekode>-<nummer><bokstav>. */
const addressId = (a: any) => `${a.kommunenummer}-${a.adressekode}-${a.nummer}${(a.bokstav ?? "").toUpperCase()}`;

async function search(text: string, signal: AbortSignal): Promise<Hit[]> {
  const url = `${API}?sok=${encodeURIComponent(text)}&fuzzy=true&treffPerSide=1000&filtrer=${FIELDS}&utkoordsys=4326`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geonorge ${res.status}`);
  const body = await res.json();
  return (body.adresser ?? [])
    .filter((a: any) => a.objtype === "Vegadresse" && inArea(a.kommunenummer))
    .slice(0, MAX_SHOWN)
    .map((a: any) => ({
      id: addressId(a),
      text: a.adressetekst,
      postcode: a.postnummer,
      place: titleCase(a.poststed),
      municipality: titleCase(a.kommunenavn),
    }));
}

export function createSearch(opts: { size: "large" | "compact"; onPick: (hit: Hit) => void; autofocus?: boolean }) {
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

  function show(items: Hit[] | string) {
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
          h("span", { class: "search-hit-sub" }, `${hit.postcode} ${hit.place}`),
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
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function setActive(i: number) {
    active = i;
    [...list.children].forEach((li, j) => li.classList.toggle("is-active", j === i));
    if (i >= 0) input.setAttribute("aria-activedescendant", `search-opt-${i}`);
  }

  function pick(i: number) {
    const hit = hits[i];
    if (!hit) return;
    input.value = `${hit.text}, ${hit.place}`;
    close();
    opts.onPick(hit);
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (text.length < 2) return close();
    timer = window.setTimeout(async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const found = await search(text, ctrl.signal);
        show(found.length ? found : "Ingen adresser i Oslo eller Akershus passer");
      } catch (err) {
        if ((err as Error).name !== "AbortError") show("Adressesøket svarer ikke. Prøv igjen.");
      }
    }, 150);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      if (list.hidden) list.hidden = false;
      setActive((active + 1) % hits.length);
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive(active <= 0 ? hits.length - 1 : active - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(active >= 0 ? active : 0);
    } else if (e.key === "Escape") {
      close();
    }
  });
  input.addEventListener("blur", close);

  if (opts.autofocus) queueMicrotask(() => input.focus());
  return root;
}
