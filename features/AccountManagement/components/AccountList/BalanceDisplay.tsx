import React from "react"
import CountUp from "react-countup"
import { useTranslation } from "react-i18next"

import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import type { DisplaySiteData } from "~/types"
import { getCurrencySymbol } from "~/utils/formatters"

interface BalanceDisplayProps {
  site: DisplaySiteData
}

// Reusable component for displaying monetary values with animation
const AnimatedValue: React.FC<{
  value: number
  startValue: number
  prefix?: string
  suffix?: string
  className?: string
  title?: string
  onClick?: () => void
  isRefreshing?: boolean
}> = React.memo(
  ({
    value,
    startValue,
    prefix = "",
    suffix = "",
    className = "",
    title,
    onClick,
    isRefreshing = false
  }) => {
    const { isInitialLoad } = useAccountDataContext()
    const { currencyType } = useUserPreferencesContext()

    return (
      <div
        className={`truncate transition-all duration-200 ${
          isRefreshing
            ? "animate-pulse opacity-60"
            : onClick
              ? "cursor-pointer hover:scale-105 hover:opacity-80"
              : ""
        } ${className}`}
        onClick={onClick}
        title={title}>
        {prefix}
        {getCurrencySymbol(currencyType)}
        <CountUp
          start={isInitialLoad ? 0 : startValue}
          end={value}
          duration={
            isInitialLoad
              ? UI_CONSTANTS.ANIMATION.SLOW_DURATION
              : UI_CONSTANTS.ANIMATION.FAST_DURATION
          }
          decimals={2}
          preserveValue
        />
        {suffix}
      </div>
    )
  }
)

const BalanceDisplay: React.FC<BalanceDisplayProps> = React.memo(({ site }) => {
  const { t } = useTranslation("account")
  const { isInitialLoad, prevBalances } = useAccountDataContext()
  const { currencyType } = useUserPreferencesContext()
  const { handleRefreshAccount, refreshingAccountId } =
    useAccountActionsContext()

  const isRefreshing = refreshingAccountId === site.id

  const handleRefreshClick = async () => {
    if (!isRefreshing) {
      await handleRefreshAccount(site, true) // Force refresh
    }
  }

  return (
    <div className="w-full overflow-hidden text-right">
      {/* Balance */}
      <AnimatedValue
        value={site.balance[currencyType]}
        startValue={
          isInitialLoad ? 0 : prevBalances[site.id]?.[currencyType] || 0
        }
        className="mb-0.5 text-sm font-semibold text-gray-900 dark:text-dark-text-primary sm:text-base md:text-lg"
        title={t("list.balance.refreshBalance")}
        onClick={handleRefreshClick}
        isRefreshing={isRefreshing}
      />

      {/* Today's Statistics */}
      <div className="space-y-0.5">
        {/* Consumption */}
        <AnimatedValue
          value={site.todayConsumption[currencyType]}
          startValue={0}
          prefix="-"
          className={`text-[10px] sm:text-xs ${
            site.todayConsumption[currencyType] > 0
              ? "text-green-500"
              : "text-gray-400 dark:text-dark-text-tertiary"
          }`}
          title={t("list.balance.refreshConsumption")}
          onClick={handleRefreshClick}
          isRefreshing={isRefreshing}
        />

        {/* Income */}
        <AnimatedValue
          value={site.todayIncome[currencyType]}
          startValue={0}
          prefix="+"
          className={`text-[10px] sm:text-xs ${
            site.todayIncome[currencyType] > 0
              ? "text-blue-500"
              : "text-gray-400 dark:text-dark-text-tertiary"
          }`}
          title={t("list.balance.refreshIncome")}
          onClick={handleRefreshClick}
          isRefreshing={isRefreshing}
        />
      </div>
    </div>
  )
})

export default BalanceDisplay
