import { describe, expect, it } from "vitest";
import type { GroupId, NodeId } from "../../base/ids/ids.js";
import { delegatingModel } from "../../edit/commands/test-kit.js";
import type { GraphModel } from "../../graph-model.js";
import { extractFragment } from "./extract.js";
import { fragmentToText, parseFragmentText } from "./fragment-text.js";
import { makeModel, pairWithNeighbour } from "./test-kit.js";

function group(model: GraphModel, nodes: readonly NodeId[], title = "Pair") {
  const result = model.groupNodes(nodes, { title });
  if (result.status !== "accepted") throw new Error("group failed");
  return result.changed.groups[0] as GroupId;
}

function setup() {
  const model = makeModel();
  const { a, b, c } = pairWithNeighbour(model);
  const id = group(model, [a.node, b.node]);
  return { model, a: a.node, b: b.node, c: c.node, id };
}

describe("groups in the snapshot: clipboard fragments", () => {
  it("a selected group is extracted with all its members, even those not selected", () => {
    const { model, a, b, id } = setup();
    const r = extractFragment(model.reader, { nodes: [], groups: [id] });
    if (!r.ok) throw new Error(r.rejection.message);
    const { fragment } = r.value.fragment;
    expect(fragment.nodes.map((n) => n.id)).toEqual([a, b]);
    expect(fragment.groups).toEqual([{ id, title: "Pair" }]);
    expect(fragment.nodes.every((n) => n.group === id)).toBe(true);
    expect(fragment.connections).toHaveLength(1);
  });

  it("a member copied without its group is extracted as a free node", () => {
    const { model, a } = setup();
    const r = extractFragment(model.reader, { nodes: [a] });
    if (!r.ok) throw new Error(r.rejection.message);
    expect(r.value.fragment.fragment.groups).toBeUndefined();
    expect("group" in (r.value.fragment.fragment.nodes[0] ?? {})).toBe(false);
  });

  it("reports an unknown group", () => {
    const { model } = setup();
    const r = extractFragment(model.reader, {
      nodes: [],
      groups: ["g99" as GroupId],
    });
    expect(!r.ok && r.rejection.code).toBe("unknown-entity");
  });
});

describe("clipboard text keeps groups", () => {
  it("a fragment with a group survives the trip through clipboard text", () => {
    const { model, id } = setup();
    const extracted = extractFragment(model.reader, {
      nodes: [],
      groups: [id],
    });
    if (!extracted.ok) throw new Error("extract failed");
    const parsed = parseFragmentText(fragmentToText(extracted.value.fragment));
    if (!parsed.ok) throw new Error("parse failed");
    expect(parsed.value).toEqual(extracted.value.fragment);
  });
});

describe("duplicate and paste fragments with groups", () => {
  it("pasting a copied group creates a new group with a new ID holding the new nodes; the original is unchanged and the paste is one history entry", () => {
    const { model, a, b, id } = setup();
    const extracted = extractFragment(model.reader, {
      nodes: [],
      groups: [id],
    });
    if (!extracted.ok) throw new Error("extract failed");
    const before = model.reader.nodes().length;
    const patches: number[] = [];
    model.on("change", () => patches.push(1));
    const pasted = model.execute({
      kind: "paste",
      fragment: extracted.value.fragment,
      placement: { kind: "offset", by: { x: 0, y: 200 } },
    });
    if (pasted.status !== "accepted") throw new Error("paste failed");
    expect(patches).toHaveLength(1);
    const [copy] = pasted.changed.groups;
    expect(copy).toBeDefined();
    expect(copy).not.toBe(id);
    const copies = model.reader.groupMembers(copy as GroupId).map((n) => n.id);
    expect(copies).toHaveLength(2);
    expect(copies).not.toContain(a);
    expect(model.reader.getGroup(copy as GroupId)).toMatchObject({
      title: "Pair",
      locked: false,
    });
    expect(model.reader.groupMembers(id).map((n) => n.id)).toEqual([a, b]);
    expect(model.reader.nodes()).toHaveLength(before + 2);
    model.undo();
    expect(model.reader.getGroup(copy as GroupId)).toBeUndefined();
    expect(model.reader.nodes()).toHaveLength(before);
  });

  it("the same fragment pasted twice gives two distinct groups", () => {
    const { model, id } = setup();
    const extracted = extractFragment(model.reader, {
      nodes: [],
      groups: [id],
    });
    if (!extracted.ok) throw new Error("extract failed");
    const paste = () =>
      model.execute({
        kind: "paste",
        fragment: extracted.value.fragment,
        placement: { kind: "offset", by: { x: 0, y: 200 } },
      });
    paste();
    paste();
    expect(model.reader.groups()).toHaveLength(3);
  });

  it("duplicating a member without its group gives a free node; with its group gives a copied group", () => {
    const { model, a, id } = setup();
    const placement = { kind: "offset", by: { x: 20, y: 20 } } as const;
    const lone = model.execute({ kind: "duplicate", nodes: [a], placement });
    if (lone.status !== "accepted") throw new Error("duplicate failed");
    const copy = model.reader.getNode(lone.changed.nodes[0] as NodeId);
    expect(copy?.group).toBeUndefined();
    expect(model.reader.groups()).toHaveLength(1);
    const whole = model.execute({
      kind: "duplicate",
      nodes: [],
      groups: [id],
      placement,
    });
    expect(whole.status).toBe("accepted");
    expect(model.reader.groups()).toHaveLength(2);
  });

  it("a pasted copy of a locked group keeps its lock state", () => {
    const { model, id } = setup();
    model.setGroupLocked(id, true);
    const extracted = extractFragment(model.reader, {
      nodes: [],
      groups: [id],
    });
    if (!extracted.ok) throw new Error("extract failed");
    const pasted = model.execute({
      kind: "paste",
      fragment: extracted.value.fragment,
      placement: { kind: "offset", by: { x: 0, y: 200 } },
    });
    if (pasted.status !== "accepted") throw new Error("paste failed");
    expect(
      model.reader.getGroup(pasted.changed.groups[0] as GroupId)?.locked,
    ).toBe(true);
  });

  it("rejects a pasted fragment whose node names a group the fragment lacks", () => {
    const { model, id } = setup();
    const extracted = extractFragment(model.reader, {
      nodes: [],
      groups: [id],
    });
    if (!extracted.ok) throw new Error("extract failed");
    const { groups: _drop, ...inner } = extracted.value.fragment.fragment;
    const broken = { ...extracted.value.fragment, fragment: inner };
    const result = model.execute({
      kind: "paste",
      fragment: broken,
      placement: { kind: "offset", by: { x: 0, y: 200 } },
    });
    expect(result.status === "rejected" && result.rejection.code).toBe(
      "dangling-reference",
    );
  });

  it("when the host names nodes, a pasted fragment's create-fragment intent lists the group and each node's group key", () => {
    const { model, pair } = delegatingModel();
    const made = model.groupNodes([pair.a.node, pair.b.node], {
      title: "Hosted",
    });
    expect(made.status).toBe("accepted");
    const id = model.reader.groups()[0]?.id;
    if (!id) throw new Error("no group");
    const copied = extractFragment(model.reader, { nodes: [], groups: [id] });
    if (!copied.ok) throw new Error("extract failed");
    const plan = model.plan({
      kind: "paste",
      fragment: copied.value.fragment,
      placement: { kind: "offset", by: { x: 0, y: 100 } },
    });
    if (plan.kind !== "delegated" || plan.intent.kind !== "create-fragment")
      throw new Error(`got ${plan.kind}`);
    expect(plan.intent.groups).toEqual([
      { key: "group-1", title: "Hosted", locked: false },
    ]);
    expect(plan.intent.nodes.map((n) => n.group)).toEqual([
      "group-1",
      "group-1",
    ]);
  });
});
