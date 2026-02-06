import React, { useMemo } from "react"
import CountUp from "react-countup"
import { useTranslation } from "react-i18next"

import { BodySmall, Caption } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import {
  calculateTotalBalance,
  calculateTotalConsumption,
  getCurrencySymbol,
  getOppositeCurrency,
} from "~/utils/formatters"

const BalanceDisplay: React.FC<{
  value: number
  startValue: number
  isInitialLoad: boolean
  currencyType: "USD" | "CNY"
  onCurrencyToggle: () => void
  prefix?: string
  size?: "md" | "lg"
}> = ({
  value,
  startValue,
  isInitialLoad,
  currencyType,
  onCurrencyToggle,
  prefix,
  size = "lg",
}) => {
  const { t } = useTranslation("common")

  const sizeClass = size === "md" ? "text-2xl" : "text-4xl"

  return (
    <div className="flex items-center space-x-1 break-all">
      <button
        onClick={onCurrencyToggle}
        className={`${sizeClass} dark:text-dark-text-primary p-0 text-left font-bold tracking-tight text-gray-900 transition-colors hover:text-blue-600`}
        aria-label={t("currency.clickToSwitch", {
          currency:
            currencyType === "USD" ? t("currency.cny") : t("currency.usd"),
        })}
      >
        {prefix}
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

/**
 * Popup account statistics summary showing total balance plus today's cashflow.
 * Click any amount to toggle the display currency.
 */
export default function AccountBalanceSummary() {
  const { t } = useTranslation(["account", "common"])
  const { accounts, displayData, stats, isInitialLoad, prevTotalConsumption } =
    useAccountDataContext()
  const { currencyType, updateCurrencyType } = useUserPreferencesContext()

  const totalConsumption = useMemo(
    () => calculateTotalConsumption(stats, accounts),
    [stats, accounts],
  )

  const totalBalance = useMemo(
    () => calculateTotalBalance(displayData),
    [displayData],
  )

  const totalIncome = useMemo(() => {
    return {
      USD: parseFloat(
        (
          stats.today_total_income /
          UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
        ).toFixed(2),
      ),
      CNY: displayData.reduce((sum, site) => {
        return sum + (site.todayIncome?.CNY || 0)
      }, 0),
    }
  }, [displayData, stats.today_total_income])

  const handleCurrencyToggle = () => {
    updateCurrencyType(getOppositeCurrency(currencyType))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <BodySmall className="font-medium">
          {t("account:stats.totalBalance")}
        </BodySmall>
        <BalanceDisplay
          value={totalBalance[currencyType]}
          startValue={0}
          isInitialLoad={isInitialLoad}
          currencyType={currencyType}
          onCurrencyToggle={handleCurrencyToggle}
          size="lg"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Caption className="font-medium">
            {t("account:stats.todayConsumption")}
          </Caption>
          <BalanceDisplay
            value={totalConsumption[currencyType]}
            startValue={isInitialLoad ? 0 : prevTotalConsumption[currencyType]}
            isInitialLoad={isInitialLoad}
            currencyType={currencyType}
            onCurrencyToggle={handleCurrencyToggle}
            prefix={totalConsumption[currencyType] > 0 ? "-" : ""}
            size="md"
          />
        </div>

        <div className="space-y-1">
          <Caption className="font-medium">
            {t("account:stats.todayIncome")}
          </Caption>
          <BalanceDisplay
            value={totalIncome[currencyType]}
            startValue={0}
            isInitialLoad={isInitialLoad}
            currencyType={currencyType}
            onCurrencyToggle={handleCurrencyToggle}
            prefix={totalIncome[currencyType] > 0 ? "+" : ""}
            size="md"
          />
        </div>
      </div>
    </div>
  )
}
