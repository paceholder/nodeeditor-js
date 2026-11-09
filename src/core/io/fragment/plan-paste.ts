/**
 * The paste and duplicate planners.
 *
 * Paste validates the untrusted fragment (shape, limits, codecs), requires every node
 * type to be registered and creatable, gives every node, port and connection a fresh ID,
 * places the fragment, and builds one add-only patch. The command layer then dry-runs it
 * through the capability and connection-policy validators like any other command, so a
 * refusal there rejects the whole paste and changes nothing. Duplicate extracts a fragment
 * from the current graph and runs the very same steps, so the two cannot diverge.
 */
import { rejectionOf } from "../../base/result.js";
import type { PatchOp } from "../../data/patch/types.js";
import { frontZ } from "../../edit/commands/create-node.js";
import { ready, rejected, rejectedWith } from "../../edit/commands/ops.js";
import type {
  ExternalHandling,
  FragmentPlanners,
  Placement,
  PlanContext,
  PlannerFor,
  PlanResult,
} from "../../edit/commands/types.js";
import type {
  PayloadCodecRegistry,
  SnapshotLimits,
} from "../snapshot/snapshot-errors.js";
import type { GraphSnapshot } from "../snapshot/snapshot-types.js";
import { extractFragment } from "./extract.js";
import { readFragment } from "./fragment-text.js";
import { planExternal } from "./plan-external.js";
import { allocateIds, placementDelta, remapRecords } from "./remap.js";

export interface FragmentPlannerOptions {
  readonly codecs?: PayloadCodecRegistry;
  /** Limits for pasted fragments. Defaults to `DEFAULT_SNAPSHOT_LIMITS`. */
  readonly limits?: Partial<SnapshotLimits>;
}

interface FragmentCommand {
  readonly fragment: unknown;
  readonly placement: Placement;
  readonly external?: ExternalHandling;
}

/** Unregistered or non-creatable types, each named once in fragment order. */
function checkTypes(
  snapshot: GraphSnapshot,
  ctx: PlanContext,
): PlanResult | undefined {
  const types = [...new Set(snapshot.nodes.map((n) => n.type))];
  const unknown = types.filter((t) => !ctx.registry.has(t));
  if (unknown.length > 0) {
    return rejected(
      "unknown-type",
      `Node type ${unknown.join(", ")} is not registered`,
      unknown,
    );
  }
  const fixed = types.filter((t) => ctx.registry.get(t)?.creatable === false);
  if (fixed.length > 0) {
    return rejected(
      "not-creatable",
      `Node type ${fixed.join(", ")} cannot be created`,
      fixed,
    );
  }
  return undefined;
}

function planFragment(
  command: FragmentCommand,
  ctx: PlanContext,
  options: FragmentPlannerOptions,
  label: string,
): PlanResult {
  const read = readFragment(command.fragment, options);
  if (!read.ok) {
    const [first] = read.rejection;
    const more = read.rejection.length - 1;
    if (!first) return rejected("invalid-shape", "Fragment is invalid");
    return rejectedWith(
      rejectionOf(
        first.code,
        `${first.message}${first.path ? ` (at ${first.path})` : ""}${more > 0 ? `; ${more} more error${more > 1 ? "s" : ""}` : ""}`,
        first.entities,
      ),
    );
  }
  const { fragment, payloads } = read.value;
  const snapshot = fragment.fragment;
  if (snapshot.nodes.length === 0) {
    return rejected("empty-fragment", "The fragment holds no nodes");
  }
  const wrongType = checkTypes(snapshot, ctx);
  if (wrongType) return wrongType;

  const maps = allocateIds(snapshot, ctx.ids);
  const records = remapRecords(
    snapshot,
    payloads,
    maps,
    placementDelta(command.placement, snapshot),
    frontZ(ctx),
  );
  const ops: PatchOp[] = [
    ...records.nodes.flatMap(({ node, ports }): PatchOp[] => [
      { op: "add", entity: "node", record: node },
      ...ports.map(
        (record): PatchOp => ({ op: "add", entity: "port", record }),
      ),
    ]),
    ...records.connections.map(
      (record): PatchOp => ({ op: "add", entity: "connection", record }),
    ),
  ];
  const external = planExternal(
    fragment.external,
    command.external ?? "exclude",
    maps,
    ops,
    ctx,
  );
  const plan = ready(label, [...ops, ...external.ops], ctx.ids);
  return plan.kind === "ready"
    ? { ...plan, effects: { ...plan.effects, excluded: external.excluded } }
    : plan;
}

export function createFragmentPlanners(
  options: FragmentPlannerOptions = {},
): FragmentPlanners {
  const paste: PlannerFor<"paste"> = (command, ctx) =>
    planFragment(command, ctx, options, "Paste");
  const duplicate: PlannerFor<"duplicate"> = (command, ctx) => {
    const extracted = extractFragment(
      ctx.reader,
      { nodes: command.nodes },
      options,
    );
    if (!extracted.ok) return rejectedWith(extracted.rejection);
    return planFragment(
      { ...command, fragment: extracted.value.fragment },
      ctx,
      options,
      "Duplicate",
    );
  };
  return { paste, duplicate };
}
