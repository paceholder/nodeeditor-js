import { describe, expect, it } from "vitest";
import { extractFragment } from "./extract.js";
import { FRAGMENT_FORMAT } from "./fragment-types.js";
import { dateCodecs, end, make, makeModel, setRawPayload } from "./test-kit.js";

function chain() {
  const model = makeModel();
  const a = make(model, "pipe", 0, 0);
  const b = make(model, "pipe", 100, 0);
  const c = make(model, "pipe", 200, 0);
  model.connect(end(a, 1), end(b, 0));
  model.connect(end(b, 1), end(c, 0));
  const [ab, bc] = model.reader.connections().map((x) => x.id);
  if (!ab || !bc) throw new Error("setup");
  return { model, a, b, c, ab, bc };
}

describe("EDT-03 fragment extraction", () => {
  it("copies an internal connection that was not selected", () => {
    const { model, a, b, ab } = chain();
    const r = extractFragment(model.reader, { nodes: [a.node, b.node] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fragment.format).toBe(FRAGMENT_FORMAT);
    expect(r.value.fragment.fragment.nodes.map((n) => n.id)).toEqual([
      a.node,
      b.node,
    ]);
    expect(r.value.fragment.fragment.connections.map((c) => c.id)).toEqual([
      ab,
    ]);
    expect(r.value.fragment.fragment.idCursor).toBeUndefined();
  });

  it("keeps ports in presentation order, including edited ports", () => {
    const model = makeModel();
    const a = make(model, "pipe");
    const [p1, p2] = a.ports;
    if (!p1 || !p2) throw new Error("setup");
    model.execute({
      kind: "setPorts",
      node: a.node,
      affected: "reject",
      ports: [
        { id: p2, direction: "undirected", typeKey: "hydraulic" },
        { direction: "output", typeKey: "signal", label: "extra" },
        { id: p1, direction: "undirected", typeKey: "hydraulic" },
      ],
    });
    const r = extractFragment(model.reader, { nodes: [a.node] });
    const ports = r.ok ? r.value.fragment.fragment.nodes[0]?.ports : [];
    expect(ports?.map((p) => p.id)).toEqual(
      model.reader.getNode(a.node)?.ports,
    );
    expect(ports?.[1]).toMatchObject({ direction: "output", label: "extra" });
  });

  it("rejects a selection without nodes as empty-fragment", () => {
    const { model, ab } = chain();
    const r = extractFragment(model.reader, { nodes: [], connections: [ab] });
    expect(!r.ok && r.error.code).toBe("empty-fragment");
  });
});

describe("EDT-04 external connections are listed, not copied", () => {
  it("lists a connection to an unselected neighbour and reports it", () => {
    const { model, a, b, ab, bc } = chain();
    const r = extractFragment(model.reader, {
      nodes: [b.node],
      connections: [ab],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fragment.fragment.connections).toEqual([]);
    expect(r.value.fragment.external.map((c) => c.id)).toEqual([ab, bc]);
    expect(r.value.fragment.external[0]?.from.node).toBe(a.node);
    expect(r.value.excluded).toEqual([
      { connection: ab, reason: "external" },
      { connection: bc, reason: "external" },
    ]);
  });
});

describe("MOD-08 deterministic fragments", () => {
  it("gives identical output for equal selections in any order", () => {
    const { model, a, b, c, bc } = chain();
    model.execute({ kind: "reorderNodes", nodes: [a.node], to: "front" });
    const one = extractFragment(model.reader, {
      nodes: [a.node, b.node, c.node],
      connections: [bc],
    });
    const two = extractFragment(model.reader, {
      nodes: [c.node, a.node, b.node, a.node],
    });
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    // Paint order: a was brought to front.
    expect(
      one.ok && one.value.fragment.fragment.nodes.map((n) => n.id),
    ).toEqual([b.node, c.node, a.node]);
  });
});

describe("SER-02 payload codecs on copy", () => {
  it("rejects a Date payload without a codec and accepts it with one", () => {
    const model = makeModel();
    const a = make(model, "pipe");
    setRawPayload(model, a.node, { when: new Date(5) });
    const bare = extractFragment(model.reader, { nodes: [a.node] });
    expect(!bare.ok && bare.error.code).toBe("non-json-payload");
    expect(!bare.ok && bare.error.entities).toEqual([a.node]);
    const coded = extractFragment(
      model.reader,
      { nodes: [a.node] },
      { codecs: dateCodecs("pipe") },
    );
    expect(coded.ok && coded.value.fragment.fragment.nodes[0]?.payload).toEqual(
      { when: 5 },
    );
  });
});
