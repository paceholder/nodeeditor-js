import { describe, expect, it } from "vitest";
import { operationId } from "../../base/ids/ids.js";
import { createEventHub } from "./event-hub.js";
import type { ChangeEvent } from "./types.js";

const change = (n: number): ChangeEvent => ({
  revision: n,
  patch: { ops: [] },
  origin: "local",
  operationId: operationId(`op${n}`),
  changed: { nodes: [], ports: [], connections: [] },
});

describe("typed events", () => {
  it("delivers change events in commit order with patch, revision and origin", () => {
    const hub = createEventHub();
    const seen: string[] = [];
    hub.on("change", (e) =>
      seen.push(`${e.revision}/${e.origin}/${e.patch.ops.length}`),
    );
    hub.emit("change", change(1));
    hub.emit("change", change(2));
    expect(seen).toEqual(["1/local/0", "2/local/0"]);
  });

  it("unsubscribe stops delivery and clear releases handlers", () => {
    const hub = createEventHub();
    let n = 0;
    const off = hub.on("change", () => n++);
    hub.emit("change", change(1));
    off();
    hub.emit("change", change(2));
    hub.on("change", () => n++);
    hub.clear();
    hub.emit("change", change(3));
    expect(n).toBe(1);
  });
});

describe("reentrancy", () => {
  it("every handler receives event 1 before any handler receives event 2", async () => {
    const hub = createEventHub();
    const log: string[] = [];
    let queued: Promise<unknown> | undefined;
    hub.on("change", (e) => {
      log.push(`a${e.revision}`);
      if (e.revision === 1) {
        queued = hub.defer(
          () => {
            hub.emit("change", change(2));
            return "done";
          },
          () => "dropped",
        );
      }
    });
    hub.on("change", (e) => log.push(`b${e.revision}`));
    hub.emit("change", change(1));
    expect(log).toEqual(["a1", "b1", "a2", "b2"]);
    await expect(queued).resolves.toBe("done");
  });

  it("handler error isolates the handler and reports a failure event", () => {
    const hub = createEventHub();
    const log: string[] = [];
    hub.on("change", () => {
      throw new Error("boom");
    });
    hub.on("change", (e) => log.push(String(e.revision)));
    hub.on("failure", (f) => {
      if (f.source === "handler") log.push(`failure:${f.eventType}`);
    });
    hub.emit("change", change(1));
    expect(log).toEqual(["1", "failure:change"]);
  });

  it("handler error inside a failure handler reaches onHandlerError without looping", () => {
    const errors: unknown[] = [];
    const hub = createEventHub({ onHandlerError: (e) => errors.push(e) });
    let failures = 0;
    hub.on("change", () => {
      throw new Error("first");
    });
    hub.on("failure", () => {
      failures++;
      throw new Error("second");
    });
    hub.emit("change", change(1));
    expect(failures).toBe(1);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("second");
  });

  it("a throwing onHandlerError cannot break dispatch", () => {
    const hub = createEventHub({
      onHandlerError: () => {
        throw new Error("reporter");
      },
    });
    hub.on("failure", () => {
      throw new Error("x");
    });
    hub.on("change", () => {
      throw new Error("y");
    });
    expect(() => hub.emit("change", change(1))).not.toThrow();
  });
});

describe("reset event", () => {
  it("is delivered in order with change events, carries no patch, and isolates throws", () => {
    const hub = createEventHub();
    const log: string[] = [];
    hub.on("reset", (e) => {
      log.push(`reset:${e.revision}`);
      if ("patch" in e) log.push("patch!");
    });
    hub.on("reset", () => {
      throw new Error("boom");
    });
    hub.on("reset", () => log.push("third"));
    hub.on("change", (e) => log.push(`change:${e.revision}`));
    hub.on("failure", (f) => log.push(`failure:${f.source}`));
    hub.emit("change", change(1));
    hub.emitReset({ revision: 2, origin: "external" });
    hub.emit("change", change(3));
    expect(log).toEqual([
      "change:1",
      "reset:2",
      "third",
      "failure:handler",
      "change:3",
    ]);
  });
});
