/**
 * Style resolution (VIS-01): theme defaults, then the type override, then the entity
 * override. With no override the theme itself is returned, so the common case allocates
 * nothing per painted entity.
 */
import type { StyleTokens, ThemeTokens } from "./tokens.js";

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

export function resolveStyle(theme: ThemeTokens, key: StyleKey): ResolvedStyle {
  const byType = own(theme.typeOverrides, key.type);
  const byEntity = own(theme.entityOverrides, key.id);
  if (!byType && !byEntity) return theme;
  return { ...theme, ...byType, ...byEntity };
}
