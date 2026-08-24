import type { TFunction } from "i18next"
import { Languages } from "lucide-react"
import { useTranslation } from "react-i18next"

import { ResponsiveToggleGroup } from "~/components/ResponsiveButtonGroup"
import {
  IconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  DEFAULT_LANG,
  ENGLISH_LANG,
  GERMAN_LANG,
  JAPANESE_LANG,
  PORTUGUESE_BRAZIL_LANG,
  SPANISH_LATIN_AMERICA_LANG,
  SUPPORTED_UI_LANGUAGES,
  TRADITIONAL_CHINESE_LANG,
  VIETNAMESE_LANG,
} from "~/constants"
import type { SupportedUiLanguage } from "~/constants"
import { cn } from "~/lib/utils"
import { userPreferences } from "~/services/preferences/userPreferences"
import { normalizeAppLanguage } from "~/utils/i18n/language"
import { changePageLanguage } from "~/utils/i18n/pageLanguage"

interface LanguageSwitcherProps {
  className?: string
  compact?: boolean
  showIcon?: boolean
  variant?: "inline" | "icon-dropdown" | "select"
}

/**
 * Resolve the localized short label shown on each language toggle.
 */
function getLanguageOptionLabel(t: TFunction, language: SupportedUiLanguage) {
  switch (language) {
    case ENGLISH_LANG:
      return t("settings:appearanceLanguage.switcher.options.en.label")
    case GERMAN_LANG:
      return t("settings:appearanceLanguage.switcher.options.de.label")
    case SPANISH_LATIN_AMERICA_LANG:
      return t("settings:appearanceLanguage.switcher.options.es-419.label")
    case PORTUGUESE_BRAZIL_LANG:
      return t("settings:appearanceLanguage.switcher.options.pt-BR.label")
    case JAPANESE_LANG:
      return t("settings:appearanceLanguage.switcher.options.ja.label")
    case VIETNAMESE_LANG:
      return t("settings:appearanceLanguage.switcher.options.vi.label")
    case DEFAULT_LANG:
      return t("settings:appearanceLanguage.switcher.options.zh-CN.label")
    case TRADITIONAL_CHINESE_LANG:
      return t("settings:appearanceLanguage.switcher.options.zh-TW.label")
  }
}

/**
 * Resolve the localized language name used in accessibility copy.
 */
function getLanguageOptionName(t: TFunction, language: SupportedUiLanguage) {
  switch (language) {
    case ENGLISH_LANG:
      return t("settings:appearanceLanguage.switcher.options.en.name")
    case GERMAN_LANG:
      return t("settings:appearanceLanguage.switcher.options.de.name")
    case SPANISH_LATIN_AMERICA_LANG:
      return t("settings:appearanceLanguage.switcher.options.es-419.name")
    case PORTUGUESE_BRAZIL_LANG:
      return t("settings:appearanceLanguage.switcher.options.pt-BR.name")
    case JAPANESE_LANG:
      return t("settings:appearanceLanguage.switcher.options.ja.name")
    case VIETNAMESE_LANG:
      return t("settings:appearanceLanguage.switcher.options.vi.name")
    case DEFAULT_LANG:
      return t("settings:appearanceLanguage.switcher.options.zh-CN.name")
    case TRADITIONAL_CHINESE_LANG:
      return t("settings:appearanceLanguage.switcher.options.zh-TW.name")
  }
}

/** Resolve only exact option values emitted by the language controls. */
function findSupportedUiLanguage(value: string) {
  return SUPPORTED_UI_LANGUAGES.find((language) => language === value)
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
  const currentLanguageLabel = t(
    "appearanceLanguage.switcher.currentLanguage",
    {
      language: activeLanguageName,
    },
  )

  const handleLanguageChange = async (language: SupportedUiLanguage) => {
    if (language !== activeLanguage) {
      const applied = await changePageLanguage(i18n, language)
      if (!applied) return
    }
    await userPreferences.setLanguage(language)
  }
  const queueLanguageChange = (language: SupportedUiLanguage) => {
    void handleLanguageChange(language).catch(() => undefined)
  }
  const handleSupportedLanguageChange = (value: string) => {
    const nextLanguage = findSupportedUiLanguage(value)
    if (nextLanguage) queueLanguageChange(nextLanguage)
  }

  if (variant === "icon-dropdown") {
    const triggerLabel = `${t("appearanceLanguage.switcher.groupLabel")}: ${currentLanguageLabel}`

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
            onValueChange={handleSupportedLanguageChange}
          >
            {SUPPORTED_UI_LANGUAGES.map((code) => {
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

  if (variant === "select") {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 sm:gap-2",
          showIcon && "w-full",
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
        <Select
          value={activeLanguage}
          onValueChange={handleSupportedLanguageChange}
        >
          <SelectTrigger
            size={compact ? "sm" : "default"}
            aria-label={currentLanguageLabel}
            title={currentLanguageLabel}
            className={cn(showIcon && "flex-1", className)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {SUPPORTED_UI_LANGUAGES.map((code) => {
              const languageName = getLanguageOptionName(t, code)

              return (
                <SelectItem
                  key={code}
                  value={code}
                  onPointerUp={() => {
                    if (code === activeLanguage) {
                      queueLanguageChange(code)
                    }
                  }}
                >
                  {languageName}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex w-full items-center gap-1.5 sm:gap-2 [@container(min-width:42rem)]:w-auto",
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
      <ResponsiveToggleGroup
        aria-label={t("appearanceLanguage.switcher.groupLabel")}
        value={activeLanguage}
        onValueChange={queueLanguageChange}
        buttonSize="sm"
        showActiveIndicator
        className={cn("p-0.5", !compact && "sm:p-1")}
        options={SUPPORTED_UI_LANGUAGES.map((code) => {
          const label = getLanguageOptionLabel(t, code)
          const languageName = getLanguageOptionName(t, code)
          const accessibleLabel =
            activeLanguage === code
              ? t("appearanceLanguage.switcher.currentLanguage", {
                  language: languageName,
                })
              : t("appearanceLanguage.switcher.switchToLanguage", {
                  language: languageName,
                })

          return {
            value: code,
            label,
            ariaLabel: accessibleLabel,
            title: accessibleLabel,
            buttonClassName: cn(
              "min-w-[3rem] flex-1 [@container(min-width:42rem)]:flex-none",
              !compact && "sm:min-w-[3.5rem]",
            ),
          }
        })}
      />
    </div>
  )
}
