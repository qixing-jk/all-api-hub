import {
  DEFAULT_THEME_MODE,
  THEME_ATTRIBUTES,
  THEME_MODE,
} from "~/constants/theme"
import {
  isThemeMode,
  normalizeAppearance,
  type AppearancePreferences,
  type ResolvedTheme,
  type ThemeMode,
} from "~/types/theme"

export const THEME_BOOTSTRAP_CACHE_KEY = "all-api-hub:appearance-bootstrap"

interface ThemePreferences {
  themeMode: ThemeMode
  appearance: AppearancePreferences
}

/** Accept old preference records without appearance and reject unknown choices. */
export function normalizeThemePreferences(value: unknown): ThemePreferences {
  const record =
    value && typeof value === "object"
      ? (value as Partial<ThemePreferences>)
      : {}
  return {
    themeMode: isThemeMode(record.themeMode)
      ? record.themeMode
      : DEFAULT_THEME_MODE,
    appearance: normalizeAppearance(record.appearance),
  }
}

/** Resolve the user's explicit choice before consulting the system preference. */
export function resolveThemeMode(
  mode: ThemeMode,
  systemDark: boolean,
): ResolvedTheme {
  return mode === THEME_MODE.SYSTEM
    ? systemDark
      ? THEME_MODE.DARK
      : THEME_MODE.LIGHT
    : mode
}

/** Scope preview/content colors without applying document-only radius settings. */
export function getAppearanceScopeAttributes(
  appearance: Pick<AppearancePreferences, "color" | "preset">,
) {
  return {
    [THEME_ATTRIBUTES.COLOR_SCOPE]: "",
    [THEME_ATTRIBUTES.COLOR]: appearance.color,
    [THEME_ATTRIBUTES.PRESET]: appearance.preset,
  }
}

/** Apply document colors and radius before startup and during React updates. */
export function applyThemePreferences(
  root: HTMLElement,
  preferences: ThemePreferences,
  systemDark: boolean,
) {
  const { themeMode, appearance } = preferences
  const resolvedTheme = resolveThemeMode(themeMode, systemDark)
  root.classList.toggle(THEME_MODE.DARK, resolvedTheme === THEME_MODE.DARK)
  root.setAttribute(THEME_ATTRIBUTES.COLOR, appearance.color)
  root.setAttribute(THEME_ATTRIBUTES.PRESET, appearance.preset)
  root.setAttribute(THEME_ATTRIBUTES.RADIUS, appearance.radius)
  root.style.colorScheme = resolvedTheme
}

/** Cache only display choices; browser storage remains the authoritative source. */
export function cacheThemePreferences(preferences: ThemePreferences) {
  try {
    window.localStorage.setItem(
      THEME_BOOTSTRAP_CACHE_KEY,
      JSON.stringify(normalizeThemePreferences(preferences)),
    )
  } catch {
    // A blocked/full Web Storage area must never prevent the extension opening.
  }
}

/** Read the synchronous first-paint hint without depending on application state. */
export function readCachedThemePreferences(): ThemePreferences | undefined {
  try {
    const cached = window.localStorage.getItem(THEME_BOOTSTRAP_CACHE_KEY)
    return cached ? normalizeThemePreferences(JSON.parse(cached)) : undefined
  } catch {
    return undefined
  }
}
