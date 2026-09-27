import { Sun } from "lucide-react"
import { useTranslation } from "react-i18next"

import { SegmentedControl } from "~/components/SegmentedControl"
import { SettingsResetButton } from "~/components/SettingsResetButton"
import { Caption, CardItem } from "~/components/ui"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import { DEFAULT_THEME_MODE, THEME_MODE } from "~/constants/theme"
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
      icon={<Sun className="text-primary h-5 w-5" />}
      title={t("theme.mode")}
      description={
        <span className="gap-density-1 flex flex-col">
          <span>{t("theme.selectTheme")}</span>
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
        </span>
      }
      rightContent={
        <div className="flex min-w-0 items-center gap-2">
          <SegmentedControl
            aria-label={t("theme.mode")}
            value={themeMode}
            onValueChange={setThemeMode}
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
                        isActive ? "text-foreground" : "text-muted-foreground"
                      } `}
                    />
                    {label}
                  </span>
                ),
              }
            })}
          />
          {themeMode !== DEFAULT_THEME_MODE && (
            <SettingsResetButton
              iconOnly
              label={`${t("common:actions.reset")}: ${t("theme.mode")}`}
              onClick={() => setThemeMode(DEFAULT_THEME_MODE)}
            />
          )}
        </div>
      }
    />
  )
}

export default ThemeModeSettings
