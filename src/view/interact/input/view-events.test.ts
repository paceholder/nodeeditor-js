import { describe, expect, it } from "vitest";
import { createViewEvents } from "./view-events.js";

interface Map {
  ping: number;
  pong: string;
}

describe("INT-11 view events", () => {
  it("subscribe and unsubscribe; count follows the handlers", () => {
    const events = createViewEvents<Map>();
    const seen: number[] = [];
    expect(events.count("ping")).toBe(0);
    const off = events.on("ping", (n) => seen.push(n));
    expect(events.count("ping")).toBe(1);
    expect(events.count("pong")).toBe(0);
    events.emit("ping", 1);
    off();
    off();
    events.emit("ping", 2);
    expect(seen).toEqual([1]);
    expect(events.count("ping")).toBe(0);
  });

  it("handlers run in subscription order; the same function twice runs twice", () => {
    const events = createViewEvents<Map>();
    const order: string[] = [];
    const a = () => order.push("a");
    events.on("ping", a);
    events.on("ping", () => order.push("b"));
    const offA2 = events.on("ping", a);
    events.emit("ping", 0);
    expect(order).toEqual(["a", "b", "a"]);
    offA2();
    expect(events.count("ping")).toBe(2);
  });

  it("a throwing handler does not stop the others and is reported", () => {
    const reported: unknown[] = [];
    const events = createViewEvents<Map>((e) => reported.push(e));
    const seen: string[] = [];
    const boom = new Error("boom");
    events.on("pong", () => {
      throw boom;
    });
    events.on("pong", (s) => seen.push(s));
    events.emit("pong", "x");
    expect(seen).toEqual(["x"]);
    expect(reported).toEqual([boom]);
  });

  it("the default report rethrows asynchronously, after emit returns", async () => {
    const events = createViewEvents<Map>();
    const boom = new Error("later");
    events.on("ping", () => {
      throw boom;
    });
    const caught = new Promise<unknown>((resolve) => {
      const onError = (e: unknown) => {
        process.off("uncaughtException", onError);
        resolve(e);
      };
      process.on("uncaughtException", onError);
    });
    expect(() => events.emit("ping", 1)).not.toThrow();
    expect(await caught).toBe(boom);
  });

  it("clear drops every handler", () => {
    const events = createViewEvents<Map>();
    events.on("ping", () => {});
    events.on("pong", () => {});
    events.clear();
    expect(events.count("ping") + events.count("pong")).toBe(0);
  });
});
