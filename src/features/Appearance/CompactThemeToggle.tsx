import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import { DEFAULT_THEME_MODE, THEME_MODE } from "~/constants/theme"
import { useTheme } from "~/contexts/ThemeContext"
import { isThemeMode, THEME_MODES } from "~/types/theme"

import { getThemeModeOptions } from "./themeModeOptions"

/** Cycle through the same theme modes offered by settings. */
const CompactThemeToggle = () => {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme()
  const { t } = useTranslation("settings")
  const themeOptions = getThemeModeOptions(t)
  const currentIndex = THEME_MODES.indexOf(themeMode)
  const nextMode = THEME_MODES[(currentIndex + 1) % THEME_MODES.length]
  const nextTheme = themeOptions[nextMode]
  const currentTheme = isThemeMode(themeMode)
    ? themeOptions[themeMode]
    : themeOptions[DEFAULT_THEME_MODE]
  const CurrentIcon = currentTheme.icon

  const handleThemeToggle = () => {
    setThemeMode(nextMode)
  }

  // Get the resolved theme label for system mode
  const resolvedThemeLabel =
    themeMode === THEME_MODE.SYSTEM
      ? themeOptions[
          resolvedTheme === THEME_MODE.DARK ? THEME_MODE.DARK : THEME_MODE.LIGHT
        ].label
      : currentTheme.label

  return (
    <IconButton
      onClick={handleThemeToggle}
      variant="outline"
      size="sm"
      title={
        t("theme.current", {
          theme: currentTheme.label,
          resolvedTheme: resolvedThemeLabel,
        }) +
        "\n" +
        t("theme.clickSwitch", { nextMode: nextTheme.label })
      }
      aria-label={t("theme.toggle", {
        currentMode: currentTheme.label,
        nextMode: nextTheme.label,
      })}
    >
      {/* Match header icon sizing, but keep a subtle mode color cue. */}
      <CurrentIcon
        className={`h-4 w-4 transition-colors ${currentTheme.iconClassName}`}
      />
    </IconButton>
  )
}

export default CompactThemeToggle
