/** Go to a page without reloading. main.ts listens for popstate and renders the right page.
 *  Soft cross-fade between pages with the View Transitions API (styles in transitions.css). */
export function navigate(path: string) {
  const go = () => {
    if (location.pathname !== path) history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(go);
  else go();
}
