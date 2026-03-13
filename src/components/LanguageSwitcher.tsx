import { Languages } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ToggleButton } from "~/components/ui"
import { DEFAULT_LANG } from "~/constants"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { cn } from "~/lib/utils"
import { userPreferences } from "~/services/preferences/userPreferences"
import {
  normalizeAppLanguage,
  UI_LANGUAGE_OPTIONS,
  type SupportedUiLanguage,
} from "~/utils/i18n/language"

interface LanguageSwitcherProps {
  className?: string
  compact?: boolean
  showIcon?: boolean
}

/**
 * LanguageSwitcher toggles the UI language and persists the preference.
 */
export function LanguageSwitcher({
  className,
  compact = false,
  showIcon = true,
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation("settings")
  const activeLanguage =
    normalizeAppLanguage(i18n.resolvedLanguage || i18n.language) ?? DEFAULT_LANG

  const handleLanguageChange = async (language: SupportedUiLanguage) => {
    if (language !== activeLanguage) {
      await i18n.changeLanguage(language)
    }
    await userPreferences.setLanguage(language)
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
        {UI_LANGUAGE_OPTIONS.map(({ code, translationKey }) => {
          const isActive = activeLanguage === code
          const label = t(`${translationKey}.label`)
          const languageName = t(`${translationKey}.name`)
          const accessibleLabel = t(
            isActive
              ? "appearanceLanguage.switcher.currentLanguage"
              : "appearanceLanguage.switcher.switchToLanguage",
            { language: languageName },
          )

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
