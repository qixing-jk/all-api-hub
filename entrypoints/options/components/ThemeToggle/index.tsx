import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Caption, CardItem, ToggleButton } from "~/components/ui"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
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

const ThemeToggle = () => {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme()
  const { t } = useTranslation("settings")
  const themeOptions = getThemeOptions(t)

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode)
  }

  return (
    <CardItem
      icon={<SunIcon className="h-5 w-5 text-amber-500 dark:text-amber-400" />}
      title={t("theme.appearance")}
      description={t("theme.selectTheme")}
      rightContent={
        <div
          className={`flex flex-col sm:flex-row ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}
        >
          {themeOptions.map(({ mode, label, icon: Icon, description }) => {
            const isActive = themeMode === mode
            return (
              <ToggleButton
                key={mode}
                onClick={() => handleThemeChange(mode)}
                isActive={isActive}
                showActiveIndicator
                title={description}
                aria-label={t("theme.switchTo", { theme: label, description })}
              >
                <span className="flex items-center">
                  <Icon
                    className={`mr-2 h-4 w-4 transition-colors ${
                      isActive
                        ? "text-blue-500 dark:text-blue-400"
                        : "text-gray-500 dark:text-gray-400"
                    } `}
                  />
                  {label}
                </span>
              </ToggleButton>
            )
          })}
        </div>
      }
      leftContent={
        <Caption
          className={`${COLORS.text.tertiary} mt-1 ${ANIMATIONS.transition.base}`}
        >
          {t("theme.currentTheme", {
            theme: themeOptions.find((opt) => opt.mode === themeMode)?.label,
            resolvedTheme:
              resolvedTheme === "dark" ? t("theme.dark") : t("theme.light"),
          })}
        </Caption>
      }
    />
  )
}

export default ThemeToggle
