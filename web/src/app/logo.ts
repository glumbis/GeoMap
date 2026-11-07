// Top-bar logo (address, compare and map pages): the logo mark with a thin gradient ring around it that spins
// on hover and while something loads (an address profile, an address search). Same look as the start page ring.
import { h } from "./dom";
import { navigate } from "./router";
import "./logo.css";

export function topbarLogo(): HTMLAnchorElement {
  const logo = h(
    "a",
    { href: "/", class: "topbar-logo", "aria-label": "Til forsiden" },
    h("span", { class: "logo-ring", "aria-hidden": "true" }, h("img", { src: "/logo-mark.png", alt: "" })),
    h("span", {}, "Omnium"),
  );
  logo.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  });
  return logo;
}

const MIN_SPIN_MS = 1000; // one full turn at the loading speed, so a fast (cached) load still shows the spin
const spinStart = new WeakMap<HTMLElement, number>();

/** Spin the ring while `loading` is true. Several loaders can overlap; the ring stops when all are done. */
export function setLogoLoading(logo: HTMLElement, loading: boolean) {
  const n = Math.max(0, Number(logo.dataset.loading ?? 0) + (loading ? 1 : -1));
  logo.dataset.loading = String(n);
  if (n > 0) {
    if (!logo.classList.contains("is-loading")) spinStart.set(logo, performance.now());
    logo.classList.add("is-loading");
    return;
  }
  const left = MIN_SPIN_MS - (performance.now() - (spinStart.get(logo) ?? 0));
  window.setTimeout(() => {
    if (logo.dataset.loading === "0") logo.classList.remove("is-loading");
  }, Math.max(0, left));
}
