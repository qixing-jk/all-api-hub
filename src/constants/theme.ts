/** Persisted theme choices shared by startup, settings and content UI. */
export const THEME_MODE = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const

export const DEFAULT_THEME_MODE = THEME_MODE.SYSTEM

export const THEME_PRESET = {
  DEFAULT: "default",
  ANTHROPIC: "anthropic",
} as const

export const THEME_COLOR = {
  BLUE: "blue",
  VIOLET: "violet",
  ROSE: "rose",
  ORANGE: "orange",
  GREEN: "green",
  SLATE: "slate",
} as const

export const THEME_DENSITY = {
  COMPACT: "compact",
  DEFAULT: "default",
  COMFORTABLE: "comfortable",
} as const

export const THEME_FONT = {
  DEFAULT: "default",
  SANS: "sans",
  SERIF: "serif",
} as const

export const THEME_TEXT_SIZE = {
  DEFAULT: "default",
  LARGE: "large",
  EXTRA_LARGE: "extra-large",
} as const

export const THEME_CONTENT_WIDTH = {
  CENTERED: "centered",
  FULL: "full",
} as const

export const THEME_RADIUS = {
  NONE: "none",
  SMALL: "small",
  DEFAULT: "default",
  LARGE: "large",
} as const

/** Browser/CSS contracts; keep this module independent of application state. */
export const SYSTEM_DARK_MODE_QUERY = "(prefers-color-scheme: dark)"

export const THEME_ATTRIBUTES = {
  COLOR_SCOPE: "data-color-scope",
  COLOR: "data-theme-color",
  PRESET: "data-theme-preset",
  RADIUS: "data-theme-radius",
  DENSITY: "data-theme-density",
  TEXT_SIZE: "data-theme-text-size",
  FONT: "data-theme-font",
  OWNER: "data-theme-owner",
} as const

/** React takes ownership once authoritative preferences have loaded. */
export const THEME_OWNER = {
  BOOTSTRAP: "bootstrap",
  REACT: "react",
} as const
