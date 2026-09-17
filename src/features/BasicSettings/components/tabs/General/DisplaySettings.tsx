import { CalendarDays, Eye, Globe2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { SegmentedControl } from "~/components/SegmentedControl"
import { Card, CardItem, CardList, Switch } from "~/components/ui"
import { DATA_TYPE_BALANCE, DATA_TYPE_CASHFLOW } from "~/constants"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { PreferenceSettingSection as SettingSection } from "~/features/BasicSettings/components/shared/PreferenceSettingSection"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import type { CurrencyType, DashboardTabType } from "~/types"
import { showUpdateToast } from "~/utils/feedback/preferenceFeedback"

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
    const writeResult = await updateCurrencyType(currency)
    showUpdateToast(writeResult, t("display.currencyUnit"))
  }

  const handleDefaultTabChange = async (tab: DashboardTabType) => {
    if (!showTodayCashflow && tab === DATA_TYPE_CASHFLOW) return
    if (tab === activeTab) return
    const writeResult = await updateDefaultTab(tab)
    showUpdateToast(writeResult, t("display.defaultTab"))
  }

  const handleTodayCashflowToggle = async (enabled: boolean) => {
    const writeResult = await updateShowTodayCashflow(enabled)
    showUpdateToast(writeResult, t("display.todayCashflowEnabled"))
  }

  return (
    <SettingSection
      id="general-display"
      title={t("display.title")}
      description={t("display.description")}
      onReset={resetDisplaySettings}
      resetRequiresConfirmation={false}
      resetDisabled={
        currencyType === DEFAULT_PREFERENCES.currencyType &&
        activeTab === DEFAULT_PREFERENCES.activeTab &&
        showTodayCashflow === DEFAULT_PREFERENCES.showTodayCashflow
      }
    >
      <Card padding="none">
        <CardList>
          <CardItem
            id="display-currency-unit"
            icon={<Globe2 className="text-link h-5 w-5" />}
            title={t("display.currencyUnit")}
            description={t("display.currencyDesc")}
            rightContent={
              <SegmentedControl
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
            icon={<CalendarDays className="text-link h-5 w-5" />}
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
              <Eye className="text-theme-600 dark:text-theme-400 h-5 w-5" />
            }
            title={t("display.defaultTab")}
            description={t("display.defaultTabDesc")}
            rightContent={
              <SegmentedControl
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
