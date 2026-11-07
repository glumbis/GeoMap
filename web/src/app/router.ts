/** Go to a page without reloading. main.ts listens for popstate and renders the right page. */
export function navigate(path: string) {
  if (location.pathname !== path) history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
