import {
  CalendarDaysIcon,
  EyeIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch, ToggleButton } from "~/components/ui"
import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type { CurrencyType, DashboardTabType } from "~/types"
import { showUpdateToast } from "~/utils/toastHelpers"

/**
 * Settings section for display preferences (currency, default dashboard tab).
 */
export default function DisplaySettings() {
  const { t } = useTranslation("settings")
  const {
    currencyType,
    activeTab,
    showTodayCashflow,
    updateCurrencyType,
    updateDefaultTab,
    updateShowTodayCashflow,
    resetDisplaySettings,
  } = useUserPreferencesContext()

  const handleCurrencyChange = async (currency: CurrencyType) => {
    if (currency === currencyType) return
    const success = await updateCurrencyType(currency)
    showUpdateToast(success, t("display.currencyUnit"))
  }

  const handleDefaultTabChange = async (tab: DashboardTabType) => {
    if (!showTodayCashflow && tab === DATA_TYPE_CASHFLOW) return
    if (tab === activeTab) return
    const success = await updateDefaultTab(tab)
    showUpdateToast(success, t("display.defaultTab"))
  }

  const handleTodayCashflowToggle = async (enabled: boolean) => {
    const success = await updateShowTodayCashflow(enabled)
    showUpdateToast(success, t("display.todayCashflowEnabled"))
  }

  return (
    <SettingSection
      id="general-display"
      title={t("display.title")}
      description={t("display.description")}
      onReset={resetDisplaySettings}
    >
      <Card padding="none">
        <CardList>
          <CardItem
            icon={
              <GlobeAltIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            }
            title={t("display.currencyUnit")}
            description={t("display.currencyDesc")}
            rightContent={
              <div
                className={`flex flex-col sm:flex-row ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}
              >
                <ToggleButton
                  onClick={() => handleCurrencyChange("USD")}
                  isActive={currencyType === "USD"}
                  size="default"
                  aria-label={t("display.usd")}
                >
                  {t("display.usd")}
                </ToggleButton>
                <ToggleButton
                  onClick={() => handleCurrencyChange("CNY")}
                  isActive={currencyType === "CNY"}
                  size="default"
                  aria-label={t("display.cny")}
                >
                  {t("display.cny")}
                </ToggleButton>
              </div>
            }
          />

          <CardItem
            icon={
              <CalendarDaysIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            }
            title={t("display.todayCashflowEnabled")}
            description={t("display.todayCashflowEnabledDesc")}
            rightContent={
              <Switch
                checked={showTodayCashflow}
                onChange={handleTodayCashflowToggle}
              />
            }
          />

          <CardItem
            icon={
              <EyeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            }
            title={t("display.defaultTab")}
            description={t("display.defaultTabDesc")}
            rightContent={
              <div
                className={`flex flex-col sm:flex-row ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}
              >
                <ToggleButton
                  onClick={() => handleDefaultTabChange(DATA_TYPE_CASHFLOW)}
                  isActive={activeTab === DATA_TYPE_CASHFLOW}
                  disabled={!showTodayCashflow}
                  size="default"
                  aria-label={t("display.todayCashflow")}
                >
                  {t("display.todayCashflow")}
                </ToggleButton>
                <ToggleButton
                  onClick={() => handleDefaultTabChange(DATA_TYPE_BALANCE)}
                  isActive={activeTab === DATA_TYPE_BALANCE}
                  size="default"
                  aria-label={t("display.totalBalance")}
                >
                  {t("display.totalBalance")}
                </ToggleButton>
              </div>
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
