/**
 * Hover tracking (D3). Pointer moves only record a position; one frame
 * later the tracker picks once and reports the topmost entity when it differs from the
 * last one reported. A gesture suppresses reports and clears nothing; when it ends the
 * hover is recomputed from the last position. Headless: no DOM, a frame clock injected.
 */
import type { HitCandidate } from "../../../core/index.js";
import type { FrameClock } from "../../platform/frame-scheduler.js";
import type { ViewRect } from "../../platform/view-rect.js";
import type { HoverEvent, HoverTarget } from "./hover-types.js";

export interface HoverTrackerDeps {
  /**
   * Hit candidates under a client position, best first. The caller applies the
   * level-of-detail rule, so hidden ports never come back.
   */
  readonly pickAt: (
    clientX: number,
    clientY: number,
  ) => readonly HitCandidate[];
  readonly nodeRect: (id: string) => ViewRect | undefined;
  /** True while a gesture (drag, marquee, pan, connection drag) is in flight. */
  readonly gesture: () => boolean;
  readonly clock: FrameClock;
  readonly emit: (event: HoverEvent) => void;
}

export interface HoverTracker {
  /** The entity currently reported as hovered, or null. */
  current(): HoverTarget | null;
  /** The pointer moved over the view (client coordinates). */
  move(clientX: number, clientY: number): void;
  /** The pointer left the view. */
  leave(): void;
  /** A gesture ended: recompute from the last position. */
  gestureEnded(): void;
  /** The view under the pointer changed without a pointer move (zoom, model change). */
  refresh(): void;
  /** Entities left the model: a hovered one clears at once. */
  entitiesRemoved(ids: readonly string[]): void;
  /** The document was replaced. */
  modelReset(): void;
  dispose(): void;
}

function targetOf(hit: HitCandidate | undefined): HoverTarget | null {
  if (!hit) return null;
  switch (hit.kind) {
    case "node":
      return { kind: "node", node: hit.nodeId };
    case "port":
      return { kind: "port", node: hit.nodeId, port: hit.portId };
    case "connection":
      return {
        kind: "connection",
        connection: hit.connectionId,
        ...(hit.member === undefined ? {} : { member: hit.member }),
      };
    case "group":
      return { kind: "group", group: hit.groupId, part: hit.part };
  }
}

function same(a: HoverTarget | null, b: HoverTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "node":
      return a.node === (b as typeof a).node;
    case "port":
      return a.node === (b as typeof a).node && a.port === (b as typeof a).port;
    case "connection":
      return (
        a.connection === (b as typeof a).connection &&
        a.member === (b as typeof a).member
      );
    case "group":
      return (
        a.group === (b as typeof a).group && a.part === (b as typeof a).part
      );
  }
}

const idsOf = (t: HoverTarget): readonly string[] =>
  t.kind === "node"
    ? [t.node]
    : t.kind === "port"
      ? [t.node, t.port]
      : t.kind === "connection"
        ? [t.connection]
        : [t.group];

export function createHoverTracker(deps: HoverTrackerDeps): HoverTracker {
  let current: HoverTarget | null = null;
  let position: { x: number; y: number } | undefined;
  let frame: number | undefined;
  let disposed = false;

  function report(next: HoverTarget | null): void {
    current = next;
    const rect = next?.kind === "node" ? deps.nodeRect(next.node) : undefined;
    deps.emit({ target: next, ...(rect ? { rect } : {}) });
  }

  function run(): void {
    frame = undefined;
    if (disposed || deps.gesture()) return;
    const next = position
      ? targetOf(deps.pickAt(position.x, position.y)[0])
      : null;
    if (!same(current, next)) report(next);
  }

  function schedule(): void {
    if (disposed || frame !== undefined) return;
    frame = deps.clock.request(run);
  }

  return {
    current: () => current,
    move(clientX, clientY) {
      position = { x: clientX, y: clientY };
      if (!deps.gesture()) schedule();
    },
    leave() {
      position = undefined;
      if (!deps.gesture()) schedule();
    },
    gestureEnded: schedule,
    refresh: schedule,
    entitiesRemoved(ids) {
      if (!current) return;
      const gone = new Set(ids);
      if (!idsOf(current).some((id) => gone.has(id))) return;
      report(null);
      if (position) schedule();
    },
    modelReset() {
      if (current) report(null);
      if (position) schedule();
    },
    dispose() {
      disposed = true;
      if (frame !== undefined) deps.clock.cancel(frame);
      frame = undefined;
      current = null;
      position = undefined;
    },
  };
}
