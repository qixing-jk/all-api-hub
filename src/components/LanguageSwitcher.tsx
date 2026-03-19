import { Languages } from "lucide-react"
import { useTranslation } from "react-i18next"

import { IconButton, ToggleButton } from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { DEFAULT_LANG } from "~/constants"
import type { SupportedUiLanguage } from "~/constants"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { cn } from "~/lib/utils"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  normalizeAppLanguage,
  UI_LANGUAGE_OPTIONS,
} from "~/utils/i18n/language"

interface LanguageSwitcherProps {
  className?: string
  compact?: boolean
  showIcon?: boolean
  variant?: "inline" | "icon-dropdown"
}

/**
 * Resolve the localized short label shown on each language toggle.
 */
function getLanguageOptionLabel(
  t: (key: string, options?: any) => string,
  language: SupportedUiLanguage,
) {
  switch (language) {
    case "en":
      return t("settings:appearanceLanguage.switcher.options.en.label")
    case DEFAULT_LANG:
      return t("settings:appearanceLanguage.switcher.options.zh-CN.label")
  }
}

/**
 * Resolve the localized language name used in accessibility copy.
 */
function getLanguageOptionName(
  t: (key: string, options?: any) => string,
  language: SupportedUiLanguage,
) {
  switch (language) {
    case "en":
      return t("settings:appearanceLanguage.switcher.options.en.name")
    case DEFAULT_LANG:
      return t("settings:appearanceLanguage.switcher.options.zh-CN.name")
  }
}

/**
 * LanguageSwitcher toggles the UI language and persists the preference.
 */
export function LanguageSwitcher({
  className,
  compact = false,
  showIcon = true,
  variant = "inline",
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation("settings")
  const activeLanguage =
    normalizeAppLanguage(i18n.resolvedLanguage || i18n.language) ?? DEFAULT_LANG
  const activeLanguageName = getLanguageOptionName(t, activeLanguage)

  const handleLanguageChange = async (language: SupportedUiLanguage) => {
    if (language !== activeLanguage) {
      await i18n.changeLanguage(language)
    }
    await userPreferences.setLanguage(language)
  }

  if (variant === "icon-dropdown") {
    const triggerLabel = `${t("appearanceLanguage.switcher.groupLabel")}: ${t(
      "appearanceLanguage.switcher.currentLanguage",
      {
        language: activeLanguageName,
      },
    )}`

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            variant="outline"
            size="sm"
            aria-label={triggerLabel}
            title={triggerLabel}
            className={className}
          >
            <Languages className="h-4 w-4" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuRadioGroup
            value={activeLanguage}
            onValueChange={(value: string) => {
              const nextLanguage = UI_LANGUAGE_OPTIONS.find(
                ({ code }) => code === value,
              )?.code

              if (nextLanguage) {
                void handleLanguageChange(nextLanguage)
              }
            }}
          >
            {UI_LANGUAGE_OPTIONS.map(({ code }) => {
              const languageName = getLanguageOptionName(t, code)

              return (
                <DropdownMenuRadioItem key={code} value={code}>
                  {languageName}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 sm:gap-2",
        compact && "gap-1.5",
        className,
      )}
    >
      {showIcon && (
        <Languages
          className={cn(
            "dark:text-dark-text-secondary h-4 w-4 shrink-0",
            !compact && "sm:h-[1.2rem] sm:w-[1.2rem]",
          )}
        />
      )}
      <div
        role="group"
        aria-label={t("appearanceLanguage.switcher.groupLabel")}
        className={cn(
          `flex ${COLORS.background.tertiary} rounded-lg p-0.5 shadow-sm ${ANIMATIONS.transition.base}`,
          !compact && "sm:p-1",
        )}
      >
        {UI_LANGUAGE_OPTIONS.map(({ code }) => {
          const isActive = activeLanguage === code
          const label = getLanguageOptionLabel(t, code)
          const languageName = getLanguageOptionName(t, code)
          const accessibleLabel = isActive
            ? t("appearanceLanguage.switcher.currentLanguage", {
                language: languageName,
              })
            : t("appearanceLanguage.switcher.switchToLanguage", {
                language: languageName,
              })

          return (
            <ToggleButton
              key={code}
              onClick={() => handleLanguageChange(code)}
              isActive={isActive}
              size="sm"
              showActiveIndicator
              title={accessibleLabel}
              aria-label={accessibleLabel}
              className={cn("min-w-[3rem]", !compact && "sm:min-w-[3.5rem]")}
            >
              {label}
            </ToggleButton>
          )
        })}
      </div>
    </div>
  )
}
