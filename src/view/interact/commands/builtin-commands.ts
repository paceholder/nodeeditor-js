/**
 * Built-in editor commands (INT-07, MOD-11, D9): edit.delete, history.undo/redo,
 * selection.selectAll/clear, nodes.nudge, nodes.rotate/mirror, the view.* commands, and
 * edit.copy/cut/paste/duplicate when a clipboard service is given. Each is a thin wrapper
 * over the model's command API or the view-local services, so a shortcut and an API call
 * produce identical patches on equal models.
 */
import {
  type Availability,
  type Command,
  type ConnectionId,
  err,
  type NodeId,
  ok,
  type Rejection,
  rejectionOf,
} from "../../../core/index.js";
import {
  CLIPBOARD_COMMAND_IDS,
  registerClipboardCommands,
} from "../clipboard/clipboard-commands.js";
import type { ClipboardService } from "../clipboard/clipboard-service.js";
import { connectionKey, nodeKey } from "../selection/selection-model.js";
import { capabilityProbe } from "../tools/tool-context.js";
import {
  type CommandContext,
  type CommandOutcome,
  type CommandRegistry,
  type EditorCommand,
  outcomeOf,
} from "./command-registry.js";
import type { EditableModel } from "./editable-model.js";
import {
  registerTransformCommands,
  TRANSFORM_COMMAND_IDS,
} from "./transform-commands.js";

export interface NudgeArgs {
  /** World units. */
  readonly dx: number;
  readonly dy: number;
}

export const COMMAND_IDS = {
  delete: "edit.delete",
  undo: "history.undo",
  redo: "history.redo",
  selectAll: "selection.selectAll",
  clearSelection: "selection.clear",
  nudge: "nodes.nudge",
  ...TRANSFORM_COMMAND_IDS,
  fitAll: "view.fitAll",
  fitSelection: "view.fitSelection",
  resetView: "view.resetView",
  reveal: "view.reveal",
  ...CLIPBOARD_COMMAND_IDS,
} as const;

interface Refusal {
  readonly available: false;
  readonly reason: Rejection;
}

const refusal = (message: string, ids: readonly string[] = []): Refusal => ({
  available: false,
  reason: rejectionOf("unknown-entity", message, ids),
});

const READ_ONLY: Refusal = refusal("The view has no editable model");
const MODEL_MISSING = rejectionOf("unknown-entity", "The view has no model");
const OK: Availability = { available: true };

/** A command that is one model command; availability is the model's own dry run. */
function modelEdit<A>(
  id: string,
  plan: (
    ctx: CommandContext,
    args: A,
    model: EditableModel,
  ) => Command | Refusal,
): EditorCommand<A> {
  const resolve = (ctx: CommandContext, args: A) =>
    ctx.model ? plan(ctx, args, ctx.model) : READ_ONLY;
  return {
    id,
    labelKey: `command.${id}`,
    availability(args, ctx) {
      const r = resolve(ctx, args);
      return "available" in r ? r : (ctx.model?.can(r) ?? READ_ONLY);
    },
    run(args, ctx) {
      const r = resolve(ctx, args);
      if ("available" in r) {
        return err(r.reason);
      }
      return ctx.model
        ? outcomeOf(ctx.model.execute(r))
        : err(READ_ONLY.reason);
    },
  };
}

function planDelete(ctx: CommandContext): Command | Refusal {
  const nodes = ctx.selection.nodeIds();
  const connections = ctx.selection.connectionIds();
  return nodes.length === 0 && connections.length === 0
    ? refusal("Nothing is selected")
    : { kind: "deleteEntities", nodes, connections };
}

function planNudge(
  ctx: CommandContext,
  args: NudgeArgs,
  model: EditableModel,
): Command | Refusal {
  if (!Number.isFinite(args?.dx) || !Number.isFinite(args?.dy)) {
    return refusal("nodes.nudge needs finite dx and dy");
  }
  const can = capabilityProbe(model);
  const moves = ctx.selection.nodeIds().flatMap((id) => {
    const node = model.reader.getNode(id);
    if (!node || !can("move", id).available) return [];
    const position = {
      x: node.position.x + args.dx,
      y: node.position.y + args.dy,
    };
    return [{ node: id, position }];
  });
  return moves.length === 0
    ? refusal("No selected node can move")
    : { kind: "moveNodes", moves };
}

function history(direction: "undo" | "redo"): EditorCommand {
  const id = `history.${direction}`;
  return {
    id,
    labelKey: `command.${id}`,
    availability: (_args, { model }) =>
      model ? model.can({ kind: direction }) : READ_ONLY,
    run: (_args, { model }) =>
      model
        ? outcomeOf(direction === "undo" ? model.undo() : model.redo())
        : err(READ_ONLY.reason),
  };
}

/** A command without arguments. */
function simple(
  id: string,
  availability: (ctx: CommandContext) => Availability,
  run: (ctx: CommandContext) => CommandOutcome,
): EditorCommand {
  return {
    id,
    labelKey: `command.${id}`,
    availability: (_args, ctx) => availability(ctx),
    run: (_args, ctx) => run(ctx),
  };
}

function selectAll(ctx: CommandContext): CommandOutcome {
  const { reader, selection } = ctx;
  if (!reader) return err(MODEL_MISSING);
  const keys = [
    ...reader.nodes().map((n) => nodeKey(n.id)),
    ...reader.connections().map((c) => connectionKey(c.id)),
  ];
  return ok({ changed: selection.replace(keys) });
}

/** Registers every built-in command; the clipboard ones need the view's service. */
export function registerBuiltinCommands(
  registry: CommandRegistry,
  clipboard?: ClipboardService,
): void {
  registry.register(modelEdit<void>(COMMAND_IDS.delete, planDelete));
  registry.register(history("undo"));
  registry.register(history("redo"));
  registry.register(
    simple(
      COMMAND_IDS.selectAll,
      ({ reader }) =>
        reader && (reader.nodes().length > 0 || reader.connections().length > 0)
          ? OK
          : refusal("The graph is empty"),
      selectAll,
    ),
  );
  registry.register(
    simple(
      COMMAND_IDS.clearSelection,
      () => OK,
      ({ selection }) => ok({ changed: selection.clear() }),
    ),
  );
  registry.register(modelEdit<NudgeArgs>(COMMAND_IDS.nudge, planNudge));
  registerTransformCommands(registry);
  registry.register(
    simple(
      COMMAND_IDS.fitAll,
      () => OK,
      ({ view }) => view.fitAll(),
    ),
  );
  registry.register(
    simple(
      COMMAND_IDS.fitSelection,
      ({ selection }) =>
        selection.size > 0 ? OK : refusal("Nothing is selected"),
      ({ view }) => view.fitSelection(),
    ),
  );
  registry.register(
    simple(
      COMMAND_IDS.resetView,
      () => OK,
      ({ view }) => view.resetView(),
    ),
  );
  registry.register({
    id: COMMAND_IDS.reveal,
    labelKey: `command.${COMMAND_IDS.reveal}`,
    availability: () => OK,
    run: (id: NodeId | ConnectionId, { view }) => view.reveal(id),
  });
  if (clipboard) registerClipboardCommands(registry, clipboard);
}
