import { EyeIcon, GlobeAltIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import {
  BodySmall,
  Card,
  CardItem,
  CardList,
  Heading3,
  ToggleButton
} from "~/components/ui"
import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type { BalanceType, CurrencyType } from "~/types"

import { showUpdateToast } from "../../../../../utils/toastHelpers.ts"

export default function DisplaySettings() {
  const { t } = useTranslation("settings")
  const { currencyType, activeTab, updateCurrencyType, updateDefaultTab } =
    useUserPreferencesContext()

  const handleCurrencyChange = async (currency: CurrencyType) => {
    if (currency === currencyType) return
    const success = await updateCurrencyType(currency)
    showUpdateToast(success, t("display.currencyUnit"))
  }

  const handleDefaultTabChange = async (tab: BalanceType) => {
    if (tab === activeTab) return
    const success = await updateDefaultTab(tab)
    showUpdateToast(success, t("display.defaultTab"))
  }

  return (
    <section className="space-y-6" id="general-display">
      <div className="space-y-1.5">
        <Heading3>{t("display.title")}</Heading3>
        <BodySmall>{t("display.description")}</BodySmall>
      </div>

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
                className={`flex flex-col sm:flex-row ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}>
                <ToggleButton
                  onClick={() => handleCurrencyChange("USD")}
                  isActive={currencyType === "USD"}
                  size="default"
                  aria-label={t("display.usd")}>
                  {t("display.usd")}
                </ToggleButton>
                <ToggleButton
                  onClick={() => handleCurrencyChange("CNY")}
                  isActive={currencyType === "CNY"}
                  size="default"
                  aria-label={t("display.cny")}>
                  {t("display.cny")}
                </ToggleButton>
              </div>
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
                className={`flex flex-col sm:flex-row ${COLORS.background.tertiary} rounded-lg p-1 shadow-sm ${ANIMATIONS.transition.base}`}>
                <ToggleButton
                  onClick={() => handleDefaultTabChange(DATA_TYPE_CONSUMPTION)}
                  isActive={activeTab === DATA_TYPE_CONSUMPTION}
                  size="default"
                  aria-label={t("display.todayConsumption")}>
                  {t("display.todayConsumption")}
                </ToggleButton>
                <ToggleButton
                  onClick={() => handleDefaultTabChange(DATA_TYPE_BALANCE)}
                  isActive={activeTab === DATA_TYPE_BALANCE}
                  size="default"
                  aria-label={t("display.totalBalance")}>
                  {t("display.totalBalance")}
                </ToggleButton>
              </div>
            }
          />
        </CardList>
      </Card>
    </section>
  )
}
