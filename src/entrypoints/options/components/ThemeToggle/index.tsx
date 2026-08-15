import type { TFunction } from "i18next"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ResponsiveToggleGroup } from "~/components/ResponsiveButtonGroup"
import { Caption, CardItem } from "~/components/ui"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { useTheme } from "~/contexts/ThemeContext"
import type { ThemeMode } from "~/types/theme"

const getThemeOptions = (t: TFunction) => {
  return [
    {
      mode: "light" as ThemeMode,
      label: t("settings:theme.light"),
      icon: Sun,
      description: t("settings:theme.useLightTheme"),
    },
    {
      mode: "dark" as ThemeMode,
      label: t("settings:theme.dark"),
      icon: Moon,
      description: t("settings:theme.useDarkTheme"),
    },
    {
      mode: "system" as ThemeMode,
      label: t("settings:theme.followSystem"),
      icon: Monitor,
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
      id="appearance-theme-mode"
      icon={<Sun className="h-5 w-5 text-amber-500 dark:text-amber-400" />}
      title={t("theme.appearance")}
      description={t("theme.selectTheme")}
      rightContent={
        <ResponsiveToggleGroup
          aria-label={t("theme.appearance")}
          value={themeMode}
          onValueChange={handleThemeChange}
          showActiveIndicator
          options={themeOptions.map(
            ({ mode, label, icon: Icon, description }) => {
              const isActive = themeMode === mode

              return {
                value: mode,
                title: description,
                ariaLabel: t("theme.switchTo", { theme: label, description }),
                label: (
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
                ),
              }
            },
          )}
        />
      }
      leftContent={
        <Caption
          className={`${COLORS.text.tertiary} ${ANIMATIONS.transition.base}`}
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
