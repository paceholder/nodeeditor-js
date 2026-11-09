/**
 * Route editors and their registry (D5).
 *
 * A route editor is the pointer-side counterpart of a router: it says which handles a
 * connection of its kind offers, how a press finds one, which constraints a drag
 * produces and what a double-click does. It is registered per connection kind, separate
 * from the router and the path painter, so replacing one never touches the others. A
 * kind without an editor behaves as before: a press selects, a drag does nothing.
 */
import {
  type ConnectionEntry,
  err,
  ok,
  type Point,
  type Rejection,
  type Result,
  type RouteConstraint,
  rejectionOf,
} from "../../../core/index.js";

/** A grip on a connection. `id` is opaque to the view and owned by the editor. */
export interface RouteHandle {
  readonly id: string;
  /** Where the grip is painted, in world space. */
  readonly at: Point<"world">;
  /** The handle is backed by a stored constraint (drawn filled). */
  readonly pinned: boolean;
  /**
   * `move` shifts an existing part of the route (drawn as a square); `split` breaks a
   * part into more parts (drawn as a diamond).
   */
  readonly role: "move" | "split";
}

export type RouteCursor = "ew-resize" | "ns-resize" | "move";

/** What an editor needs to know about the view to offer handles (screen-size rules). */
export interface RouteView {
  /** Screen pixels per world unit. */
  readonly zoom: number;
}

/** What an editor needs to turn a gesture into constraints (D12). */
export interface RouteEditContext extends RouteView {
  /**
   * `entry` re-routed through `constraints` with its own router, or undefined when it
   * cannot be routed. The editor uses it to drop constraints that change nothing, and so
   * stays independent of the route registry.
   */
  reroute(
    entry: ConnectionEntry,
    constraints: readonly RouteConstraint[],
  ): ConnectionEntry | undefined;
}

export interface RouteEditor {
  /** Handles on a connection entry, in world space; for painting and hit testing. */
  handles(entry: ConnectionEntry, view: RouteView): readonly RouteHandle[];
  /** Handle under a world point within `tolerance` world units, if any. */
  hit(
    entry: ConnectionEntry,
    world: Point<"world">,
    tolerance: number,
    view: RouteView,
  ): RouteHandle | undefined;
  /** Constraints while `handle` is dragged from `start` to `world`. */
  drag(
    entry: ConnectionEntry,
    handle: RouteHandle,
    start: Point<"world">,
    world: Point<"world">,
    context: RouteEditContext,
  ): readonly RouteConstraint[];
  /** Constraints after a double-click on a handle; `undefined` does nothing. */
  activate(
    entry: ConnectionEntry,
    handle: RouteHandle,
  ): readonly RouteConstraint[] | undefined;
  cursor(handle: RouteHandle): RouteCursor;
}

export interface RouteEditorRegistry {
  /** The editor registered for `kind`, or undefined. */
  get(kind: string): RouteEditor | undefined;
  /** Rejects `duplicate-type` when the kind already has an editor. */
  register(kind: string, editor: RouteEditor): Result<void, Rejection>;
  /** Register or overwrite; subscribers learn which kind changed. */
  replace(kind: string, editor: RouteEditor): void;
  /** Called with the affected kind after a registration changes. */
  onChange(handler: (kind: string) => void): () => void;
}

export function createRouteEditorRegistry(): RouteEditorRegistry {
  const byKind = new Map<string, RouteEditor>();
  const handlers = new Set<(kind: string) => void>();
  const notify = (kind: string): void => {
    for (const h of [...handlers]) h(kind);
  };
  return {
    get: (kind) => byKind.get(kind),
    register(kind, editor) {
      if (byKind.has(kind)) {
        return err(
          rejectionOf("duplicate-type", `Route editor for "${kind}" exists`, [
            kind,
          ]),
        );
      }
      byKind.set(kind, editor);
      notify(kind);
      return ok(undefined);
    },
    replace(kind, editor) {
      byKind.set(kind, editor);
      notify(kind);
    },
    onChange(handler) {
      // A wrapper per subscription, so subscribing one function twice unsubscribes once.
      const entry = (kind: string): void => handler(kind);
      handlers.add(entry);
      return () => void handlers.delete(entry);
    },
  };
}
