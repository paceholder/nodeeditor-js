/**
 * Fixture parameters. F-LIVE declares its extra load but is not run until status
 * decorations exist.
 */

export interface FixtureSpec {
  readonly name: string;
  readonly nodes: number;
  readonly connections: number;
  /** Distance between grid cells, world units: about 100 nodes per 1440x900 at zoom 1. */
  readonly pitch: number;
  /** Fraction of connections joining random, far-apart nodes. */
  readonly longRange: number;
  /** Fraction of nodes that are image-symbol nodes; the rest are cards. */
  readonly symbolShare: number;
  /** Extra live load for the F-LIVE fixture; absent for static fixtures. */
  readonly live?: { readonly decorations: number; readonly updateHz: number };
}

const COMMON = { pitch: 115, longRange: 0.05, symbolShare: 0.7 } as const;

export const F_SMALL: FixtureSpec = {
  name: "F-SMALL",
  nodes: 100,
  connections: 200,
  ...COMMON,
};
export const F_TYPICAL: FixtureSpec = {
  name: "F-TYPICAL",
  nodes: 1_000,
  connections: 2_000,
  ...COMMON,
};
export const F_LARGE: FixtureSpec = {
  name: "F-LARGE",
  nodes: 10_000,
  connections: 20_000,
  ...COMMON,
};
/** Declared only: F-TYPICAL plus decorations updating through the adapter. */
export const F_LIVE: FixtureSpec = {
  ...F_TYPICAL,
  name: "F-LIVE",
  live: { decorations: 1_000, updateHz: 30 },
};

export const FIXTURE_SPECS: readonly FixtureSpec[] = [
  F_SMALL,
  F_TYPICAL,
  F_LARGE,
  F_LIVE,
];

/** A custom-size fixture with the same mix, e.g. for the interactive demo. */
export function customSpec(nodes: number, connectionsPerNode = 2): FixtureSpec {
  return {
    ...COMMON,
    name: `custom-${nodes}`,
    nodes,
    connections: Math.round(nodes * connectionsPerNode),
  };
}

/** Fixed seed used by every committed benchmark run. */
export const DEFAULT_SEED = 20261029;

/** World extent of a fixture laid out by the generator. */
export function worldSize(spec: FixtureSpec): { w: number; h: number } {
  const cols = Math.ceil(Math.sqrt(spec.nodes * 1.6));
  return { w: cols * spec.pitch, h: Math.ceil(spec.nodes / cols) * spec.pitch };
}
