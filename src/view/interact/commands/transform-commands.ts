/**
 * Rotate and mirror editor commands (INT-07, UX-01, NOD-04, MOD-11, D9): nodes.rotate
 * with `{ turns }` and nodes.mirror with `{ axis }` over the selected nodes, each node
 * about its own centre. Nodes whose capability refuses the action are left out, as
 * nodes.nudge does; with none left the command is unavailable with the first refusal's
 * reason. Each is one model command, so shortcut and API give identical patches.
 */
import {
  type Command,
  err,
  type MirrorAxis,
  type NodeId,
  type Rejection,
  rejectionOf,
} from "../../../core/index.js";
import { capabilityProbe } from "../tools/tool-context.js";
import {
  type CommandContext,
  type CommandRegistry,
  type EditorCommand,
  outcomeOf,
} from "./command-registry.js";

export const TRANSFORM_COMMAND_IDS = {
  rotate: "nodes.rotate",
  mirror: "nodes.mirror",
} as const;

/** Clockwise quarter turns. */
export interface RotateArgs {
  readonly turns: 1 | -1;
}

/** Screen axis: `horizontal` swaps left and right, `vertical` top and bottom. */
export interface MirrorArgs {
  readonly axis: MirrorAxis;
}

type Planned =
  | Command
  | { readonly available: false; readonly reason: Rejection };

const unavailable = (
  code: Parameters<typeof rejectionOf>[0],
  message: string,
): Planned => ({ available: false, reason: rejectionOf(code, message) });

/** The selected nodes the action may touch, or the reason none may. */
function permitted(
  ctx: CommandContext,
  action: "rotate" | "mirror",
): { readonly nodes: readonly NodeId[] } | Planned {
  const model = ctx.model;
  if (!model)
    return unavailable("unknown-entity", "The view has no editable model");
  const selected = ctx.selection.nodeIds();
  if (selected.length === 0)
    return unavailable("unknown-entity", "No node is selected");
  const can = capabilityProbe(model);
  let refused: Rejection | undefined;
  const nodes = selected.filter((id) => {
    const answer = can(action, id);
    if (!answer.available) refused ??= answer.reason;
    return answer.available;
  });
  if (nodes.length > 0) return { nodes };
  return refused
    ? { available: false, reason: refused }
    : unavailable("unknown-entity", "No selected node exists");
}

function transformCommand<A>(
  id: string,
  plan: (ctx: CommandContext, args: A) => Planned,
): EditorCommand<A> {
  return {
    id,
    labelKey: `command.${id}`,
    availability(args, ctx) {
      const planned = plan(ctx, args);
      if ("available" in planned) return planned;
      return ctx.model?.can(planned) ?? { available: true };
    },
    run(args, ctx) {
      const planned = plan(ctx, args);
      if ("available" in planned) return err(planned.reason);
      return ctx.model
        ? outcomeOf(ctx.model.execute(planned))
        : err(rejectionOf("unknown-entity", "The view has no editable model"));
    },
  };
}

function planRotate(ctx: CommandContext, args: RotateArgs): Planned {
  const turns = args?.turns;
  if (turns !== 1 && turns !== -1) {
    return unavailable("invalid-shape", "nodes.rotate needs turns of 1 or -1");
  }
  const allowed = permitted(ctx, "rotate");
  return "nodes" in allowed
    ? { kind: "rotateNodes", nodes: allowed.nodes, turns }
    : allowed;
}

function planMirror(ctx: CommandContext, args: MirrorArgs): Planned {
  const axis = args?.axis;
  if (axis !== "horizontal" && axis !== "vertical") {
    return unavailable(
      "invalid-shape",
      "nodes.mirror needs an axis of horizontal or vertical",
    );
  }
  const allowed = permitted(ctx, "mirror");
  return "nodes" in allowed
    ? { kind: "mirrorNodes", nodes: allowed.nodes, axis }
    : allowed;
}

export function registerTransformCommands(registry: CommandRegistry): void {
  registry.register(
    transformCommand<RotateArgs>(TRANSFORM_COMMAND_IDS.rotate, planRotate),
  );
  registry.register(
    transformCommand<MirrorArgs>(TRANSFORM_COMMAND_IDS.mirror, planMirror),
  );
}
