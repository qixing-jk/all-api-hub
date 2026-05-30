export const THEME_MODES = ["light", "dark", "system"] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export type ResolvedTheme = "light" | "dark"
