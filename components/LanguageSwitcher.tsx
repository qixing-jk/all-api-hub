import { Languages } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ToggleButton } from "~/components/ui"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { userPreferences } from "~/services/userPreferences"

const languageOptions = [
  { code: "en", label: "EN" },
  { code: "zh_CN", label: "中文" }
]

export function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const handleLanguageChange = async (lng: string) => {
    await i18n.changeLanguage(lng)
    await userPreferences.setLanguage(lng)
  }

  return (
    <div className="flex items-center space-x-1.5 sm:space-x-2">
      <Languages className="dark:text-dark-text-secondary h-4 w-4 sm:h-[1.2rem] sm:w-[1.2rem]" />
      <div
        className={`flex ${COLORS.background.tertiary} rounded-lg p-0.5 shadow-sm sm:p-1 ${ANIMATIONS.transition.base}`}>
        {languageOptions.map(({ code, label }) => {
          const isActive = i18n.language === code
          return (
            <ToggleButton
              key={code}
              onClick={() => handleLanguageChange(code)}
              isActive={isActive}
              size="sm"
              showActiveIndicator
              title={`Switch to ${label}`}
              aria-label={`Switch to ${label}`}>
              {label}
            </ToggleButton>
          )
        })}
      </div>
    </div>
  )
}
