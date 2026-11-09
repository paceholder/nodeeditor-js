import { describe, expect, it } from "vitest";
import { err, MisuseError, ok, reject } from "./result.js";

describe("result objects", () => {
  it("ok and err build discriminated results", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err("x")).toEqual({ ok: false, rejection: "x" });
  });

  it("reject builds a structured rejection with code, message and entities", () => {
    expect(reject("dangling-endpoint", "missing", ["p9"])).toEqual({
      ok: false,
      rejection: {
        code: "dangling-endpoint",
        message: "missing",
        entities: ["p9"],
      },
    });
  });

  it("MisuseError is an Error with its own name", () => {
    const e = new MisuseError("bad");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("MisuseError");
  });
});
