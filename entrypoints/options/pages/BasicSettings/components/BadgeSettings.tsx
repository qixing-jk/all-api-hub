import { Square3Stack3DIcon } from "@heroicons/react/24/outline"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch, ToggleButton } from "~/components/ui"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import {
  badgeService,
  BadgeConfig,
  BadgeDisplayMode,
  DEFAULT_BADGE_CONFIG,
} from "~/services/badgeService"
import { userPreferences } from "~/services/userPreferences"
import type { CurrencyType } from "~/types"
import { showUpdateToast } from "~/utils/toastHelpers"

/**
 * Settings section for extension icon badge configuration.
 */
export default function BadgeSettings() {
  const { t } = useTranslation("settings")
  const [config, setConfig] = useState<BadgeConfig>(DEFAULT_BADGE_CONFIG)
  const [isLoading, setIsLoading] = useState(true)

  // Load badge config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const prefs = await userPreferences.getPreferences()
        setConfig(prefs.badge || DEFAULT_BADGE_CONFIG)
      } catch (error) {
        console.error("Failed to load badge config:", error)
      } finally {
        setIsLoading(false)
      }
    }
    loadConfig()
  }, [])

  const updateConfig = useCallback(
    async (updates: Partial<BadgeConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)

      try {
        await badgeService.updateConfig(updates)
        return true
      } catch (error) {
        console.error("Failed to update badge config:", error)
        // Revert on failure
        setConfig(config)
        return false
      }
    },
    [config],
  )

  const handleEnabledChange = async (enabled: boolean) => {
    const success = await updateConfig({ enabled })
    showUpdateToast(success, t("badge.enabled"))
  }

  const handleDisplayModeChange = async (displayMode: BadgeDisplayMode) => {
    if (displayMode === config.displayMode) return
    const success = await updateConfig({ displayMode })
    showUpdateToast(success, t("badge.displayMode"))
  }

  const handleCurrencyChange = async (currencyType: CurrencyType) => {
    if (currencyType === config.currencyType) return
    const success = await updateConfig({ currencyType })
    showUpdateToast(success, t("badge.currency"))
  }

  const handleReset = async () => {
    const success = await userPreferences.resetBadgeConfig()
    if (success) {
      setConfig(DEFAULT_BADGE_CONFIG)
      await badgeService.updateBadge()
    }
    return success
  }

  if (isLoading) {
    return null
  }

  return (
    <SettingSection
      id="badge-settings"
      title={t("badge.title")}
      description={t("badge.description")}
      onReset={handleReset}
    >
      <Card padding="none">
        <CardList>
          {/* Enable Badge */}
          <CardItem
            icon={
              <Square3Stack3DIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            }
            title={t("badge.enabled")}
            description={t("badge.enabledDesc")}
            rightContent={
              <Switch
                checked={config.enabled}
                onChange={handleEnabledChange}
                aria-label={t("badge.enabled")}
              />
            }
          />

          {/* Display Mode */}
          {config.enabled && (
            <>
              <CardItem
                icon={
                  <Square3Stack3DIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                }
                title={t("badge.displayMode")}
                description={t("badge.displayModeDesc")}
                rightContent={
                  <div
                    className={`flex flex-col sm:flex-row ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}
                  >
                    <ToggleButton
                      onClick={() => handleDisplayModeChange("balance")}
                      isActive={config.displayMode === "balance"}
                      size="default"
                      aria-label={t("badge.balance")}
                    >
                      {t("badge.balance")}
                    </ToggleButton>
                    <ToggleButton
                      onClick={() => handleDisplayModeChange("consumption")}
                      isActive={config.displayMode === "consumption"}
                      size="default"
                      aria-label={t("badge.consumption")}
                    >
                      {t("badge.consumption")}
                    </ToggleButton>
                  </div>
                }
              />

              {/* Currency */}
              <CardItem
                icon={
                  <Square3Stack3DIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                }
                title={t("badge.currency")}
                description={t("badge.currencyDesc")}
                rightContent={
                  <div
                    className={`flex flex-col sm:flex-row ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}
                  >
                    <ToggleButton
                      onClick={() => handleCurrencyChange("USD")}
                      isActive={config.currencyType === "USD"}
                      size="default"
                      aria-label={t("display.usd")}
                    >
                      {t("display.usd")}
                    </ToggleButton>
                    <ToggleButton
                      onClick={() => handleCurrencyChange("CNY")}
                      isActive={config.currencyType === "CNY"}
                      size="default"
                      aria-label={t("display.cny")}
                    >
                      {t("display.cny")}
                    </ToggleButton>
                  </div>
                }
              />
            </>
          )}
        </CardList>
      </Card>
    </SettingSection>
  )
}
