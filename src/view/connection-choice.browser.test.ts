/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  type ConnectionPolicy,
  createDefaultConnectionPolicy,
  createGraphModel,
  nodeId,
  portId,
} from "../core/index.js";
import { graphOps, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import type {
  ConnectionChoiceRequest,
  ConnectionChooser,
} from "./interact/choice/choice-types.js";
import { key, mouse } from "./interact/input/input-test-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();
const flush = () => new Promise((r) => setTimeout(r, 0));

/** The default policy, but a connection into node `b` is "fast" or "slow". */
function twoKindsIntoB(): ConnectionPolicy {
  const base = createDefaultConnectionPolicy();
  return {
    evaluate(proposal, graph) {
      const outcome = base.evaluate(proposal, graph);
      if (outcome.kind !== "accept" || proposal.to.node !== "b") return outcome;
      const kind = proposal.choice ?? proposal.kind;
      if (kind !== undefined) {
        return {
          kind: "accept",
          plan: { ...outcome.plan, connectionKind: kind },
        };
      }
      return {
        kind: "choice",
        alternatives: ["fast", "slow"].map((k) => ({
          ...outcome.plan,
          connectionKind: k,
          key: k,
          label: `${k} link`,
        })),
      };
    },
  };
}

/** a at (100, 100), b at (300, 100) whose bL takes one connection, c at (100, 200). */
function setup() {
  const model = createGraphModel({ connectionPolicy: twoKindsIntoB() });
  const ops = graphOps([
    twoPortNode("a", 100, 100),
    twoPortNode("b", 300, 100),
    twoPortNode("c", 100, 200),
  ]).map((op) =>
    op.op === "add" && op.entity === "port" && op.record.id === "bL"
      ? { ...op, record: { ...op.record, limit: 1 } }
      : op,
  );
  if (model.submit({ ops }).status !== "accepted") throw new Error("fixture");
  const requests: ConnectionChoiceRequest[] = [];
  const settles: Array<(key: string | undefined) => void> = [];
  const chooser: ConnectionChooser = (request) => {
    requests.push(request);
    return new Promise((resolve) => settles.push(resolve));
  };
  const view = mountView(makeHost(500, 300), {
    model,
    input: { platform: "other", chooseConnection: chooser },
  });
  cleanup(() => view.dispose());
  const answer = (k: string | undefined) => settles.at(-1)?.(k);
  /** Drag from a.aR (120, 100) and release on b.bL (280, 100). */
  const connect = () => mouse(view).drag([120, 100], [280, 100]);
  return { model, view, requests, answer, connect };
}

const kinds = (m: ReturnType<typeof setup>["model"]) =>
  m.reader.connections().map((c) => c.kind);

describe("INT-12, INT-12a, INT-08, CON-05, LIFE-01 connection chooser in the view", () => {
  it("release on a two-kind port asks the chooser; choosing commits one history entry", async () => {
    const { model, view, requests, answer, connect } = setup();
    view.element.focus();
    connect();
    expect(requests).toHaveLength(1);
    const r = requests[0];
    expect(r?.target).toEqual({ node: nodeId("b"), port: portId("bL") });
    expect(r?.options.map((o) => [o.key, o.label])).toEqual([
      ["fast", "fast link"],
      ["slow", "slow link"],
    ]);
    expect(r?.world).toEqual({ x: 280, y: 100 });
    expect(kinds(model)).toEqual([]);
    answer("slow");
    await flush();
    expect(kinds(model)).toEqual(["slow"]);
    expect(model.historyState().undoLabel).toBe("Connect");
    model.undo();
    expect(kinds(model)).toEqual([]);
  });

  it("Press elsewhere cancels, and that press starts no gesture", async () => {
    const { model, view, requests, answer, connect } = setup();
    connect();
    const before = view.viewport.get();
    mouse(view).drag([250, 250], [300, 280]);
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(view.viewport.get()).toEqual(before);
    answer("fast");
    await flush();
    expect(kinds(model)).toEqual([]);
  });

  it("Escape while choosing, from a button in the overlay: cancelled, selection kept", async () => {
    const { model, view, requests, answer, connect } = setup();
    connect();
    view.selection.replace(["n:c"]);
    const picker = document.createElement("button");
    view.overlay.attach(picker, { kind: "world", point: { x: 280, y: 100 } });
    await frames(2);
    picker.focus();
    const esc = key(picker, "Escape");
    expect(esc.defaultPrevented).toBe(true);
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(view.selection.keys()).toEqual(["n:c"]);
    answer("fast");
    await flush();
    expect(kinds(model)).toEqual([]);
  });

  it("Revalidated at commit: a filled slot rejects the chosen option", async () => {
    const { model, requests, answer, connect } = setup();
    connect();
    expect(requests).toHaveLength(1);
    // Another edit fills b.bL's only slot while the host is choosing.
    const other = model.execute({
      kind: "connect",
      from: { node: nodeId("c"), port: portId("cR") },
      to: { node: nodeId("b"), port: portId("bL") },
      choice: "fast",
    });
    expect(other.status).toBe("accepted");
    answer("slow");
    await flush();
    expect(kinds(model)).toEqual(["fast"]);
  });

  it("graph shortcuts do nothing while a choice is pending", () => {
    const { model, view, requests, connect } = setup();
    view.selection.replace(["n:c"]);
    view.element.focus();
    connect();
    view.selection.replace(["n:c"]);
    const del = key(view.element, "Delete");
    expect(del.defaultPrevented).toBe(true);
    expect(model.reader.getNode(nodeId("c"))).toBeDefined();
    expect(requests[0]?.signal.aborted).toBe(false);
  });

  it("dispose while pending aborts the signal; a late answer commits nothing", async () => {
    const { model, view, requests, answer, connect } = setup();
    connect();
    view.dispose();
    expect(requests[0]?.signal.aborted).toBe(true);
    answer("fast");
    await flush();
    expect(kinds(model)).toEqual([]);
  });

  it("setConnectionChooser(undefined) cancels a pending choice; later releases commit nothing", async () => {
    const { model, view, requests, connect } = setup();
    connect();
    view.setConnectionChooser(undefined);
    expect(requests[0]?.signal.aborted).toBe(true);
    connect();
    await flush();
    expect(requests).toHaveLength(1);
    expect(kinds(model)).toEqual([]);
  });
});
