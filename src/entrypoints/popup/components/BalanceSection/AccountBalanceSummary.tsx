import React, { useMemo } from "react"
import CountUp from "react-countup"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { BodySmall, Caption } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import {
  calculateTotalBalance,
  calculateTotalConsumption,
  calculateTotalIncomeForSites,
  getCurrencySymbol,
  getOppositeCurrency,
  getTodayMetricPresentation,
} from "~/utils/core/formatters"

const BalanceDisplay: React.FC<{
  value: number | null
  startValue: number
  isInitialLoad: boolean
  currencyType: "USD" | "CNY"
  onCurrencyToggle: () => void
  prefix?: string
  size?: "md" | "lg"
  availabilityLabel?: string
  emptyValueText?: string
  qualifier?: string
}> = ({
  value,
  startValue,
  isInitialLoad,
  currencyType,
  onCurrencyToggle,
  prefix,
  size = "lg",
  availabilityLabel,
  emptyValueText,
  qualifier,
}) => {
  const { t } = useTranslation("common")

  const sizeClass = size === "md" ? "text-base" : "text-3xl"
  const formattedValue =
    value === null
      ? undefined
      : `${prefix ?? ""}${getCurrencySymbol(currencyType)}${value.toFixed(
          UI_CONSTANTS.MONEY.DECIMALS,
        )}`

  const button = (
    <div className="flex min-w-0 items-center space-x-1">
      <button
        onClick={onCurrencyToggle}
        className={`${sizeClass} text-foreground hover:text-theme-600 min-w-0 p-0 text-left leading-tight font-bold tracking-tight break-words tabular-nums transition-colors`}
        aria-label={[
          formattedValue ?? emptyValueText,
          qualifier,
          availabilityLabel,
          t("currency.clickToSwitch", {
            currency:
              currencyType === "USD" ? t("currency.cny") : t("currency.usd"),
          }),
        ]
          .filter(Boolean)
          .join(". ")}
      >
        <span className="gap-y-density-1-5 inline-flex max-w-full flex-wrap items-baseline gap-x-1.5">
          <span aria-hidden="true">
            {value === null ? (
              emptyValueText ?? "—"
            ) : (
              <>
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
              </>
            )}
          </span>
          {qualifier ? (
            <span
              aria-hidden="true"
              className="text-muted-foreground text-[10px] font-medium"
            >
              {qualifier}
            </span>
          ) : null}
        </span>
      </button>
    </div>
  )

  return availabilityLabel ? (
    <Tooltip
      content={availabilityLabel}
      wrapperClassName="min-w-0 justify-start"
    >
      {button}
    </Tooltip>
  ) : (
    button
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
  const consumptionPresentation = getTodayMetricPresentation(
    totalConsumption.amount[currencyType],
    totalConsumption.coverage,
  )
  const incomePresentation = getTodayMetricPresentation(
    totalIncome.amount[currencyType],
    totalIncome.coverage,
  )
  const getAggregateAvailabilityLabel = (
    presentation: typeof consumptionPresentation,
    coverage: typeof totalConsumption.coverage,
  ) =>
    presentation.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial
      ? t(
          coverage.legacyUnclassifiedCount > 0
            ? "account:todayMetricAvailability.coverageWithRefresh"
            : "account:todayMetricAvailability.coverage",
          {
            complete: coverage.completeCount,
            partial: coverage.partialCount,
            refresh: coverage.legacyUnclassifiedCount,
            eligible: coverage.eligibleCount,
          },
        )
      : presentation.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
        ? t(
            presentation.requiresRefresh
              ? "account:todayMetricAvailability.pendingRefreshHelp"
              : "account:todayMetricAvailability.unavailable",
          )
        : undefined
  const getAggregateEmptyValueText = (
    presentation: typeof consumptionPresentation,
  ) =>
    presentation.value === null && presentation.requiresRefresh
      ? t("account:todayMetricAvailability.pendingRefresh")
      : undefined
  const getAggregateQualifier = (
    presentation: typeof consumptionPresentation,
    coverage: typeof totalConsumption.coverage,
  ) =>
    presentation.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial &&
    coverage.legacyUnclassifiedCount > 0
      ? t("account:todayMetricAvailability.includesPendingRefresh")
      : undefined

  const handleCurrencyToggle = () => {
    updateCurrencyType(getOppositeCurrency(currencyType))
  }

  return (
    <div className="space-y-density-2">
      <div className="dark:bg-card/40 bg-surface-subtle/80 space-y-density-1 rounded-lg">
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
              ? "gap-y-density-2 grid grid-cols-3 gap-x-2"
              : "gap-y-density-2 grid grid-cols-2 gap-x-2"
          }
        >
          <div className="dark:bg-card/30 bg-surface-subtle/70 space-y-density-1 py-density-2 min-w-0 rounded-md px-2">
            <Caption className="font-medium">
              {t("account:stats.todayConsumption")}
            </Caption>
            <BalanceDisplay
              value={consumptionPresentation.value}
              startValue={
                isInitialLoad ? 0 : prevTotalConsumption[currencyType]
              }
              isInitialLoad={isInitialLoad}
              currencyType={currencyType}
              onCurrencyToggle={handleCurrencyToggle}
              prefix={(consumptionPresentation.value ?? 0) > 0 ? "-" : ""}
              size="md"
              availabilityLabel={getAggregateAvailabilityLabel(
                consumptionPresentation,
                totalConsumption.coverage,
              )}
              emptyValueText={getAggregateEmptyValueText(
                consumptionPresentation,
              )}
              qualifier={getAggregateQualifier(
                consumptionPresentation,
                totalConsumption.coverage,
              )}
            />
          </div>

          <div className="dark:bg-card/30 bg-surface-subtle/70 space-y-density-1 py-density-2 min-w-0 rounded-md px-2">
            <Caption className="font-medium">
              {estimatedTodayIncomeEnabled
                ? t("account:stats.trustedTodayIncome")
                : t("account:stats.todayIncome")}
            </Caption>
            <BalanceDisplay
              value={incomePresentation.value}
              startValue={0}
              isInitialLoad={isInitialLoad}
              currencyType={currencyType}
              onCurrencyToggle={handleCurrencyToggle}
              prefix={(incomePresentation.value ?? 0) > 0 ? "+" : ""}
              size="md"
              availabilityLabel={getAggregateAvailabilityLabel(
                incomePresentation,
                totalIncome.coverage,
              )}
              emptyValueText={getAggregateEmptyValueText(incomePresentation)}
              qualifier={getAggregateQualifier(
                incomePresentation,
                totalIncome.coverage,
              )}
            />
          </div>

          {estimatedTodayIncomeEnabled && (
            <div className="dark:bg-card/30 bg-surface-subtle/70 space-y-density-1 py-density-2 min-w-0 rounded-md px-2">
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
                <div className="text-muted-foreground text-base font-bold">
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
