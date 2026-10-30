import { type GraphSnapshot, validateSnapshot } from "nodeeditor-js";
import { describe, expect, it } from "vitest";
import {
  customSpec,
  DEFAULT_SEED,
  F_LARGE,
  F_LIVE,
  F_SMALL,
  F_TYPICAL,
  type FixtureSpec,
} from "./fixture-specs.js";
import { generateFixture } from "./generate-fixture.js";

describe("seeded fixtures", () => {
  it("same seed gives identical JSON, different seed differs", () => {
    const a = JSON.stringify(generateFixture(F_TYPICAL, 1));
    expect(JSON.stringify(generateFixture(F_TYPICAL, 1))).toBe(a);
    expect(JSON.stringify(generateFixture(F_TYPICAL, 2))).not.toBe(a);
  });

  it.each([F_SMALL, F_TYPICAL, F_LARGE, F_LIVE, customSpec(20_000)])(
    "$name has the specified node and connection counts",
    (spec) => {
      const snap = generateFixture(spec, DEFAULT_SEED);
      expect(snap.nodes).toHaveLength(spec.nodes);
      expect(snap.connections).toHaveLength(spec.connections);
    },
  );

  it("F-TYPICAL averages about four ports per node", () => {
    const snap = generateFixture(F_TYPICAL, DEFAULT_SEED);
    const ports = snap.nodes.reduce((sum, n) => sum + n.ports.length, 0);
    const avg = ports / snap.nodes.length;
    expect(avg).toBeGreaterThanOrEqual(3.5);
    expect(avg).toBeLessThanOrEqual(4.5);
  });

  it("mixes node types, rotations, mirroring and port directions", () => {
    const snap = generateFixture(F_TYPICAL, DEFAULT_SEED);
    expect(new Set(snap.nodes.map((n) => n.type)).size).toBe(2);
    expect(snap.nodes.some((n) => n.rotation === 3)).toBe(true);
    expect(snap.nodes.some((n) => n.mirrored === true)).toBe(true);
    const directions = new Set(
      snap.nodes.flatMap((n) => n.ports.map((p) => p.direction)),
    );
    expect(directions).toEqual(new Set(["input", "output", "undirected"]));
  });

  it("declares F-LIVE load without running it", () => {
    expect(F_LIVE.live).toEqual({ decorations: 1000, updateHz: 30 });
    expect(F_LIVE.nodes).toBe(F_TYPICAL.nodes);
  });
});

interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const inside = (b: Box, x: number, y: number): boolean =>
  x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/** Segment-versus-box test by sampling; accurate enough at fixture scale. */
function segmentCrosses(
  b: Box,
  a: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  for (let t = 0; t <= 1; t += 1 / 64)
    if (inside(b, a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t)) return true;
  return false;
}

/** A connection whose straight chord crosses `box` with both nodes outside it. */
function hasCrossingConnection(snap: GraphSnapshot, box: Box): boolean {
  const at = new Map(snap.nodes.map((n) => [n.id, n.position]));
  return snap.connections.some((c) => {
    const a = at.get(c.from.node);
    const b = at.get(c.to.node);
    if (!a || !b) return false;
    return (
      !inside(box, a.x, a.y) &&
      !inside(box, b.x, b.y) &&
      segmentCrosses(box, a, b)
    );
  });
}

/** Viewport boxes of the given CSS size centred on the middle of the world. */
function centreBox(spec: FixtureSpec, width: number, height: number): Box {
  const cols = Math.ceil(Math.sqrt(spec.nodes * 1.6));
  const rows = Math.ceil(spec.nodes / cols);
  const cx = (cols * spec.pitch) / 2;
  const cy = (rows * spec.pitch) / 2;
  return {
    x0: cx - width / 2,
    y0: cy - height / 2,
    x1: cx + width / 2,
    y1: cy + height / 2,
  };
}

describe("fixtures are valid and have off-screen endpoints", () => {
  it.each([
    // F-SMALL fits inside one 1440x900 viewport, so a quarter-size window stands in.
    [F_SMALL, 720, 450],
    [F_TYPICAL, 1440, 900],
    [F_LARGE, 1440, 900],
  ] as const)(
    "%o passes validateSnapshot and has crossing paths",
    (spec, w, h) => {
      const snap = generateFixture(spec, DEFAULT_SEED);
      const result = validateSnapshot(snap);
      expect(result.ok).toBe(true);
      expect(hasCrossingConnection(snap, centreBox(spec, w, h))).toBe(true);
    },
  );
});
