import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupId, nodeId } from "../../base/ids/ids.js";
import { loadDocument, saveDocument } from "./document.js";
import { exportSnapshot } from "./export.js";
import { loadSnapshot } from "./load.js";
import {
  diffOk,
  loadedModel,
  makeTestModel,
  nodesOf,
  sampleSnapshot,
  target,
} from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

/** The sample snapshot with both nodes in group g1 and a locked, styled group g2 removed or kept by `mutate`. */
function grouped(mutate: (s: Record<string, unknown>) => void = () => {}) {
  const s = sampleSnapshot();
  nodesOf(s)[0] = { ...nodesOf(s)[0], group: "g2" };
  nodesOf(s)[1] = { ...nodesOf(s)[1], group: "g1" };
  s.groups = [
    { id: "g2", title: "Second", locked: true, style: "note" },
    { id: "g1", title: "First" },
  ];
  mutate(s);
  return s;
}

const errorsOf = (input: unknown) => {
  const r = validateSnapshot(input);
  return r.ok ? [] : r.rejection;
};

describe("groups in the snapshot", () => {
  it("round trip: export then load reproduces group IDs, titles, lock states, members and group order", () => {
    const model = loadedModel(grouped());
    expect(model.reader.groups()).toEqual([
      { id: "g2", title: "Second", locked: true, style: "note" },
      { id: "g1", title: "First", locked: false },
    ]);
    expect(model.reader.groupMembers(groupId("g1")).map((n) => n.id)).toEqual([
      "n2",
    ]);
    const exported = exportSnapshot(model);
    expect(exported.groups).toEqual([
      { id: "g2", title: "Second", locked: true, style: "note" },
      { id: "g1", title: "First" },
    ]);
    const again = makeTestModel();
    expect(loadSnapshot(again, exported).ok).toBe(true);
    expect(JSON.stringify(exportSnapshot(again))).toBe(
      JSON.stringify(exported),
    );
    expect(JSON.parse(JSON.stringify(exported))).toEqual(exported);
  });

  it("omits the groups section and the node's group field when there are none", () => {
    const exported = exportSnapshot(loadedModel());
    expect("groups" in exported).toBe(false);
    expect(exported.nodes.every((n) => !("group" in n))).toBe(true);
  });

  it("a document saved before groups existed loads without error and has no groups", () => {
    const model = loadedModel(sampleSnapshot());
    expect(model.reader.groups()).toEqual([]);
    const text = `{"format":"@paceholder/nodeeditor-js/document","version":1,"graph":${JSON.stringify(sampleSnapshot())}}`;
    const fresh = makeTestModel();
    expect(loadDocument(fresh, text).ok).toBe(true);
    expect(fresh.reader.groups()).toEqual([]);
  });

  it("a saved document carries groups through save and load", () => {
    const model = loadedModel(grouped());
    const saved = saveDocument(model);
    if (!saved.ok) throw new Error("save failed");
    const fresh = makeTestModel();
    expect(loadDocument(fresh, saved.value).ok).toBe(true);
    expect(fresh.reader.groups().map((g) => g.id)).toEqual(["g2", "g1"]);
    expect(fresh.reader.getNode(nodeId("n1"))?.group).toBe("g2");
  });

  it("rejects a node that names a missing group with a path at that node's group", () => {
    const e = errorsOf(
      grouped((s) => {
        nodesOf(s)[0] = { ...nodesOf(s)[0], group: "g9" };
      }),
    );
    expect(e).toContainEqual(
      expect.objectContaining({
        code: "dangling-reference",
        path: "nodes[0].group",
        entities: ["n1", "g9"],
      }),
    );
  });

  it("rejects a group that no node names", () => {
    const e = errorsOf(
      grouped((s) => {
        const { group: _drop, ...free } = nodesOf(s)[1] as Record<
          string,
          unknown
        >;
        nodesOf(s)[1] = free;
      }),
    );
    expect(e).toEqual([
      expect.objectContaining({
        code: "dangling-reference",
        path: "groups[1]",
        entities: ["g1"],
      }),
    ]);
  });

  it("rejects a duplicate group ID and a group ID another entity uses", () => {
    const twice = errorsOf(
      grouped((s) => {
        (s.groups as unknown[]).push({ id: "g1", title: "Again" });
      }),
    );
    expect(twice[0]).toMatchObject({
      code: "duplicate-id",
      path: "groups[2].id",
    });
    const clash = errorsOf(
      grouped((s) => {
        s.groups = [
          { id: "g2", title: "Second" },
          { id: "n1", title: "Clash" },
        ];
        nodesOf(s)[1] = { ...nodesOf(s)[1], group: "n1" };
      }),
    );
    expect(clash[0]).toMatchObject({
      code: "duplicate-id",
      path: "groups[1].id",
    });
  });

  it("rejects malformed group entries with their paths and never throws", () => {
    const codes = (groups: unknown) =>
      errorsOf(
        grouped((s) => {
          s.groups = groups;
        }),
      ).map((e) => `${e.code}@${e.path}`);
    expect(codes(7)).toContain("invalid-shape@groups");
    expect(codes([7, { id: "g1", title: "First" }])).toContain(
      "invalid-shape@groups[0]",
    );
    expect(
      codes([
        { id: "g2", title: "x".repeat(201) },
        { id: "g1", title: "First" },
      ]),
    ).toContain("out-of-range@groups[0]");
    expect(
      codes([
        { id: "g2", title: "ok", locked: "yes", extra: 1 },
        { id: "g1", title: "First" },
      ]),
    ).toEqual(
      expect.arrayContaining([
        "invalid-shape@groups[0].locked",
        "invalid-shape@groups[0].extra",
      ]),
    );
  });

  it("keeps the group ID counter ahead of loaded group IDs, so a new group gets a fresh ID", () => {
    const model = loadedModel(grouped());
    const made = model.groupNodes([nodeId("n2")]);
    if (made.status !== "accepted") throw new Error("group failed");
    expect(made.changed.groups).toContain("g3");
  });
});

describe("snapshot diff reports group and membership changes", () => {
  it("adds a new group with its members, so a host that pushes snapshots can create groups", () => {
    const model = loadedModel();
    const patch = diffOk(
      model.reader,
      target((s) => {
        nodesOf(s)[0] = { ...nodesOf(s)[0], group: "g1" };
        nodesOf(s)[1] = { ...nodesOf(s)[1], group: "g1" };
        s.groups = [{ id: "g1", title: "Pushed" }];
      }),
    );
    expect(patch.ops.map((o) => `${o.op}:${o.entity}`)).toEqual([
      "add:group",
      "update:node",
      "update:node",
    ]);
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.groupMembers(groupId("g1"))).toHaveLength(2);
  });

  it("removes, renames and re-locks groups and moves members between them", () => {
    const model = loadedModel(grouped());
    const wanted = target((s) => {
      nodesOf(s)[0] = { ...nodesOf(s)[0], group: "g1" };
      nodesOf(s)[1] = { ...nodesOf(s)[1], group: "g1" };
      s.groups = [{ id: "g1", title: "Renamed", locked: true }];
    });
    const patch = diffOk(model.reader, wanted);
    expect(patch.ops.map((o) => `${o.op}:${o.entity}`)).toEqual([
      "remove:group",
      "update:group",
      "update:node",
    ]);
    expect(model.submit(patch).status).toBe("accepted");
    expect(model.reader.groups()).toEqual([
      { id: "g1", title: "Renamed", locked: true },
    ]);
    expect(diffOk(model.reader, wanted).ops).toEqual([]);
  });
});

describe("the format document's group example", () => {
  it("validates and loads as written", () => {
    const text = readFileSync(
      new URL("../../../../docs/format.md", import.meta.url),
      "utf8",
    );
    const section = text.slice(text.indexOf("### Groups"));
    const json = section.slice(
      section.indexOf("```json") + 7,
      section.indexOf("```", section.indexOf("```json") + 7),
    );
    const model = makeTestModel();
    const loaded = loadSnapshot(model, JSON.parse(json));
    expect(loaded.ok).toBe(true);
    expect(model.reader.groups()).toEqual([
      { id: "g1", title: "Inlet stage", locked: true, style: "note" },
    ]);
  });
});
