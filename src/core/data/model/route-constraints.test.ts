import { describe, expect, it } from "vitest";
import { connectionId } from "../../base/ids/ids.js";
import { invertPatch } from "../patch/invert.js";
import { seeded } from "../patch/test-setup.js";
import type { Patch } from "../patch/types.js";
import type { RouteConstraint } from "./records.js";
import { normalizeRoute, translateConstraints } from "./route-constraints.js";
import { mkConn } from "./test-helpers.js";
import { validateConnectionRecord } from "./validate-records.js";

const vert = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "vertical",
  at,
});
const horiz = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "horizontal",
  at,
});
const withRoute = (route: unknown) => ({
  ...mkConn("c1", "n1", "p1", "n2", "p2"),
  route,
});

describe("route constraint validation", () => {
  it("accepts valid pins and an absent route", () => {
    expect(validateConnectionRecord(withRoute([vert(120), horiz(-4)])).ok).toBe(
      true,
    );
    expect(
      validateConnectionRecord(mkConn("c1", "n1", "p1", "n2", "p2")).ok,
    ).toBe(true);
  });

  it("rejects non-finite coordinates, unknown kinds and orientations", () => {
    expect(validateConnectionRecord(withRoute([vert(Number.NaN)])).ok).toBe(
      false,
    );
    expect(
      validateConnectionRecord(withRoute([vert(Number.POSITIVE_INFINITY)])).ok,
    ).toBe(false);
    expect(
      validateConnectionRecord(
        withRoute([{ kind: "waypoint", orientation: "vertical", at: 1 }]),
      ).ok,
    ).toBe(false);
    expect(
      validateConnectionRecord(
        withRoute([{ kind: "segment", orientation: "diagonal", at: 1 }]),
      ).ok,
    ).toBe(false);
    expect(validateConnectionRecord(withRoute("x")).ok).toBe(false);
  });

  it("stores an empty list as absent", () => {
    expect(normalizeRoute([])).toBeUndefined();
    expect(normalizeRoute(undefined)).toBeUndefined();
    const route = [vert(1)];
    expect(normalizeRoute(route)).toBe(route);
  });
});

describe("route update ops", () => {
  it("applies, inverts and redoes a route update op", () => {
    const { reader, apply } = seeded();
    const id = connectionId("c1");
    const route = [vert(120)];
    const patch: Patch = {
      ops: [
        {
          op: "update",
          entity: "connection",
          id,
          fields: { route: { new: route } },
        },
      ],
    };
    const done = apply(patch);
    if (!done.ok) throw new Error("expected ok");
    expect(reader.getConnection(id)?.route).toEqual(route);

    const undo = apply(invertPatch(done.value.patch));
    expect(undo.ok).toBe(true);
    expect(reader.getConnection(id)?.route).toBeUndefined();

    const redo = apply(done.value.patch);
    expect(redo.ok).toBe(true);
    expect(reader.getConnection(id)?.route).toEqual(route);
  });
});

describe("translateConstraints", () => {
  it("shifts vertical pins by dx and horizontal pins by dy only", () => {
    expect(translateConstraints([vert(10), horiz(20)], 5, 7)).toEqual([
      vert(15),
      horiz(27),
    ]);
    expect(translateConstraints([vert(10), horiz(20)], 0, 0)).toEqual([
      vert(10),
      horiz(20),
    ]);
  });
});
