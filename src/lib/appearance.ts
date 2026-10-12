export const APP_THEMES = ["light", "dark"] as const;
export type AppTheme = typeof APP_THEMES[number];

export const ACCENT_THEMES = ["violet", "blue", "emerald", "rose", "amber"] as const;
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
