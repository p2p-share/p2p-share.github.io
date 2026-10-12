export const APP_THEMES = ["light", "dark"] as const;
export type AppTheme = typeof APP_THEMES[number];

export const ACCENT_THEMES = ["blue", "teal", "emerald", "coral", "amber"] as const;
export type AccentTheme = typeof ACCENT_THEMES[number];

export const EDITOR_THEMES = ["light", "dark", "contrast", "midnight", "forest", "solarized"] as const;
export type EditorThemeMode = typeof EDITOR_THEMES[number];

export function storedChoice<T extends string>(
  value: string | null,
  choices: readonly T[],
  fallback: T,
): T {
  return value && choices.includes(value as T) ? value as T : fallback;
}

export function storedAccentChoice(value: string | null): AccentTheme {
  const migrated = value === "rose" ? "coral" : value;
  return storedChoice(migrated, ACCENT_THEMES, "blue");
}
