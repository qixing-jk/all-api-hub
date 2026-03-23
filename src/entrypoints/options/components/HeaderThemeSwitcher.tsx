import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { IconButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { useTheme } from "~/contexts/ThemeContext"
import { cn } from "~/lib/utils"
import type { ThemeMode } from "~/types/theme"

const getThemeLabel = (t: TFunction, mode: ThemeMode) => {
  switch (mode) {
    case "light":
      return t("settings:theme.light")
    case "dark":
      return t("settings:theme.dark")
    case "system":
      return t("settings:theme.followSystem")
  }
}

const getThemeOptions = (t: TFunction) => {
  return [
    {
      mode: "light" as ThemeMode,
      label: getThemeLabel(t, "light"),
      icon: SunIcon,
    },
    {
      mode: "dark" as ThemeMode,
      label: getThemeLabel(t, "dark"),
      icon: MoonIcon,
    },
    {
      mode: "system" as ThemeMode,
      label: getThemeLabel(t, "system"),
      icon: ComputerDesktopIcon,
    },
  ]
}

/**
 * Narrow a dropdown selection value to a supported theme mode.
 */
function isThemeMode(value: string): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system"
}

/**
 * Return the icon accent classes associated with each theme mode.
 */
function getThemeIconClassName(mode: ThemeMode) {
  switch (mode) {
    case "light":
      return "text-amber-500 dark:text-amber-400"
    case "dark":
      return "text-blue-500 dark:text-blue-400"
    case "system":
      return "text-violet-500 dark:text-violet-400"
  }
}

/**
 * Compact theme selector for the options-page header.
 */
export default function HeaderThemeSwitcher() {
  const { themeMode, resolvedTheme, setThemeMode } = useTheme()
  const { t } = useTranslation("settings")
  const themeOptions = getThemeOptions(t)
  const currentTheme =
    themeOptions.find((option) => option.mode === themeMode) ??
    themeOptions[themeOptions.length - 1]
  const CurrentIcon = currentTheme.icon
  const resolvedThemeLabel =
    resolvedTheme === "dark"
      ? getThemeLabel(t, "dark")
      : getThemeLabel(t, "light")
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
              getThemeIconClassName(themeMode),
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
          {themeOptions.map(({ mode, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={mode} value={mode}>
              <div className="flex min-w-0 items-center gap-2">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    getThemeIconClassName(mode),
                  )}
                />
                <span>{label}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
