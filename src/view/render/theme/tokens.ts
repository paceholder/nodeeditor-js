/**
 * Theme tokens.
 *
 * Plain data, no CSS framework. `StyleTokens` are the values a single entity is painted
 * with; `ThemeTokens` adds view-wide values (background, grid, selection, detail
 * thresholds) and the override tables. Each view owns its theme, so two views of one
 * model never affect each other.
 */

export type PortShape = "circle" | "square";

/** Everything a painter needs for one entity. */
export interface StyleTokens {
  readonly nodeFill: string;
  readonly nodeStroke: string;
  /** CSS pixels when `screenSpaceLines` is on, world units otherwise. */
  readonly nodeLineWidth: number;
  /** World units. */
  readonly nodeRadius: number;
  readonly textColor: string;
  /** Canvas font shorthand in world units (it scales with the node). */
  readonly font: string;
  readonly portFill: string;
  readonly portStroke: string;
  readonly portShape: PortShape;
  /** CSS pixels when `screenSpaceLines` is on, world units otherwise. */
  readonly portRadius: number;
  readonly connectionColor: string;
  readonly connectionWidth: number;
}

export interface ThemeTokens extends StyleTokens {
  readonly background: string;
  readonly gridMinor: string;
  readonly gridMajor: string;
  /** World units between minor grid lines. */
  readonly gridSpacing: number;
  /** Every n-th grid line is a major line. */
  readonly gridMajorEvery: number;
  readonly selection: string;
  readonly selectionWidth: number;
  readonly error: string;
  readonly warning: string;
  /** Keep line widths constant on screen regardless of zoom. */
  readonly screenSpaceLines: boolean;
  /** Zoom below which the level is `reduced`. */
  readonly lodReducedBelow: number;
  /** Zoom below which the level is `minimal`. */
  readonly lodMinimalBelow: number;
  /** Zoom below which the level is `overview`: batched outlines, no painters (D3). */
  readonly lodOverviewBelow: number;
  /**
   * Zoom below which ports are neither painted nor picked; 0 keeps them at
   * every zoom.
   */
  readonly lodHidePortsBelow: number;
  /** Overrides by node type, port type key, or connection kind. */
  readonly typeOverrides: Readonly<Record<string, Partial<StyleTokens>>>;
  /** Overrides by entity ID; they win over type overrides. */
  readonly entityOverrides: Readonly<Record<string, Partial<StyleTokens>>>;
}

type OverridePatch = Readonly<Record<string, Partial<StyleTokens> | undefined>>;

/**
 * A theme patch. Scalars replace. Override tables merge per key; a key set to
 * `undefined` removes that override.
 */
export interface ThemeInput
  extends Partial<Omit<ThemeTokens, "typeOverrides" | "entityOverrides">> {
  readonly typeOverrides?: OverridePatch;
  readonly entityOverrides?: OverridePatch;
}

export const DEFAULT_THEME: ThemeTokens = {
  nodeFill: "#2f3540",
  nodeStroke: "#8a94a6",
  nodeLineWidth: 1.5,
  nodeRadius: 6,
  textColor: "#e6e9ef",
  font: "13px system-ui, sans-serif",
  portFill: "#d8dde6",
  portStroke: "#1e2024",
  portShape: "circle",
  portRadius: 4,
  connectionColor: "#7fb0e0",
  connectionWidth: 2,
  background: "#1e2024",
  gridMinor: "#272b32",
  gridMajor: "#323843",
  gridSpacing: 20,
  gridMajorEvery: 5,
  selection: "#ffb454",
  selectionWidth: 2,
  error: "#ef5350",
  warning: "#f2b84b",
  screenSpaceLines: true,
  lodReducedBelow: 0.6,
  lodMinimalBelow: 0.25,
  lodOverviewBelow: 0.15,
  lodHidePortsBelow: 0.25,
  typeOverrides: {},
  entityOverrides: {},
};

function mergeOverrides(
  base: ThemeTokens["typeOverrides"],
  patch: OverridePatch | undefined,
): ThemeTokens["typeOverrides"] {
  const merged: Record<string, Partial<StyleTokens>> = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/**
 * Patch a theme. Scalars replace; override tables merge per key, so a patch can add one
 * type override without dropping the others, and `{ typeOverrides: { pump: undefined } }`
 * removes the `pump` override.
 */
export function mergeTheme(base: ThemeTokens, patch: ThemeInput): ThemeTokens {
  const { typeOverrides, entityOverrides, ...scalars } = patch;
  return {
    ...base,
    ...scalars,
    typeOverrides: mergeOverrides(base.typeOverrides, typeOverrides),
    entityOverrides: mergeOverrides(base.entityOverrides, entityOverrides),
  };
}
