import { describe, expect, it } from "vitest";
import { portId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import { mkConn, mkNode, mkPort } from "../../data/model/test-helpers.js";
import { createGraphModel } from "../../graph-model.js";
import type { DocumentReplacement } from "./replace-document.js";

function edited() {
  const model = createGraphModel();
  model.submit({ ops: [{ op: "add", entity: "node", record: mkNode("a") }] });
  const events: string[] = [];
  for (const type of ["change", "reset", "history"] as const)
    model.on(type, () => events.push(type));
  return { model, events };
}

const replacement = (
  over: Partial<DocumentReplacement> = {},
): DocumentReplacement => ({
  nodes: [mkNode("b", { ports: [portId("p1")] })],
  ports: [mkPort("p1", "b")],
  connections: [],
  idCursor: {},
  ...over,
});

describe("whole-document replacement is checked before it changes anything", () => {
  const bad: [string, DocumentReplacement][] = [
    ["a node listing a missing port", replacement({ ports: [] })],
    [
      "a port its node does not list",
      replacement({ ports: [mkPort("p1", "b"), mkPort("p2", "b")] }),
    ],
    [
      "a port whose node is missing",
      replacement({ ports: [mkPort("p1", "b"), mkPort("p9", "zz")] }),
    ],
    [
      "an ID used twice across kinds",
      replacement({
        nodes: [mkNode("b", { ports: [portId("b")] })],
        ports: [mkPort("b", "b")],
      }),
    ],
    [
      "a dangling connection",
      replacement({ connections: [mkConn("c1", "b", "p1", "x", "p9")] }),
    ],
    [
      "a malformed record",
      replacement({
        nodes: [{ ...mkNode("b", { ports: [portId("p1")] }), z: Number.NaN }],
      }),
    ],
  ];
  for (const [what, input] of bad) {
    it(`refuses ${what} with nothing changed`, () => {
      const { model, events } = edited();
      const revision = model.revision();
      expect(() => model.replaceDocument(input)).toThrow(MisuseError);
      expect(model.revision()).toBe(revision);
      expect(model.reader.nodes().map((n) => n.id)).toEqual(["a"]);
      expect(model.historyState().canUndo).toBe(true);
      expect(events).toEqual([]);
    });
  }

  it("accepts a valid replacement and stores copies", () => {
    const { model } = edited();
    const input = replacement();
    model.replaceDocument(input);
    expect(model.reader.nodes().map((n) => n.id)).toEqual(["b"]);
    expect(model.reader.getNode(input.nodes[0]?.id ?? ("" as never))).not.toBe(
      input.nodes[0],
    );
  });

  it("refuses a replacement requested from inside an event handler", () => {
    const { model } = edited();
    let thrown: unknown;
    model.on("change", () => {
      try {
        model.replaceDocument(replacement());
      } catch (error) {
        thrown = error;
      }
    });
    model.submit({ ops: [{ op: "add", entity: "node", record: mkNode("c") }] });
    expect(thrown).toBeInstanceOf(MisuseError);
    expect(model.reader.nodes().map((n) => n.id)).toEqual(["a", "c"]);
  });
});
