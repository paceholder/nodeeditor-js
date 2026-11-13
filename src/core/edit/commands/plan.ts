/**
 * Exhaustive command dispatch.
 *
 * The `never` check makes the build fail when a command kind has no planner.
 */
import { planConnect, planDisconnect, planReconnect } from "./connect.js";
import { planCreateNode } from "./create-node.js";
import { planDeleteEntities } from "./delete-entities.js";
import {
  planAddToGroup,
  planGroupNodes,
  planRemoveFromGroup,
  planRenameGroup,
  planSetGroupLocked,
  planUngroup,
} from "./group-commands.js";
import { rejected } from "./ops.js";
import { planResizeNode } from "./resize-node.js";
import { planResetRoutes, planSetRoute } from "./route-commands.js";
import { planSetPorts } from "./set-ports.js";
import {
  planMirrorNodes,
  planMoveNodes,
  planReorderNodes,
  planRotateNodes,
} from "./transform-nodes.js";
import type { Command, PlanContext, PlanResult } from "./types.js";
import { planUpdateNode } from "./update-node.js";

export function planCommand(command: Command, ctx: PlanContext): PlanResult {
  switch (command.kind) {
    case "createNode":
      return planCreateNode(command, ctx);
    case "deleteEntities":
      return planDeleteEntities(command, ctx);
    case "connect":
      return planConnect(command, ctx);
    case "reconnect":
      return planReconnect(command, ctx);
    case "disconnect":
      return planDisconnect(command, ctx);
    case "moveNodes":
      return planMoveNodes(command, ctx);
    case "rotateNodes":
      return planRotateNodes(command, ctx);
    case "resizeNode":
      return planResizeNode(command, ctx);
    case "mirrorNodes":
      return planMirrorNodes(command, ctx);
    case "reorderNodes":
      return planReorderNodes(command, ctx);
    case "setPorts":
      return planSetPorts(command, ctx);
    case "updateNode":
      return planUpdateNode(command, ctx);
    case "setRoute":
      return planSetRoute(command, ctx);
    case "resetRoutes":
      return planResetRoutes(command, ctx);
    case "paste":
      return ctx.fragments
        ? ctx.fragments.paste(command, ctx)
        : unsupported(command.kind);
    case "duplicate":
      return ctx.fragments
        ? ctx.fragments.duplicate(command, ctx)
        : unsupported(command.kind);
    case "groupNodes":
      return planGroupNodes(command, ctx);
    case "ungroup":
      return planUngroup(command, ctx);
    case "addToGroup":
      return planAddToGroup(command, ctx);
    case "removeFromGroup":
      return planRemoveFromGroup(command, ctx);
    case "renameGroup":
      return planRenameGroup(command, ctx);
    case "setGroupLocked":
      return planSetGroupLocked(command, ctx);
    case "undo":
      return { kind: "history", direction: "undo", label: "Undo" };
    case "redo":
      return { kind: "history", direction: "redo", label: "Redo" };
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

/** Paste and duplicate need fragment planners that only the facade supplies. */
function unsupported(kind: string): PlanResult {
  return rejected(
    "unsupported-command",
    `This model has no planner for ${kind} commands`,
  );
}
