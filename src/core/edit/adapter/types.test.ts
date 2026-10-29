import { describe, expect, it } from "vitest";
import type { Accepted, SubmitResult } from "./types.js";

describe("outcome types", () => {
  it("Deferred cannot be narrowed to accepted without checking status", () => {
    const accept = (r: SubmitResult): Accepted | undefined => {
      // @ts-expect-error Deferred has no `ok`, so it cannot be tested as a Result.
      if (r.ok) return r;
      if (r.status === "accepted") return r;
      // @ts-expect-error still a union of rejected and deferred here.
      return r.revision;
    };
    expect(typeof accept).toBe("function");
  });
});
