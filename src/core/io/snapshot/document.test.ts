import { afterEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "../../base/result.js";
import { loadDocument, saveDocument } from "./document.js";
import { exportSnapshot } from "./export.js";
import { loadSnapshot } from "./load.js";
import { createPayloadCodecRegistry } from "./snapshot-errors.js";
import { loadedModel, makeTestModel, sampleSnapshot } from "./test-kit.js";

function withPayload(payload: unknown) {
  const input = sampleSnapshot();
  const nodes = input.nodes as Record<string, unknown>[];
  nodes[0] = { ...nodes[0], payload: null };
  const model = loadedModel(input);
  // Bypass the type system the way a host with a Date in its payload would.
  const node = model.reader.getNode("n1" as never);
  if (!node) throw new Error("setup");
  model.replaceDocument({
    nodes: [
      { ...node, payload: payload as never },
      ...model.reader.nodes().slice(1),
    ],
    ports: model.reader.ports(),
    connections: model.reader.connections(),
    idCursor: model.idCursor(),
  });
  return model;
}

describe("versioned document", () => {
  it("declares its version and wraps the snapshot", () => {
    const model = loadedModel();
    const saved = saveDocument(model);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const parsed = JSON.parse(saved.value);
    expect(Object.keys(parsed)).toEqual(["format", "version", "graph"]);
    expect(parsed.format).toBe("nodeeditor-js/document");
    expect(parsed.version).toBe(1);
    expect(parsed.graph).toEqual(
      JSON.parse(JSON.stringify(exportSnapshot(model))),
    );
  });

  it("loads a saved document into a fresh model with the same state", () => {
    const model = loadedModel();
    const saved = saveDocument(model);
    if (!saved.ok) throw new Error("save failed");
    const fresh = makeTestModel();
    const loaded = loadDocument(fresh, saved.value);
    expect(loaded.ok).toBe(true);
    expect(exportSnapshot(fresh)).toEqual(exportSnapshot(model));
  });
});

describe("payload codecs", () => {
  it("rejects a Date payload without a codec, naming node and field", () => {
    const model = withPayload({ when: new Date(0), ok: 1 });
    const saved = saveDocument(model);
    expect(saved.ok).toBe(false);
    expect(!saved.ok && saved.error[0]).toMatchObject({
      code: "non-json-payload",
      path: "graph.nodes[0].payload.when",
      entities: ["n1"],
    });
  });

  it("round-trips a Date payload through a registered codec", () => {
    const model = withPayload({ when: new Date(5) });
    const codecs = createPayloadCodecRegistry();
    codecs.register("pipe", {
      encode: (v) =>
        v === null
          ? ok(null)
          : ok({ when: (v as unknown as { when: Date }).when.getTime() }),
      decode: (j) =>
        j === null
          ? ok(null)
          : ok({ when: new Date((j as { when: number }).when) } as never),
    });
    const saved = saveDocument(model, { codecs });
    expect(saved.ok && JSON.parse(saved.value).graph.nodes[0].payload).toEqual({
      when: 5,
    });
    const fresh = makeTestModel();
    if (!saved.ok) return;
    expect(loadDocument(fresh, saved.value, { codecs }).ok).toBe(true);
    const payload = fresh.reader.getNode("n1" as never)?.payload as unknown as {
      when: Date;
    };
    expect(payload.when).toBeInstanceOf(Date);
    expect(payload.when.getTime()).toBe(5);
  });

  it("reports a codec failure with the payload path and changes nothing", () => {
    const codecs = createPayloadCodecRegistry();
    codecs.register("pipe", {
      encode: () =>
        err({ code: "malformed-record", message: "no", entities: [] }),
      decode: () =>
        err({ code: "malformed-record", message: "bad payload", entities: [] }),
    });
    expect(saveDocument(loadedModel(), { codecs }).ok).toBe(false);
    const text = JSON.stringify({
      format: "nodeeditor-js/document",
      version: 1,
      graph: sampleSnapshot(),
    });
    const model = makeTestModel();
    const r = loadDocument(model, text, { codecs });
    expect(!r.ok && r.error[0]?.path).toBe("graph.nodes[0].payload");
    expect(model.reader.nodes()).toEqual([]);
  });

  it("rejects duplicate codec registration", () => {
    const codecs = createPayloadCodecRegistry();
    const codec = { encode: () => ok(null), decode: () => ok(null) };
    expect(codecs.register("t", codec).ok).toBe(true);
    expect(codecs.register("t", codec).ok).toBe(false);
  });
});

describe("optional sections", () => {
  it("writes viewport and selection only when asked and validates them on load", () => {
    const model = loadedModel();
    const saved = saveDocument(model, {
      viewport: { x: 1, y: 2, zoom: 1.5 },
      selection: ["n1", "c1"],
    });
    if (!saved.ok) throw new Error("save failed");
    const parsed = JSON.parse(saved.value);
    expect(parsed.viewport).toEqual({ x: 1, y: 2, zoom: 1.5 });
    expect(parsed.selection).toEqual(["n1", "c1"]);
    const fresh = makeTestModel();
    const loaded = loadDocument(fresh, saved.value);
    expect(loaded.ok && loaded.value.viewport).toEqual({
      x: 1,
      y: 2,
      zoom: 1.5,
    });
    expect(loaded.ok && loaded.value.selection).toEqual(["n1", "c1"]);
  });

  it("omits both by default and rejects a selection of unknown IDs before saving", () => {
    const model = loadedModel();
    const plain = saveDocument(model);
    expect(plain.ok && Object.keys(JSON.parse(plain.value))).not.toContain(
      "viewport",
    );
    const bad = saveDocument(model, { selection: ["nope"] });
    expect(!bad.ok && bad.error[0]?.code).toBe("dangling-reference");
  });
});

describe("loading", () => {
  it("rejects a future version as unsupported-version and keeps the document", () => {
    const model = loadedModel();
    const before = JSON.stringify(exportSnapshot(model));
    const text = JSON.stringify({
      format: "nodeeditor-js/document",
      version: 2,
      graph: {},
    });
    const r = loadDocument(model, text);
    expect(!r.ok && r.error[0]?.code).toBe("unsupported-version");
    expect(JSON.stringify(exportSnapshot(model))).toBe(before);
  });

  it("rejects bad format tags, bad JSON, oversize text and unknown wrapper fields", () => {
    const model = makeTestModel();
    const code = (text: string, limits = {}) => {
      const r = loadDocument(model, text, { limits });
      return !r.ok && r.error[0]?.code;
    };
    expect(code("{")).toBe("invalid-shape");
    expect(code("[]")).toBe("invalid-shape");
    expect(code('{"format":"x","version":1}')).toBe("unsupported-format");
    expect(
      code('{"format":"nodeeditor-js/document","version":1,"graph":{},"x":1}'),
    ).toBe("invalid-shape");
    expect(code("{}".padEnd(50, " "), { maxDocumentChars: 10 })).toBe(
      "limit-exceeded",
    );
  });

  it("checks the text length before parsing", () => {
    const parse = vi.spyOn(JSON, "parse");
    loadDocument(makeTestModel(), "x".repeat(100), {
      limits: { maxDocumentChars: 10 },
    });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it("produces an identical string for load then save of an unchanged document", () => {
    const first = saveDocument(loadedModel());
    if (!first.ok) throw new Error("save failed");
    const model = makeTestModel();
    expect(loadDocument(model, first.value).ok).toBe(true);
    const second = saveDocument(model);
    expect(second.ok && second.value).toBe(first.value);
  });

  it("applies a host migration from an older version and returns its warnings", () => {
    const text = JSON.stringify({
      format: "nodeeditor-js/document",
      version: 0,
      legacy: sampleSnapshot(),
    });
    const model = makeTestModel();
    const r = loadDocument(model, text, {
      migrations: {
        0: (doc) =>
          ok({
            doc: { format: doc.format, version: 1, graph: doc.legacy },
            warnings: ["renamed legacy"],
          }),
      },
    });
    expect(r.ok && r.value.warnings).toEqual(["renamed legacy"]);
    expect(model.reader.nodes()).toHaveLength(2);
    expect(loadDocument(model, text).ok).toBe(false);
  });
});

describe("no network access on open", () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  it("never calls fetch when loading a document with asset references", () => {
    const spy = vi.fn(() => Promise.reject(new Error("network")));
    globalThis.fetch = spy as unknown as typeof fetch;
    const input = sampleSnapshot();
    const nodes = input.nodes as Record<string, unknown>[];
    nodes[0] = {
      ...nodes[0],
      payload: { asset: "https://example.invalid/symbol.svg" },
    };
    const text = JSON.stringify({
      format: "nodeeditor-js/document",
      version: 1,
      graph: input,
    });
    const model = makeTestModel();
    expect(loadDocument(model, text).ok).toBe(true);
    expect(loadSnapshot(model, input).ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(model.reader.nodes()[0]?.payload).toEqual({
      asset: "https://example.invalid/symbol.svg",
    });
  });
});

describe("route in documents", () => {
  it("Pinned segment survives reload through a saved document", () => {
    const input = sampleSnapshot();
    const conns = input.connections as Record<string, unknown>[];
    const route = [{ kind: "segment", orientation: "horizontal", at: -5 }];
    conns[0] = { ...conns[0], route };
    const saved = saveDocument(loadedModel(input));
    if (!saved.ok) throw new Error("save failed");
    expect(JSON.parse(saved.value).version).toBe(1);
    const fresh = makeTestModel();
    expect(loadDocument(fresh, saved.value).ok).toBe(true);
    expect(fresh.reader.connections()[0]?.route).toEqual(route);
  });
});
