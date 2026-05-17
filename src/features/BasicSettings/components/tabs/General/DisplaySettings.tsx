import {
  CalendarDaysIcon,
  EyeIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { ResponsiveToggleGroup } from "~/components/ResponsiveButtonGroup"
import { SettingSection } from "~/components/SettingSection"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type { CurrencyType, DashboardTabType } from "~/types"
import { showUpdateToast } from "~/utils/core/toastHelpers"

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
            id="display-currency-unit"
            icon={
              <GlobeAltIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
            }
            title={t("display.currencyUnit")}
            description={t("display.currencyDesc")}
            rightContent={
              <ResponsiveToggleGroup
                aria-label={t("display.currencyUnit")}
                value={currencyType}
                onValueChange={handleCurrencyChange}
                options={[
                  {
                    value: "USD",
                    label: t("display.usd"),
                    ariaLabel: t("display.usd"),
                  },
                  {
                    value: "CNY",
                    label: t("display.cny"),
                    ariaLabel: t("display.cny"),
                  },
                ]}
              />
            }
          />

          <CardItem
            id="display-today-cashflow-enabled"
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
            id="display-default-tab"
            icon={
              <EyeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            }
            title={t("display.defaultTab")}
            description={t("display.defaultTabDesc")}
            rightContent={
              <ResponsiveToggleGroup
                aria-label={t("display.defaultTab")}
                value={activeTab}
                onValueChange={handleDefaultTabChange}
                options={[
                  {
                    value: DATA_TYPE_CASHFLOW,
                    label: t("display.todayCashflow"),
                    ariaLabel: t("display.todayCashflow"),
                    disabled: !showTodayCashflow,
                  },
                  {
                    value: DATA_TYPE_BALANCE,
                    label: t("display.totalBalance"),
                    ariaLabel: t("display.totalBalance"),
                  },
                ]}
              />
            }
          />
        </CardList>
      </Card>
    </SettingSection>
  )
}
