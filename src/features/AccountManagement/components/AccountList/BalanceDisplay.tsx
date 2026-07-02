import React, { useEffect, useRef } from "react"
import CountUp from "react-countup"
import { useTranslation } from "react-i18next"

import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import type { DisplaySiteData } from "~/types"
import { getCurrencySymbol } from "~/utils/core/formatters"
import { getDisplayMoneyValue } from "~/utils/core/money"

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)

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
    isRefreshing = false,
  }) => {
    const { isInitialLoad } = useAccountDataContext()
    const { currencyType } = useUserPreferencesContext()
    const hasCommittedRef = useRef(false)

    useEffect(() => {
      hasCommittedRef.current = true
    }, [])

    const displayEndValue = getDisplayMoneyValue(value)
    const displayStartValue = isInitialLoad
      ? 0
      : getDisplayMoneyValue(startValue)
    const shouldAnimate = hasCommittedRef.current
    const content = (
      <>
        {prefix}
        {getCurrencySymbol(currencyType)}
        {shouldAnimate ? (
          <CountUp
            start={displayStartValue}
            end={displayEndValue}
            duration={
              isInitialLoad
                ? UI_CONSTANTS.ANIMATION.SLOW_DURATION
                : UI_CONSTANTS.ANIMATION.FAST_DURATION
            }
            decimals={UI_CONSTANTS.MONEY.DECIMALS}
            preserveValue
          />
        ) : (
          displayEndValue.toFixed(UI_CONSTANTS.MONEY.DECIMALS)
        )}
        {suffix}
      </>
    )

    if (onClick) {
      return (
        <button
          type="button"
          className={`ml-auto block max-w-full truncate bg-transparent p-0 text-right transition-all duration-200 ${
            isRefreshing
              ? "animate-pulse opacity-60"
              : "cursor-pointer hover:scale-105 hover:opacity-80"
          } ${className}`}
          onClick={onClick}
          title={title}
          aria-label={title}
        >
          {content}
        </button>
      )
    }

    return (
      <div
        className={`ml-auto max-w-full truncate text-right transition-all duration-200 ${
          isRefreshing
            ? "animate-pulse opacity-60"
            : onClick
              ? "cursor-pointer hover:scale-105 hover:opacity-80"
              : ""
        } ${className}`}
        onClick={onClick}
        title={title}
      >
        {content}
      </div>
    )
  },
)

const BalanceDisplay: React.FC<BalanceDisplayProps> = React.memo(({ site }) => {
  const { t } = useTranslation("account")
  const { isInitialLoad, prevBalances } = useAccountDataContext()
  const { currencyType, showTodayCashflow, preferences } =
    useUserPreferencesContext()
  const { handleRefreshAccount, refreshingAccountId } =
    useAccountActionsContext()

  const isRefreshing = refreshingAccountId === site.id
  const isAccountDisabled = site.disabled === true
  const isSubscriptionInactive = site.subscription?.isActive === false
  const estimatedTodayIncomeEnabled =
    preferences?.balanceHistory?.estimatedTodayIncome?.enabled === true
  const estimatedTodayIncome = site.estimatedTodayIncome?.[currencyType]

  const handleRefreshClick = async () => {
    if (isAccountDisabled) return
    if (!isRefreshing) {
      await handleRefreshAccount(site, true) // Force refresh
    }
  }

  const refreshTitle = isAccountDisabled
    ? t("list.site.disabled")
    : t("list.balance.refreshBalance")

  return (
    <div className="flex w-full flex-col items-end overflow-hidden text-right">
      {/* Balance */}
      <AnimatedValue
        value={site.balance[currencyType]}
        startValue={
          isInitialLoad ? 0 : prevBalances[site.id]?.[currencyType] || 0
        }
        className="dark:text-dark-text-primary mb-0.5 text-sm font-semibold text-gray-900 sm:text-base md:text-lg"
        title={refreshTitle}
        onClick={isAccountDisabled ? undefined : handleRefreshClick}
        isRefreshing={isRefreshing}
      />

      {/* Today's Statistics */}
      {showTodayCashflow && (
        <div className="flex max-w-full flex-wrap justify-end gap-x-1.5 gap-y-0.5">
          {/* Consumption */}
          <AnimatedValue
            value={site.todayConsumption[currencyType]}
            startValue={0}
            prefix="-"
            className={`text-[10px] sm:text-xs ${
              site.todayConsumption[currencyType] > 0
                ? "text-green-500"
                : "dark:text-dark-text-tertiary text-gray-400"
            }`}
            title={
              isAccountDisabled
                ? t("list.site.disabled")
                : t("list.balance.refreshCashflow")
            }
            onClick={isAccountDisabled ? undefined : handleRefreshClick}
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
                : "dark:text-dark-text-tertiary text-gray-400"
            }`}
            title={
              isAccountDisabled
                ? t("list.site.disabled")
                : t("list.balance.refreshIncome")
            }
            onClick={isAccountDisabled ? undefined : handleRefreshClick}
            isRefreshing={isRefreshing}
          />

          {estimatedTodayIncomeEnabled &&
            typeof estimatedTodayIncome === "number" && (
              <AnimatedValue
                value={estimatedTodayIncome}
                startValue={0}
                prefix="~"
                className={`text-[10px] sm:text-xs ${
                  estimatedTodayIncome > 0
                    ? "text-indigo-500"
                    : "dark:text-dark-text-tertiary text-gray-400"
                }`}
                title={
                  isAccountDisabled
                    ? t("list.site.disabled")
                    : t("stats.estimatedTodayIncome")
                }
                onClick={isAccountDisabled ? undefined : handleRefreshClick}
                isRefreshing={isRefreshing}
              />
            )}
        </div>
      )}

      {(site.usage || site.subscription) && (
        <div className="dark:text-dark-text-tertiary mt-0.5 flex max-w-full flex-wrap justify-end gap-x-1.5 gap-y-0.5 text-[10px] text-gray-500 sm:text-xs">
          {site.subscription?.name && (
            <span
              className="max-w-full truncate"
              title={t("stats.subscriptionTitle")}
            >
              {site.subscription.name}
            </span>
          )}
          {isSubscriptionInactive && (
            <span
              className="shrink-0 text-amber-600 dark:text-amber-400"
              title={t("stats.subscriptionStatus")}
            >
              {t("stats.subscriptionInactive")}
            </span>
          )}
          {typeof site.usage?.totalRequests === "number" && (
            <span title={t("stats.usageRequests")}>
              {formatCompactNumber(site.usage.totalRequests)}
            </span>
          )}
          {typeof site.usage?.totalTokens === "number" && (
            <span title={t("stats.usageTokens")}>
              {formatCompactNumber(site.usage.totalTokens)}
            </span>
          )}
          {!isSubscriptionInactive &&
            typeof site.subscription?.remainingCount === "number" && (
              <span title={t("stats.subscriptionRemainingCount")}>
                {formatCompactNumber(site.subscription.remainingCount)}
              </span>
            )}
        </div>
      )}
    </div>
  )
})

export default BalanceDisplay
