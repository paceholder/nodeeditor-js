import { describe, expect, it, vi } from "vitest";
import { MisuseError } from "../../base/result.js";
import { loadSnapshot } from "../snapshot/load.js";
import {
  hostSnapshot,
  seeded,
  seededModel,
  titleOf,
  watch,
} from "./test-kit.js";

const titled = (title: string) =>
  hostSnapshot((s) => {
    (s.nodes[1] as { title: string }).title = title;
  });

describe("revisioned snapshot push, an incremental external change", () => {
  it("after revision 5, a push with revision 3 changes nothing, emits no event and reports stale", () => {
    const { adapter } = seeded();
    expect(adapter.pushSnapshot(titled("five"), 5).status).toBe("applied");
    const seen = watch(adapter);
    const before = adapter.revision();
    const result = adapter.pushSnapshot(titled("three"), 3);
    expect(result).toEqual({
      ok: true,
      status: "ignored",
      reason: "stale",
      revision: before,
    });
    expect(seen.events).toEqual([]);
    expect(adapter.revision()).toBe(before);
    expect(titleOf(adapter, "B")).toBe("five");
    expect(adapter.confirmedReader().getNode("B" as never)?.title).toBe("five");
  });

  it("an equal revision and a push without one are applied, and a missing one keeps the last revision", () => {
    const { adapter } = seeded();
    adapter.pushSnapshot(titled("five"), 5);
    expect(adapter.pushSnapshot(titled("again"), 5).status).toBe("applied");
    expect(titleOf(adapter, "B")).toBe("again");
    expect(adapter.pushSnapshot(titled("untagged")).status).toBe("applied");
    expect(titleOf(adapter, "B")).toBe("untagged");
    expect(adapter.pushSnapshot(titled("older"), 4).status).toBe("ignored");
    expect(adapter.pushSnapshot(titled("newer"), 6).status).toBe("applied");
    expect(titleOf(adapter, "B")).toBe("newer");
  });

  it("a host comparison replaces the numeric default for tokens of its own", () => {
    const compareRevisions = vi.fn((a: unknown, b: unknown) =>
      String(a).localeCompare(String(b)),
    );
    const { adapter } = seeded({ compareRevisions });
    adapter.pushSnapshot(titled("b"), "etag-b");
    expect(adapter.pushSnapshot(titled("a"), "etag-a").status).toBe("ignored");
    expect(compareRevisions).toHaveBeenCalledWith("etag-a", "etag-b");
    expect(adapter.pushSnapshot(titled("c"), "etag-c").status).toBe("applied");
    expect(titleOf(adapter, "B")).toBe("c");
  });

  it("the default comparison accepts only finite numbers; another token is misuse", () => {
    const { adapter } = seeded();
    adapter.pushSnapshot(titled("one"), 1);
    expect(() => adapter.pushSnapshot(titled("x"), "v2")).toThrow(MisuseError);
  });

  it("the host token never appears as the library's integer revision", () => {
    const { model } = seededModel();
    const start = model.revision();
    const result = model.pushSnapshot(titled("big"), 1_000_000);
    expect(result).toMatchObject({ status: "applied", revision: start + 1 });
    expect(model.revision()).toBe(start + 1);
    const stale = model.pushSnapshot(titled("old"), 7);
    expect(stale).toMatchObject({ status: "ignored", revision: start + 1 });
    expect(model.reader.revision()).toBe(start + 1);
  });

  it("a refused push does not advance the last revision", () => {
    const { adapter } = seeded();
    adapter.pushSnapshot(titled("one"), 1);
    const bad = hostSnapshot((s) => {
      s.connections.push({
        id: "dangling",
        from: { node: "A", port: "A.out" },
        to: { node: "B", port: "missing" },
      });
    });
    expect(adapter.pushSnapshot(bad, 9).status).toBe("refused");
    expect(adapter.pushSnapshot(titled("two"), 2).status).toBe("applied");
  });

  it("a stale push queued from a handler is checked when it runs, in call order", async () => {
    const { adapter } = seeded();
    const results: Promise<unknown>[] = [];
    const off = adapter.on("change", () => {
      off();
      for (const [title, revision] of [
        ["eight", 8],
        ["six", 6],
      ] as const) {
        const r = adapter.pushSnapshot(titled(title), revision);
        if (r.status === "queued") results.push(r.settled);
      }
    });
    adapter.pushSnapshot(titled("trigger"), 2);
    const [eight, six] = await Promise.all(results);
    expect(eight).toMatchObject({ status: "applied" });
    expect(six).toMatchObject({ status: "ignored", reason: "stale" });
    expect(titleOf(adapter, "B")).toBe("eight");
  });

  it("replacing the document forgets the last revision", () => {
    const { model } = seededModel();
    model.pushSnapshot(titled("nine"), 9);
    expect(loadSnapshot(model, hostSnapshot()).ok).toBe(true);
    expect(model.pushSnapshot(titled("one"), 1).status).toBe("applied");
  });
});
