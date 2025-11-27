import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { useTheme } from "~/contexts/ThemeContext"
import type { ThemeMode } from "~/types/theme"

const getThemeOptions = (t: (key: string) => string) => {
  return [
    {
      mode: "light" as ThemeMode,
      label: t("settings:theme.light"),
      icon: SunIcon,
      description: t("settings:theme.useLightTheme")
    },
    {
      mode: "dark" as ThemeMode,
      label: t("settings:theme.dark"),
      icon: MoonIcon,
      description: t("settings:theme.useDarkTheme")
    },
    {
      mode: "system" as ThemeMode,
      label: t("settings:theme.followSystem"),
      icon: ComputerDesktopIcon,
      description: t("settings:theme.followSystemTheme")
    }
  ]
}

const CompactThemeToggle = () => {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme()
  const { t } = useTranslation("settings")
  const themeOptions = getThemeOptions(t)

  const currentIndex = themeOptions.findIndex(
    (option) => option.mode === themeMode
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
      variant="ghost"
      size="default"
      className={`relative rounded-full p-2.5 focus:ring-2 focus:ring-offset-2 focus:outline-none ${COLORS.background.tertiary} hover:${COLORS.background.secondary} shadow-sm hover:scale-105 hover:shadow-md focus:ring-blue-500 active:scale-95 dark:focus:ring-blue-400 ${ANIMATIONS.transition.base} `}
      title={
        t("theme.current", {
          theme: t(`theme.${currentTheme?.mode}`),
          resolvedTheme: resolvedThemeLabel
        }) +
        "\n" +
        t("theme.clickSwitch", { nextMode: t(`theme.${nextTheme.mode}`) })
      }
      aria-label={t("theme.toggle", {
        currentMode: t(`theme.${currentTheme?.mode}`),
        nextMode: t(`theme.${nextTheme.mode}`)
      })}>
      <CurrentIcon
        className={`h-5 w-5 transition-colors duration-200 ${
          themeMode === "light"
            ? "text-amber-500 dark:text-amber-400"
            : themeMode === "dark"
              ? "text-blue-500 dark:text-blue-400"
              : "text-purple-500 dark:text-purple-400"
        } `}
      />
    </IconButton>
  )
}

export default CompactThemeToggle
