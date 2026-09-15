import type { TFunction } from "i18next"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"

import { THEME_MODE } from "~/constants/theme"
import type { ThemeMode } from "~/types/theme"

interface ThemeModeOption {
  label: string
  description: string
  icon: LucideIcon
  iconClassName: string
}

/** Shared presentation for settings, the appearance drawer, header and popup. */
export function getThemeModeOptions(
  t: TFunction,
): Record<ThemeMode, ThemeModeOption> {
  return {
    [THEME_MODE.LIGHT]: {
      label: t("settings:theme.light"),
      description: t("settings:theme.useLightTheme"),
      icon: Sun,
      iconClassName: "text-link",
    },
    [THEME_MODE.DARK]: {
      label: t("settings:theme.dark"),
      description: t("settings:theme.useDarkTheme"),
      icon: Moon,
      iconClassName: "text-theme-500 dark:text-theme-400",
    },
    [THEME_MODE.SYSTEM]: {
      label: t("settings:theme.followSystem"),
      description: t("settings:theme.followSystemTheme"),
      icon: Monitor,
      iconClassName: "text-muted-foreground",
    },
  }
}
