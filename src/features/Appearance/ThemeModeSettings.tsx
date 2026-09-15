import { Sun } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ResponsiveToggleGroup } from "~/components/ResponsiveButtonGroup"
import { Caption, CardItem } from "~/components/ui"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { THEME_MODE } from "~/constants/theme"
import { useTheme } from "~/contexts/ThemeContext"
import { isThemeMode, THEME_MODES } from "~/types/theme"

import { getThemeModeOptions } from "./themeModeOptions"

/** Settings card for choosing an explicit or system theme. */
const ThemeModeSettings = () => {
  const { themeMode, setThemeMode, resolvedTheme } = useTheme()
  const { t } = useTranslation("settings")
  const themeOptions = getThemeModeOptions(t)

  return (
    <CardItem
      id={SETTINGS_ANCHORS.APPEARANCE_THEME_MODE}
      icon={<Sun className="text-warning-text h-5 w-5" />}
      title={t("theme.appearance")}
      description={t("theme.selectTheme")}
      rightContent={
        <ResponsiveToggleGroup
          aria-label={t("theme.appearance")}
          value={themeMode}
          onValueChange={setThemeMode}
          showActiveIndicator
          options={THEME_MODES.map((mode) => {
            const { label, icon: Icon, description } = themeOptions[mode]
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
                        ? "text-theme-500 dark:text-theme-400"
                        : "text-muted-foreground"
                    } `}
                  />
                  {label}
                </span>
              ),
            }
          })}
        />
      }
      leftContent={
        <Caption
          className={`${COLORS.text.tertiary} ${ANIMATIONS.transition.base}`}
        >
          {t("theme.currentTheme", {
            theme: isThemeMode(themeMode)
              ? themeOptions[themeMode].label
              : undefined,
            resolvedTheme:
              resolvedTheme === THEME_MODE.DARK
                ? t("theme.dark")
                : t("theme.light"),
          })}
        </Caption>
      }
    />
  )
}

export default ThemeModeSettings
