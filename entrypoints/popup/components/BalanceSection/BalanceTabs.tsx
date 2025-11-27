import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react"
import React, { useMemo } from "react"
import CountUp from "react-countup"
import { useTranslation } from "react-i18next"

import { BodySmall } from "~/components/ui"
import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import {
  calculateTotalBalance,
  calculateTotalConsumption,
  getCurrencySymbol,
  getOppositeCurrency
} from "~/utils/formatters"

const StyledTab: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Tab
    className={({ selected }) =>
      `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${ANIMATIONS.transition.base} ${
        selected
          ? "dark:bg-dark-bg-secondary dark:text-dark-text-primary bg-white text-gray-900 shadow-sm"
          : "dark:text-dark-text-secondary dark:hover:text-dark-text-primary text-gray-500 hover:text-gray-700"
      }`
    }>
    {children}
  </Tab>
)

const BalanceDisplay: React.FC<{
  value: number
  startValue: number
  isInitialLoad: boolean
  currencyType: "USD" | "CNY"
  onCurrencyToggle: () => void
  isConsumption?: boolean
  compact?: boolean
}> = ({
  value,
  startValue,
  isInitialLoad,
  currencyType,
  onCurrencyToggle,
  isConsumption = false,
  compact = false
}) => {
  const { t } = useTranslation("common")
  return (
    <div className="flex items-center space-x-1 break-all">
      <button
        onClick={onCurrencyToggle}
        className={`${compact ? "text-2xl" : "text-4xl"} dark:text-dark-text-primary p-0 text-left font-bold tracking-tight text-gray-900 transition-colors hover:text-blue-600`}
        aria-label={t("currency.clickToSwitch", {
          currency:
            currencyType === "USD" ? t("currency.cny") : t("currency.usd")
        })}>
        {isConsumption && value > 0 ? "-" : ""}
        {getCurrencySymbol(currencyType)}
        <CountUp
          start={startValue}
          end={value}
          duration={
            isInitialLoad
              ? UI_CONSTANTS.ANIMATION.INITIAL_DURATION
              : UI_CONSTANTS.ANIMATION.UPDATE_DURATION
          }
          decimals={2}
          preserveValue
        />
      </button>
    </div>
  )
}

export const BalanceTabs: React.FC = () => {
  const { t } = useTranslation(["account", "common"])
  const { accounts, displayData, stats, isInitialLoad, prevTotalConsumption } =
    useAccountDataContext()
  const { activeTab, currencyType, updateActiveTab, updateCurrencyType } =
    useUserPreferencesContext()

  const totalConsumption = useMemo(
    () => calculateTotalConsumption(stats, accounts),
    [stats, accounts]
  )

  const totalBalance = useMemo(
    () => calculateTotalBalance(displayData),
    [displayData]
  )

  const totalIncome = useMemo(() => {
    return {
      USD: parseFloat(
        (
          stats.today_total_income /
          UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
        ).toFixed(2)
      ),
      CNY: displayData.reduce((sum, site) => {
        return sum + (site.todayIncome?.CNY || 0)
      }, 0)
    }
  }, [stats, displayData])

  const handleTabChange = (index: number) => {
    const newTab = index === 0 ? DATA_TYPE_CONSUMPTION : DATA_TYPE_BALANCE
    updateActiveTab(newTab)
  }

  const handleCurrencyToggle = () => {
    updateCurrencyType(getOppositeCurrency(currencyType))
  }

  return (
    <TabGroup
      selectedIndex={activeTab === DATA_TYPE_CONSUMPTION ? 0 : 1}
      onChange={handleTabChange}
      className="space-y-2">
      <div className="flex justify-start">
        <TabList
          className={`flex space-x-1 ${COLORS.background.tertiary} rounded-lg p-1`}>
          <StyledTab>{t("account:stats.todayConsumption")}</StyledTab>
          <StyledTab>{t("account:stats.totalBalance")}</StyledTab>
        </TabList>
      </div>

      <TabPanels>
        <TabPanel>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <BodySmall className="font-medium">
                {t("account:stats.todayConsumption")}
              </BodySmall>
              <BalanceDisplay
                value={totalConsumption[currencyType]}
                startValue={
                  isInitialLoad ? 0 : prevTotalConsumption[currencyType]
                }
                isInitialLoad={isInitialLoad}
                currencyType={currencyType}
                onCurrencyToggle={handleCurrencyToggle}
                isConsumption
                compact
              />
            </div>
            <div className="flex items-center justify-between">
              <BodySmall className="font-medium">
                {t("account:stats.todayIncome")}
              </BodySmall>
              <BalanceDisplay
                value={totalIncome[currencyType]}
                startValue={0}
                isInitialLoad={isInitialLoad}
                currencyType={currencyType}
                onCurrencyToggle={handleCurrencyToggle}
                isConsumption={false}
                compact
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel>
          <BalanceDisplay
            value={totalBalance[currencyType]}
            startValue={0}
            isInitialLoad={isInitialLoad}
            currencyType={currencyType}
            onCurrencyToggle={handleCurrencyToggle}
          />
        </TabPanel>
      </TabPanels>
    </TabGroup>
  )
}
