import { describe, expect, it } from "vitest";
import { parseFragmentValue } from "../fragment/fragment-text.js";
import { loadDocument } from "./document.js";
import { loadSnapshot } from "./load.js";
import { createPayloadCodecRegistry } from "./snapshot-errors.js";
import { loadedModel } from "./test-kit.js";
import { validateSnapshot } from "./validate.js";

const graph = (payload: unknown = null) => ({
  format: "@paceholder/nodeeditor-js/graph",
  version: 1,
  nodes: [
    {
      id: "n1",
      type: "pipe",
      position: { x: 0, y: 0 },
      size: { width: 40, height: 20 },
      ports: [],
      payload,
    },
  ],
  connections: [],
});

const boom = () => {
  throw new Error("boom");
};

describe("loading never throws", () => {
  it("a migration that throws becomes an error and changes nothing", () => {
    const model = loadedModel();
    const revision = model.revision();
    const text = JSON.stringify({
      format: "@paceholder/nodeeditor-js/document",
      version: 0,
      graph: graph(),
    });
    const r = loadDocument(model, text, { migrations: { 0: boom } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error[0]?.path).toBe("version");
      expect(r.error[0]?.message).toMatch(/version 0.*boom/);
    }
    expect(model.revision()).toBe(revision);
  });

  it("an input whose property getter throws is reported, not thrown", () => {
    const evil = {
      format: "@paceholder/nodeeditor-js/graph",
      version: 1,
      connections: [],
      get nodes(): unknown {
        return boom();
      },
    };
    const r = validateSnapshot(evil);
    expect(!r.ok && r.error.map((e) => e.code)).toEqual(["invalid-shape"]);
    expect(loadSnapshot(loadedModel(), evil).ok).toBe(false);
    const fragment = {
      format: "@paceholder/nodeeditor-js/fragment",
      version: 1,
      get external(): unknown {
        return boom();
      },
      fragment: graph(),
    };
    expect(parseFragmentValue(fragment).ok).toBe(false);
  });

  it("a payload codec that throws is reported, not thrown", () => {
    const codecs = createPayloadCodecRegistry();
    codecs.register("pipe", { encode: boom, decode: boom });
    const r = loadSnapshot(loadedModel(), graph({ a: 1 }), { codecs });
    expect(!r.ok && r.error.map((e) => [e.code, e.path])).toEqual([
      ["non-json-payload", "nodes[0].payload"],
    ]);
    const fragment = parseFragmentValue(
      {
        format: "@paceholder/nodeeditor-js/fragment",
        version: 1,
        fragment: graph(),
      },
      { codecs },
    );
    expect(fragment.ok).toBe(false);
  });
});
