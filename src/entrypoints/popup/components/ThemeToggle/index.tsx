import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import { useTheme } from "~/contexts/ThemeContext"
import type { ThemeMode } from "~/types/theme"

const getThemeOptions = (t: (key: string) => string) => {
  return [
    {
      mode: "light" as ThemeMode,
      label: t("settings:theme.light"),
      icon: SunIcon,
      description: t("settings:theme.useLightTheme"),
    },
    {
      mode: "dark" as ThemeMode,
      label: t("settings:theme.dark"),
      icon: MoonIcon,
      description: t("settings:theme.useDarkTheme"),
    },
    {
      mode: "system" as ThemeMode,
      label: t("settings:theme.followSystem"),
      icon: ComputerDesktopIcon,
      description: t("settings:theme.followSystemTheme"),
    },
  ]
}

const CompactThemeToggle = () => {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme()
  const { t } = useTranslation("settings")
  const themeOptions = getThemeOptions(t)

  const currentIndex = themeOptions.findIndex(
    (option) => option.mode === themeMode,
  )
  const nextIndex = (currentIndex + 1) % themeOptions.length
  const nextTheme = themeOptions[nextIndex]

  const CurrentIcon = themeOptions[currentIndex]?.icon || ComputerDesktopIcon
  const currentTheme = themeOptions[currentIndex]

  const handleThemeToggle = () => {
    setThemeMode(nextTheme.mode)
  }

  // Get the resolved theme label for system mode
  const resolvedThemeLabel =
    themeMode === "system"
      ? resolvedTheme === "dark"
        ? t("theme.dark")
        : t("theme.light")
      : t(`theme.${currentTheme?.mode}`)

  return (
    <IconButton
      onClick={handleThemeToggle}
      variant="outline"
      size="sm"
      title={
        t("theme.current", {
          theme: t(`theme.${currentTheme?.mode}`),
          resolvedTheme: resolvedThemeLabel,
        }) +
        "\n" +
        t("theme.clickSwitch", { nextMode: t(`theme.${nextTheme.mode}`) })
      }
      aria-label={t("theme.toggle", {
        currentMode: t(`theme.${currentTheme?.mode}`),
        nextMode: t(`theme.${nextTheme.mode}`),
      })}
    >
      {/* Match header icon sizing, but keep a subtle mode color cue. */}
      <CurrentIcon
        className={`h-4 w-4 transition-colors ${
          themeMode === "light"
            ? "text-amber-500 dark:text-amber-400"
            : themeMode === "dark"
              ? "text-blue-500 dark:text-blue-400"
              : "text-purple-500 dark:text-purple-400"
        }`}
      />
    </IconButton>
  )
}

export default CompactThemeToggle
