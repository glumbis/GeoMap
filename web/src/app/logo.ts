// Top-bar logo (address, compare and map pages): the logo mark with a thin gradient ring around it that spins
// on hover and while something loads (an address profile, an address search). Same look as the start page ring.
import { h } from "./dom";
import { navigate } from "./router";
import "./logo.css";

export function topbarLogo(): HTMLAnchorElement {
  const logo = h(
    "a",
    { href: "/", class: "topbar-logo", "aria-label": "Til forsiden" },
    logoMark(),
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

/** The logo mark as two masked copies: the rim (spins) under the inner map (stays still). See logo.css. */
export function logoMark(extraClass = ""): HTMLElement {
  const rim = h("img", { class: "logo-rim", src: "/logo-mark.png", alt: "" });
  const ring = h(
    "span",
    { class: `logo-ring ${extraClass}`.trim(), "aria-hidden": "true" },
    rim,
    h("img", { class: "logo-core", src: "/logo-mark.png", alt: "" }),
  );
  spinners.add({ ring, rim, angle: 0, speed: 0 });
  kick();
  return ring;
}

// ---- Rim spin: speeds up and slows down smoothly (ease in / ease out) instead of starting and stopping dead ----
const HOVER_TURN_MS = 2400; // one turn on hover
const LOADING_TURN_MS = 1600; // one turn while loading (a bit faster)
const EASE_MS = 600; // roughly how long it takes to reach full speed, or to stop
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

type Spinner = { ring: HTMLElement; rim: HTMLElement; angle: number; speed: number };
const spinners = new Set<Spinner>();
let raf = 0;
let last = 0;

/** Target speed in degrees per ms: spinning while hovered or loading, else 0. */
function target(s: Spinner): number {
  const host = s.ring.closest<HTMLElement>(".topbar-logo, .start-logo");
  if (!host || reduceMotion.matches) return 0;
  if (host.matches(".is-loading, .is-searching")) return 360 / LOADING_TURN_MS;
  if (host.matches(":hover, :focus-visible")) return 360 / HOVER_TURN_MS;
  return 0;
}

function kick() {
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

function tick(now: number) {
  const dt = Math.min(64, now - last);
  last = now;
  let busy = false;
  for (const s of spinners) {
    if (!s.ring.isConnected) {
      spinners.delete(s);
      continue;
    }
    const goal = target(s);
    // Ease toward the goal speed: exponential smoothing gives a soft start and a soft stop.
    s.speed += (goal - s.speed) * (1 - Math.exp(-dt / (EASE_MS / 3)));
    if (goal === 0 && s.speed < 0.002) s.speed = 0;
    s.angle = (s.angle + s.speed * dt) % 360;
    s.rim.style.transform = `rotate(${s.angle.toFixed(2)}deg)`;
    if (s.speed > 0 || goal > 0) busy = true;
  }
  raf = 0;
  if (busy) raf = requestAnimationFrame(tick);
}

// Hover, focus and loading changes start the loop; it stops itself once every rim has come to rest.
for (const ev of ["pointerover", "focusin"]) document.addEventListener(ev, kick, { passive: true });
new MutationObserver(kick).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["class"] });

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
