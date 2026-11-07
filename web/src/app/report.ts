// "Last ned rapport (PDF)" on the address page, under the overall rating. Spec: docs/REPORT.md → "For Erik".
// A plain link: the browser opens the PDF in a new tab and shows its own loading state there.
import { h } from "./dom";
import "./report.css";

const WAIT_MS = 10_000; // the PDF takes 5–10 s; the label says so, so people don't click twice

export function reportLink(id: string): HTMLElement {
  const label = h("span", {}, "Last ned rapport (PDF)");
  const link = h(
    "a",
    {
      class: "report-btn",
      href: `/api/address/${encodeURIComponent(id)}/report.pdf`,
      target: "_blank",
      rel: "noopener",
    },
    icon(),
    label,
  );
  let timer: number | undefined;
  link.addEventListener("click", () => {
    label.textContent = "Lager rapport …";
    link.classList.add("is-busy");
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      label.textContent = "Last ned rapport (PDF)";
      link.classList.remove("is-busy");
    }, WAIT_MS);
  });
  return h(
    "div",
    { class: "report" },
    link,
    h("p", { class: "report-note" }, "Alt om adressen samlet i én rapport, med kart og sjekkliste"),
  );
}

function icon(): HTMLElement {
  const el = h("span", { class: "report-icon", "aria-hidden": "true" });
  el.innerHTML =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10"/></svg>';
  return el;
}
