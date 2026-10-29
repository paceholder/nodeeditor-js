/**
 * Exhaustive command dispatch.
 *
 * The `never` check makes the build fail when a command kind has no planner.
 */
import { planConnect, planDisconnect, planReconnect } from "./connect.js";
import { planCreateNode } from "./create-node.js";
import { planDeleteEntities } from "./delete-entities.js";
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
    case "mirrorNodes":
      return planMirrorNodes(command, ctx);
    case "reorderNodes":
      return planReorderNodes(command, ctx);
    case "setPorts":
      return planSetPorts(command, ctx);
    case "updateNode":
      return planUpdateNode(command, ctx);
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
