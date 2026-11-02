/** setRoute and resetRoutes planners. */
import type { ConnectionId } from "../../base/ids/ids.js";
import type { RouteConstraint } from "../../data/model/records.js";
import { normalizeRoute } from "../../data/model/route-constraints.js";
import { isRouteShape } from "../../data/model/validate-records.js";
import { valuesEqual } from "../../data/patch/equal.js";
import type { PatchOp } from "../../data/patch/types.js";
import { ready, rejected, unknownEntity } from "./ops.js";
import type { PlanContext, PlannerFor } from "./types.js";

/** A connection update op that changes only `route`, or nothing when it already holds. */
function routeOp(
  ctx: PlanContext,
  id: ConnectionId,
  next: readonly RouteConstraint[] | undefined,
): PatchOp | undefined {
  const current = ctx.reader.getConnection(id);
  if (!current || valuesEqual(current.route, next)) return undefined;
  return {
    op: "update",
    entity: "connection",
    id,
    fields: {
      route: {
        ...(current.route === undefined ? {} : { old: current.route }),
        ...(next === undefined ? {} : { new: next }),
      },
    },
  };
}

export const planSetRoute: PlannerFor<"setRoute"> = (command, ctx) => {
  if (!ctx.reader.getConnection(command.connection))
    return unknownEntity(command.connection);
  if (!isRouteShape(command.route)) {
    return rejected(
      "malformed-record",
      "Route constraints are malformed or not finite",
      [command.connection],
    );
  }
  const op = routeOp(ctx, command.connection, normalizeRoute(command.route));
  return ready("Edit route", op ? [op] : [], ctx.ids);
};

export const planResetRoutes: PlannerFor<"resetRoutes"> = (command, ctx) => {
  const ops: PatchOp[] = [];
  for (const id of new Set(command.connections)) {
    const connection = ctx.reader.getConnection(id);
    if (!connection) return unknownEntity(id);
    const op = connection.route ? routeOp(ctx, id, undefined) : undefined;
    if (op) ops.push(op);
  }
  if (ops.length === 0) {
    return rejected(
      "nothing-to-do",
      "None of the connections has a route to reset",
    );
  }
  return ready("Reset route", ops, ctx.ids);
};
