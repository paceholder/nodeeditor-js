/**
 * Style resolution: theme defaults, then the type override, then the entity
 * override. With no override the theme itself is returned, so the common case allocates
 * nothing per painted entity.
 */
import type { GroupStyleTokens, StyleTokens, ThemeTokens } from "./tokens.js";

export type ResolvedStyle = Readonly<StyleTokens>;

export interface StyleKey {
  /** Node type, port type key, or connection kind. */
  readonly type: string;
  readonly id: string;
}

function own(
  table: Readonly<Record<string, Partial<StyleTokens>>>,
  key: string,
): Partial<StyleTokens> | undefined {
  // Own-property lookup so an ID such as "constructor" never reads the prototype.
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/**
 * `resolveStyle` with one reused key object, for painting loops: a lookup allocates
 * nothing per entity when no override applies.
 */
export function createStyleLookup(
  theme: ThemeTokens,
): (type: string, id: string) => ResolvedStyle {
  const key = { type: "", id: "" };
  return (type, id) => {
    key.type = type;
    key.id = id;
    return resolveStyle(theme, key);
  };
}

export function resolveStyle(theme: ThemeTokens, key: StyleKey): ResolvedStyle {
  const byType = own(theme.typeOverrides, key.type);
  const byEntity = own(theme.entityOverrides, key.id);
  if (!byType && !byEntity) return theme;
  return { ...theme, ...byType, ...byEntity };
}

/**
 * The style of a group: the theme's group tokens, then the named style its `style` key
 * selects. An unknown or absent key gives the theme's own values.
 */
export function resolveGroupStyle(
  theme: ThemeTokens,
  style: string | undefined,
): Readonly<GroupStyleTokens> {
  const named =
    style !== undefined && Object.hasOwn(theme.groupStyles, style)
      ? theme.groupStyles[style]
      : undefined;
  return named ? { ...theme, ...named } : theme;
}
