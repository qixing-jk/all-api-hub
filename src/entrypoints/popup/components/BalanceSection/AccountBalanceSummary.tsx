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
  calculateTotalIncomeForSites,
  getCurrencySymbol,
  getOppositeCurrency,
} from "~/utils/core/formatters"

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

  const sizeClass = size === "md" ? "text-base" : "text-3xl"

  return (
    <div className="flex min-w-0 items-center space-x-1">
      <button
        onClick={onCurrencyToggle}
        className={`${sizeClass} dark:text-dark-text-primary min-w-0 p-0 text-left leading-tight font-bold tracking-tight break-words text-gray-900 tabular-nums transition-colors hover:text-blue-600`}
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
  const {
    displayData,
    isInitialLoad,
    prevTotalConsumption,
    todayIncomeEstimateTotals,
  } = useAccountDataContext()
  const { currencyType, showTodayCashflow, updateCurrencyType, preferences } =
    useUserPreferencesContext()
  const estimatedTodayIncomeEnabled =
    preferences.balanceHistory?.estimatedTodayIncome?.enabled === true

  const totalConsumption = useMemo(
    () => calculateTotalConsumption(displayData),
    [displayData],
  )

  const totalBalance = useMemo(
    () => calculateTotalBalance(displayData),
    [displayData],
  )

  const totalIncome = useMemo(
    () => calculateTotalIncomeForSites(displayData),
    [displayData],
  )

  const handleCurrencyToggle = () => {
    updateCurrencyType(getOppositeCurrency(currencyType))
  }

  return (
    <div className="space-y-2">
      <div className="dark:bg-dark-bg-secondary/40 space-y-1 rounded-lg bg-gray-50/80">
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

      {showTodayCashflow && (
        <div
          className={
            estimatedTodayIncomeEnabled
              ? "grid grid-cols-3 gap-2"
              : "grid grid-cols-2 gap-2"
          }
        >
          <div className="dark:bg-dark-bg-secondary/30 min-w-0 space-y-1 rounded-md bg-gray-50/70 p-2">
            <Caption className="font-medium">
              {t("account:stats.todayConsumption")}
            </Caption>
            <BalanceDisplay
              value={totalConsumption.amount[currencyType]}
              startValue={
                isInitialLoad ? 0 : prevTotalConsumption[currencyType]
              }
              isInitialLoad={isInitialLoad}
              currencyType={currencyType}
              onCurrencyToggle={handleCurrencyToggle}
              prefix={totalConsumption.amount[currencyType] > 0 ? "-" : ""}
              size="md"
            />
          </div>

          <div className="dark:bg-dark-bg-secondary/30 min-w-0 space-y-1 rounded-md bg-gray-50/70 p-2">
            <Caption className="font-medium">
              {estimatedTodayIncomeEnabled
                ? t("account:stats.trustedTodayIncome")
                : t("account:stats.todayIncome")}
            </Caption>
            <BalanceDisplay
              value={totalIncome.amount[currencyType]}
              startValue={0}
              isInitialLoad={isInitialLoad}
              currencyType={currencyType}
              onCurrencyToggle={handleCurrencyToggle}
              prefix={totalIncome.amount[currencyType] > 0 ? "+" : ""}
              size="md"
            />
          </div>

          {estimatedTodayIncomeEnabled && (
            <div className="dark:bg-dark-bg-secondary/30 min-w-0 space-y-1 rounded-md bg-gray-50/70 p-2">
              <Caption className="font-medium">
                {t("account:stats.estimatedTodayIncome")}
              </Caption>
              {todayIncomeEstimateTotals.estimated ? (
                <BalanceDisplay
                  value={todayIncomeEstimateTotals.estimated[currencyType]}
                  startValue={0}
                  isInitialLoad={isInitialLoad}
                  currencyType={currencyType}
                  onCurrencyToggle={handleCurrencyToggle}
                  prefix={
                    todayIncomeEstimateTotals.estimated[currencyType] > 0
                      ? "+"
                      : ""
                  }
                  size="md"
                />
              ) : (
                <div className="dark:text-dark-text-tertiary text-base font-bold text-gray-500">
                  -
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
