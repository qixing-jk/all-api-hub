import {
  THEME_COLOR,
  THEME_CONTENT_WIDTH,
  THEME_DENSITY,
  THEME_FONT,
  THEME_MODE,
  THEME_PRESET,
  THEME_RADIUS,
  THEME_TEXT_SIZE,
} from "~/constants/theme"

export const THEME_MODES = [
  THEME_MODE.LIGHT,
  THEME_MODE.DARK,
  THEME_MODE.SYSTEM,
] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export type ResolvedTheme = Exclude<ThemeMode, typeof THEME_MODE.SYSTEM>

/** Narrow stored or selected values to a supported theme mode. */
export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.some((mode) => mode === value)
}

export const THEME_PRESETS = [
  THEME_PRESET.DEFAULT,
  THEME_PRESET.ANTHROPIC,
] as const

export const THEME_COLORS = [
  THEME_COLOR.BLUE,
  THEME_COLOR.VIOLET,
  THEME_COLOR.ROSE,
  THEME_COLOR.ORANGE,
  THEME_COLOR.GREEN,
  THEME_COLOR.SLATE,
] as const
export const THEME_RADII = [
  THEME_RADIUS.NONE,
  THEME_RADIUS.SMALL,
  THEME_RADIUS.DEFAULT,
  THEME_RADIUS.LARGE,
] as const
export const THEME_DENSITIES = [
  THEME_DENSITY.COMPACT,
  THEME_DENSITY.DEFAULT,
  THEME_DENSITY.COMFORTABLE,
] as const

export const THEME_TEXT_SIZES = [
  THEME_TEXT_SIZE.DEFAULT,
  THEME_TEXT_SIZE.LARGE,
  THEME_TEXT_SIZE.EXTRA_LARGE,
] as const

export const THEME_FONTS = [
  THEME_FONT.DEFAULT,
  THEME_FONT.SANS,
  THEME_FONT.SERIF,
] as const

export interface AppearancePreferences {
  fontFamily: (typeof THEME_FONTS)[number]
  contentWidth: (typeof THEME_CONTENT_WIDTH)[keyof typeof THEME_CONTENT_WIDTH]
  sidebarCollapsed: boolean
  density: (typeof THEME_DENSITIES)[number]
  textSize: (typeof THEME_TEXT_SIZES)[number]
  preset: (typeof THEME_PRESETS)[number]
  color: (typeof THEME_COLORS)[number]
  radius: (typeof THEME_RADII)[number]
}
export type AppearanceUpdates = Partial<AppearancePreferences> & {
  themeMode?: ThemeMode
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  fontFamily: THEME_FONT.DEFAULT,
  contentWidth: THEME_CONTENT_WIDTH.CENTERED,
  sidebarCollapsed: false,
  preset: THEME_PRESET.DEFAULT,
  color: THEME_COLOR.BLUE,
  radius: THEME_RADIUS.DEFAULT,
  density: THEME_DENSITY.DEFAULT,
  textSize: THEME_TEXT_SIZE.DEFAULT,
}

/** Old backups and unknown imported values retain supported appearance defaults. */
export function normalizeAppearance(value: unknown): AppearancePreferences {
  const input =
    value && typeof value === "object"
      ? (value as Partial<AppearancePreferences>)
      : {}
  return {
    fontFamily:
      input.fontFamily && THEME_FONTS.includes(input.fontFamily)
        ? input.fontFamily
        : DEFAULT_APPEARANCE.fontFamily,
    contentWidth:
      input.contentWidth === THEME_CONTENT_WIDTH.FULL
        ? THEME_CONTENT_WIDTH.FULL
        : DEFAULT_APPEARANCE.contentWidth,
    sidebarCollapsed: input.sidebarCollapsed === true,
    preset:
      input.preset && THEME_PRESETS.includes(input.preset)
        ? input.preset
        : DEFAULT_APPEARANCE.preset,
    color:
      input.color && THEME_COLORS.includes(input.color)
        ? input.color
        : DEFAULT_APPEARANCE.color,
    density:
      input.density && THEME_DENSITIES.includes(input.density)
        ? input.density
        : DEFAULT_APPEARANCE.density,
    textSize:
      input.textSize && THEME_TEXT_SIZES.includes(input.textSize)
        ? input.textSize
        : DEFAULT_APPEARANCE.textSize,
    radius:
      input.radius && THEME_RADII.includes(input.radius)
        ? input.radius
        : DEFAULT_APPEARANCE.radius,
  }
}

/** Resolve the theme default while allowing an explicit font to survive preset changes. */
export function resolveThemeFont({
  fontFamily,
  preset,
}: Pick<AppearancePreferences, "fontFamily" | "preset">) {
  return fontFamily === THEME_FONT.DEFAULT
    ? preset === THEME_PRESET.ANTHROPIC
      ? THEME_FONT.SERIF
      : THEME_FONT.SANS
    : fontFamily
}
