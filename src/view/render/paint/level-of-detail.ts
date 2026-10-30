/**
 * Level of detail by zoom (LAY-04).
 *
 * Low detail suppresses nonessential text. Selection, diagnostics, and connection
 * endpoints are typed as the literal `true`: no level can switch them off, so a painter
 * or the scene layer always has to draw them. At `overview` the scene layer draws nodes
 * and connections itself, in batches, and calls no painters (D3).
 */
import type { ThemeTokens } from "../theme/tokens.js";

export type DetailLevel = "full" | "reduced" | "minimal" | "overview";

export interface DetailPolicy {
  readonly level: DetailLevel;
  /** Node titles. */
  readonly title: boolean;
  /** Port labels and other secondary text. */
  readonly secondaryLabels: boolean;
  readonly selection: true;
  readonly diagnostics: true;
  readonly endpoints: true;
}

const POLICIES: Readonly<Record<DetailLevel, DetailPolicy>> = {
  full: {
    level: "full",
    title: true,
    secondaryLabels: true,
    selection: true,
    diagnostics: true,
    endpoints: true,
  },
  reduced: {
    level: "reduced",
    title: true,
    secondaryLabels: false,
    selection: true,
    diagnostics: true,
    endpoints: true,
  },
  minimal: {
    level: "minimal",
    title: false,
    secondaryLabels: false,
    selection: true,
    diagnostics: true,
    endpoints: true,
  },
  overview: {
    level: "overview",
    title: false,
    secondaryLabels: false,
    selection: true,
    diagnostics: true,
    endpoints: true,
  },
};

type LevelTokens = Pick<
  ThemeTokens,
  "lodReducedBelow" | "lodMinimalBelow" | "lodOverviewBelow"
>;

export function detailLevel(zoom: number, theme: LevelTokens): DetailLevel {
  if (zoom < theme.lodOverviewBelow) return "overview";
  if (zoom < theme.lodMinimalBelow) return "minimal";
  if (zoom < theme.lodReducedBelow) return "reduced";
  return "full";
}

export function detailPolicy(zoom: number, theme: LevelTokens): DetailPolicy {
  return POLICIES[detailLevel(zoom, theme)];
}

/**
 * Whether ports are shown at this zoom (LAY-04). Below the threshold the scene layer
 * paints none and picking skips them, so a press there never starts a connection.
 */
export function portsVisible(
  zoom: number,
  theme: Pick<ThemeTokens, "lodHidePortsBelow">,
): boolean {
  return zoom >= theme.lodHidePortsBelow;
}
