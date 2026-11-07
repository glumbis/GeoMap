// "Del", "Skriv ut" and "Sammenlign" on the address page: quiet text buttons. Styles and print layout: share.css.
import { h } from "./dom";
import { navigate } from "./router";
import "./share.css";

const ICON_COMPARE =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h5v10H2zM9 3h5v10H9z"/></svg>';

const ICON_SHARE =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 10V2M5 5l3-3 3 3M3 8v5h10V8"/></svg>';
const ICON_PRINT =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6V2h8v4M4 12H2V6h12v6h-2M4 9h8v5H4z"/></svg>';

let registered = false;
let footer: HTMLElement | null = null;
let reopen: HTMLDetailsElement[] = [];

/** Open every <details> for printing, remember which were closed, restore afterwards. Registered once. */
function registerPrintHooks() {
  if (registered) return;
  registered = true;
  footer = h("p", { class: "print-footer" });
  document.body.append(footer);
  window.addEventListener("beforeprint", () => {
    reopen = [...document.querySelectorAll<HTMLDetailsElement>("details:not([open])")];
    reopen.forEach((d) => (d.open = true));
    footer!.textContent = `Omnium · ${location.href} · ${new Date().toLocaleDateString("nb-NO")}`;
  });
  window.addEventListener("afterprint", () => {
    reopen.forEach((d) => (d.open = false));
    reopen = [];
  });
}

function action(label: string, aria: string, icon: string) {
  const b = h("button", { class: "share-btn", type: "button", "aria-label": aria });
  b.insertAdjacentHTML("afterbegin", icon);
  b.append(h("span", {}, label));
  return b;
}

/** compareId: this address. "Sammenlign" opens /compare/<id>/ with an empty B side to search. */
export function shareActions(compareId?: string): HTMLElement {
  registerPrintHooks();
  const share = action("Del", "Del denne adressen", ICON_SHARE);
  const print = action("Skriv ut", "Skriv ut adresserapporten", ICON_PRINT);
  const note = h("span", { class: "share-note", "aria-live": "polite", role: "status" });
  let timer: number | undefined;

  const say = (text: string) => {
    note.textContent = text;
    clearTimeout(timer);
    timer = window.setTimeout(() => (note.textContent = ""), 2000);
  };

  const fallbackBox = h("span", { class: "share-fallback", hidden: true });
  const copyLegacy = (text: string) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  };
  const showInput = (url: string) => {
    const input = h("input", { class: "share-url", type: "text", readonly: "", value: url, "aria-label": "Lenke til adressen" }) as HTMLInputElement;
    const copy = h("button", { class: "share-btn", type: "button" }, "Kopier lenken");
    copy.addEventListener("click", () => {
      input.select();
      say(copyLegacy(url) ? "Lenke kopiert" : "Trykk Ctrl+C for å kopiere");
    });
    fallbackBox.replaceChildren(input, copy);
    fallbackBox.hidden = false;
    input.focus();
    input.select();
  };

  share.addEventListener("click", async () => {
    const data = { title: document.title, url: location.href };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return; // user closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(data.url);
      say("Lenke kopiert");
      return;
    } catch {
      /* fall through */
    }
    if (copyLegacy(data.url)) say("Lenke kopiert");
    else showInput(data.url);
  });
  print.addEventListener("click", () => window.print());
  const compare = compareId ? action("Sammenlign", "Sammenlign med en annen adresse", ICON_COMPARE) : null;
  compare?.addEventListener("click", () => navigate(`/compare/${encodeURIComponent(compareId!)}/`));

  return h("div", { class: "share", role: "group", "aria-label": "Del, skriv ut eller sammenlign" }, share, print, compare, note, fallbackBox);
}
