// Routes are registered per connection kind, like painters. The demo draws "delayed"
// links orthogonally with rounded corners; every other kind uses the library default
// (Bezier) until the "Orthogonal wires" checkbox switches the "default" kind live.
// Orthogonal wires keep clear of their own two nodes only; other nodes are not avoided.
import {
  createBezierRouter,
  createOrthogonalRouter,
  createRouteRegistry,
  type RouteRegistry,
} from "nodeeditor-js";
import type { ViewHandle } from "nodeeditor-js/view";

export function demoRoutes(): RouteRegistry {
  const routes = createRouteRegistry();
  routes.register("delayed", createOrthogonalRouter({ cornerRadius: 6 }));
  return routes;
}

/** Wire a checkbox that switches the "default" kind between Bezier and orthogonal. */
export function installRouteToggle(view: ViewHandle, selector: string): void {
  const box = document.querySelector<HTMLInputElement>(selector);
  const bezier = createBezierRouter();
  const orthogonal = createOrthogonalRouter();
  // Replacing a route recomputes that kind's paths and repaints; it is not an edit,
  // so nothing is added to the undo history.
  box?.addEventListener("change", () => {
    view.routes.replace("default", box.checked ? orthogonal : bezier);
    view.element.focus();
  });
}
