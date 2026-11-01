/**
 * Candidate ports for a connect gesture (INT-04, PRT-06, D7): ports inside the capture
 * radius at a world point, evaluated by the policy and ordered nearest first in screen
 * distance, ties broken by pick order. Evaluations are cached by the tool context.
 */
import type { Endpoint, HitCandidate, Point } from "../../../core/index.js";
import type {
  ConnectCandidate,
  ToolContext,
  ToolPreview,
} from "./tool-types.js";

type ConnectPreview = Extract<ToolPreview, { kind: "connect" }>;

export function portAt(hits: readonly HitCandidate[]): Endpoint | undefined {
  const top = hits[0];
  return top?.kind === "port"
    ? { node: top.nodeId, port: top.portId }
    : undefined;
}

export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  return a.node === b.node && a.port === b.port;
}

function screenDistance(
  ctx: ToolContext,
  at: Point<"world">,
  e: Endpoint,
): number {
  const anchor = ctx.scene
    .node(e.node)
    ?.anchors.find((a) => a.portId === e.port);
  return anchor
    ? Math.hypot(anchor.position.x - at.x, anchor.position.y - at.y) * ctx.zoom
    : Number.POSITIVE_INFINITY;
}

export function connectPreview(
  source: Endpoint,
  at: Point<"world">,
  ctx: ToolContext,
): ConnectPreview {
  const found: Endpoint[] = [];
  for (const hit of ctx.pick(at)) {
    if (hit.kind !== "port") continue;
    const e = { node: hit.nodeId, port: hit.portId };
    if (!sameEndpoint(e, source)) found.push(e);
  }
  // Array.prototype.sort is stable, so equal distances keep pick order.
  const candidates: ConnectCandidate[] = found
    .map((e) => ({ e, d: screenDistance(ctx, at, e) }))
    .sort((a, b) => a.d - b.d)
    .map(({ e }) => ({
      endpoint: e,
      evaluation: ctx.evaluateConnection(source, e),
    }));
  // The release target: the first candidate the policy accepts or offers a choice for.
  const target = candidates.find(
    (c) =>
      c.evaluation.state === "compatible" || c.evaluation.state === "choice",
  );
  return {
    kind: "connect",
    source,
    pointer: at,
    target: target?.endpoint,
    candidates,
  };
}
