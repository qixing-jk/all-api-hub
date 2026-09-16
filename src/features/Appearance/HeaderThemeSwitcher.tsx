import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { DEFAULT_THEME_MODE, THEME_MODE } from "~/constants/theme"
import { useTheme } from "~/contexts/ThemeContext"
import { cn } from "~/lib/utils"
import { isThemeMode, THEME_MODES } from "~/types/theme"

import { getThemeModeOptions } from "./themeModeOptions"

/**
 * Shared theme selector for management, popup, and side-panel headers.
 */
export default function HeaderThemeSwitcher() {
  const { themeMode, resolvedTheme, setThemeMode } = useTheme()
  const { t } = useTranslation("settings")
  const themeOptions = getThemeModeOptions(t)
  const selectedTheme = isThemeMode(themeMode)
    ? themeOptions[themeMode]
    : undefined
  const currentTheme = selectedTheme ?? themeOptions[DEFAULT_THEME_MODE]
  const CurrentIcon = currentTheme.icon
  const resolvedThemeLabel =
    themeOptions[
      resolvedTheme === THEME_MODE.DARK ? THEME_MODE.DARK : THEME_MODE.LIGHT
    ].label
  const triggerLabel = t("theme.current", {
    theme: currentTheme.label,
    resolvedTheme: resolvedThemeLabel,
  })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="outline"
          size="sm"
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <CurrentIcon
            className={cn(
              "h-4 w-4 transition-colors",
              selectedTheme?.iconClassName,
            )}
          />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuRadioGroup
          value={themeMode}
          onValueChange={(value: string) => {
            if (isThemeMode(value)) {
              void setThemeMode(value)
            }
          }}
        >
          {THEME_MODES.map((mode) => {
            const { label, icon: Icon, iconClassName } = themeOptions[mode]
            return (
              <DropdownMenuRadioItem key={mode} value={mode}>
                <div className="gap-y-density-2 flex min-w-0 items-center gap-x-2">
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      iconClassName,
                    )}
                  />
                  <span>{label}</span>
                </div>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
