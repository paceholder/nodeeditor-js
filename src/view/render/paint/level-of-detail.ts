/**
 * Level of detail by zoom.
 *
 * Low detail suppresses nonessential text. Selection, diagnostics, and connection
 * endpoints are typed as the literal `true`: no level can switch them off, so a painter
 * or the scene layer always has to draw them.
 */
import type { ThemeTokens } from "../theme/tokens.js";

export type DetailLevel = "full" | "reduced" | "minimal";

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
};

export function detailLevel(
  zoom: number,
  theme: Pick<ThemeTokens, "lodReducedBelow" | "lodMinimalBelow">,
): DetailLevel {
  if (zoom < theme.lodMinimalBelow) return "minimal";
  if (zoom < theme.lodReducedBelow) return "reduced";
  return "full";
}

export function detailPolicy(
  zoom: number,
  theme: Pick<ThemeTokens, "lodReducedBelow" | "lodMinimalBelow">,
): DetailPolicy {
  return POLICIES[detailLevel(zoom, theme)];
}
