import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFragment } from "./extract.js";
import {
  fragmentToText,
  parseFragmentText,
  parseFragmentValue,
  readFragment,
} from "./fragment-text.js";
import type { ClipboardFragment } from "./fragment-types.js";
import { dateCodecs, end, make, makeModel, setRawPayload } from "./test-kit.js";

function sample(): ClipboardFragment {
  const model = makeModel();
  const a = make(model, "pipe", 0, 0);
  const b = make(model, "pipe", 100, 0);
  const c = make(model, "pipe", 200, 0);
  model.connect(end(a, 1), end(b, 0));
  model.connect(end(b, 1), end(c, 0));
  model.execute({ kind: "rotateNodes", nodes: [b.node], turns: 1 });
  const r = extractFragment(model.reader, { nodes: [a.node, b.node] });
  if (!r.ok) throw new Error("setup");
  return r.value.fragment;
}

/** Deep copy as untrusted-looking plain data. */
const plain = (f: ClipboardFragment): Record<string, unknown> =>
  JSON.parse(JSON.stringify(f));

afterEach(() => vi.restoreAllMocks());

describe("clipboard text round trip", () => {
  it("parses back to an equal fragment and identical text", () => {
    const fragment = sample();
    const text = fragmentToText(fragment);
    const parsed = parseFragmentText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(fragment);
    expect(fragmentToText(parsed.value)).toBe(text);
    expect(fragment.external).toHaveLength(1);
  });

  it("validates payloads through codecs but keeps their JSON form", () => {
    const model = makeModel();
    const a = make(model, "pipe");
    setRawPayload(model, a.node, { when: new Date(7) });
    const codecs = dateCodecs("pipe");
    const r = extractFragment(model.reader, { nodes: [a.node] }, { codecs });
    if (!r.ok) throw new Error("setup");
    const read = readFragment(plain(r.value.fragment), { codecs });
    expect(read.ok && read.value.fragment).toEqual(r.value.fragment);
    const payload = read.ok ? (read.value.payloads[0] as unknown) : undefined;
    expect((payload as { when: Date }).when).toBeInstanceOf(Date);
  });
});

describe("foreign clipboard text", () => {
  it("refuses plain text and unmarked JSON as not-a-fragment", () => {
    for (const text of ["hello world", "{}", '{"format":"other"}', "[1,2]"]) {
      const r = parseFragmentText(text);
      expect(!r.ok && r.error[0]?.code).toBe("not-a-fragment");
    }
    const graph = plain(sample()).fragment;
    expect(!parseFragmentValue(graph).ok).toBe(true);
  });

  it("refuses a newer envelope version", () => {
    const value = { ...plain(sample()), version: 2 };
    const r = parseFragmentValue(value);
    expect(!r.ok && r.error[0]?.code).toBe("unsupported-version");
  });
});

describe("untrusted fragment content", () => {
  it("reports a dangling connection with its path", () => {
    const value = plain(sample());
    const inner = value.fragment as { connections: { to: { node: string } }[] };
    const first = inner.connections[0];
    if (!first) throw new Error("setup");
    first.to.node = "n99";
    const r = parseFragmentValue(value);
    expect(!r.ok && r.error[0]).toMatchObject({
      code: "dangling-endpoint",
      path: "fragment.connections[0].to.node",
    });
  });

  it("reports every error sorted by path, envelope included", () => {
    const value = { ...plain(sample()), extra: 1, external: [{ id: 3 }] };
    const r = parseFragmentValue(value);
    const paths = r.ok ? [] : r.error.map((e) => e.path);
    expect(paths.length).toBeGreaterThan(1);
    expect(paths).toContain("extra");
    expect(paths[0]?.startsWith("external[0]")).toBe(true);
  });

  it("never throws on malformed input", () => {
    const inputs: unknown[] = [
      null,
      undefined,
      42,
      "",
      "{",
      '{"format":"nodeeditor-js/fragment"',
      { format: "nodeeditor-js/fragment", version: 1 },
      { format: "nodeeditor-js/fragment", version: 1, fragment: [] },
      {
        format: "nodeeditor-js/fragment",
        version: 1,
        fragment: { format: "nodeeditor-js/graph", version: 1, nodes: [{}] },
        external: "x",
      },
    ];
    for (const input of inputs) {
      expect(() => parseFragmentValue(input)).not.toThrow();
      expect(() => parseFragmentText(input)).not.toThrow();
      expect(parseFragmentValue(input).ok).toBe(false);
    }
  });
});

describe("fragment size limits", () => {
  it("rejects a fragment over the node limit", () => {
    const r = parseFragmentValue(plain(sample()), { limits: { maxNodes: 1 } });
    expect(!r.ok && r.error[0]).toMatchObject({
      code: "limit-exceeded",
      path: "fragment.nodes",
    });
  });

  it("rejects over-length text before parsing it", () => {
    const text = fragmentToText(sample());
    const parse = vi.spyOn(JSON, "parse");
    const r = parseFragmentText(text, {
      limits: { maxDocumentChars: text.length - 1 },
    });
    expect(!r.ok && r.error[0]?.code).toBe("limit-exceeded");
    expect(parse).not.toHaveBeenCalled();
  });
});
