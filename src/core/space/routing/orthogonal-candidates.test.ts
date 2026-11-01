import { describe, expect, it } from "vitest";
import {
  FAMILIES,
  type OrthogonalEnd,
  orthogonalCandidates,
  simplify,
} from "./orthogonal-candidates.js";
import { isValidCandidate } from "./orthogonal-check.js";
import { box, LEFT, RIGHT, UP, w } from "./test-kit.js";

const end = (
  position: { x: number; y: number },
  dir: { x: number; y: number },
  body?: ReturnType<typeof box>,
): OrthogonalEnd => ({ position, dir, body });

const FROM = end(w(0, 0), RIGHT, box(-100, -30, 100, 60));
const TO = end(w(200, 80), LEFT, box(200, 50, 100, 60));

describe("orthogonal candidates", () => {
  it("the candidate list is identical across calls and in family order", () => {
    const a = orthogonalCandidates(FROM, TO, 20);
    const b = orthogonalCandidates(FROM, TO, 20);
    expect(b).toEqual(a);
    const ranks = a.map((c) => FAMILIES.indexOf(c.family));
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    expect(a.map((c) => c.family).slice(0, 1)).toEqual(["midpoint-s"]);
    // Two one-corner connectors, six vertical and six horizontal middles (the gap
    // between the bodies counts on the x axis only).
    expect(a.filter((c) => c.family === "escape").length).toBe(2 + 6 + 5);
    const perpendicular = orthogonalCandidates(
      FROM,
      end(w(100, 100), UP, box(60, 100, 80, 50)),
      20,
    );
    expect(perpendicular[0]?.family).toBe("l");
  });

  it("candidates are simplified: repeated and straight-through vertices merge", () => {
    expect(
      simplify([w(0, 0), w(0, 0), w(10, 0), w(20, 0), w(20, 5), w(20, 5)]),
    ).toEqual([w(0, 0), w(20, 0), w(20, 5)]);
    // A reversal is kept so the check can reject it.
    expect(simplify([w(0, 0), w(20, 0), w(10, 0)])).toEqual([
      w(0, 0),
      w(20, 0),
      w(10, 0),
    ]);
  });

  it("a candidate reversing at an escape point is invalid", () => {
    expect(
      isValidCandidate([w(0, 0), w(20, 0), w(10, 0), w(10, 80)], FROM, {
        ...TO,
        dir: UP,
        body: undefined,
        position: w(10, 80),
      }),
    ).toBe(false);
  });

  it("a candidate crossing a body interior is invalid", () => {
    const to = end(w(-300, 30), LEFT, box(-300, 0, 100, 60));
    const from = end(w(100, 30), RIGHT, box(0, 0, 100, 60));
    // Straight back through the source body.
    expect(
      isValidCandidate(
        [
          w(100, 30),
          w(120, 30),
          w(120, 40),
          w(-320, 40),
          w(-320, 30),
          w(-300, 30),
        ],
        from,
        to,
      ),
    ).toBe(false);
    // Around above is clear.
    expect(
      isValidCandidate(
        [
          w(100, 30),
          w(120, 30),
          w(120, -20),
          w(-320, -20),
          w(-320, 30),
          w(-300, 30),
        ],
        from,
        to,
      ),
    ).toBe(true);
    // Running along a body edge does not enter the open interior.
    expect(
      isValidCandidate(
        [
          w(100, 30),
          w(120, 30),
          w(120, 0),
          w(-320, 0),
          w(-320, 30),
          w(-300, 30),
        ],
        from,
        to,
      ),
    ).toBe(true);
  });

  it("the first segment is exempt only from the source body, the last only from the target body", () => {
    const far = end(w(300, 100), LEFT, box(300, 70, 100, 60));
    const route = [w(-50, 30), w(20, 30), w(20, 100), w(300, 100)];
    // The source port lies inside its body box: its first segment may cross it.
    const inside = end(w(-50, 30), RIGHT, box(-100, 0, 100, 60));
    expect(isValidCandidate(route, inside, far)).toBe(true);
    // The first segment is not exempt from the target body.
    const blocking = end(w(300, 100), LEFT, box(-20, 0, 30, 60));
    expect(isValidCandidate(route, inside, blocking)).toBe(false);
    // The last segment may cross the target body, but not the source body.
    const back = [w(0, 30), w(20, 30), w(20, 100), w(-50, 100), w(-50, 30)];
    const source = end(w(0, 30), RIGHT, box(-100, 0, 100, 60));
    const target = (body: ReturnType<typeof box>) =>
      end(w(-50, 30), w(0, 1), body);
    expect(isValidCandidate(back, source, target(box(-60, 20, 20, 20)))).toBe(
      false,
    );
    const smallSource = end(w(0, 30), RIGHT, box(-10, 0, 10, 60));
    expect(
      isValidCandidate(back, smallSource, target(box(-60, 20, 20, 20))),
    ).toBe(true);
  });
});
