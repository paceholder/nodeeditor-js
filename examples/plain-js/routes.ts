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
import {
  createOrthogonalSegmentEditor,
  createRouteEditorRegistry,
  type RouteEditorRegistry,
  type ViewHandle,
} from "nodeeditor-js/view";

export function demoRoutes(): RouteRegistry {
  const routes = createRouteRegistry();
  routes.register("delayed", createOrthogonalRouter({ cornerRadius: 6 }));
  return routes;
}

// Select an orthogonal wire to see a square grip on every segment, ends included: drag
// one to pin it (port stubs stay fixed). Drag the diamond on a long segment to break it
// into a step. Dragging a step back into line removes its bends; double-click a pinned
// segment to free it, and "Reset route" in the context menu clears a selection's pins.
// The editor is registered for the kinds the router can draw orthogonally ("default" only
// shows grips while the checkbox below makes it orthogonal; a Bezier path has no segments).
export function demoRouteEditors(): RouteEditorRegistry {
  const editors = createRouteEditorRegistry();
  editors.register("delayed", createOrthogonalSegmentEditor());
  editors.register("default", createOrthogonalSegmentEditor());
  return editors;
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
