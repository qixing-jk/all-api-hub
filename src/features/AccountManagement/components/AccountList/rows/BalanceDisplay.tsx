import { History } from "lucide-react"
import React, { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  FinancialMetricIcon,
  type FinancialMetricKind,
} from "~/components/FinancialMetricLabel"
import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import {
  ACCOUNT_CASHFLOW_METRICS,
  ACCOUNT_USAGE_SCOPES,
  type AccountCashflowMetric,
} from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useAccountActionsContext } from "~/features/AccountManagement/actions/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import CountUp from "~/lib/countup"
import { getSiteDayReadings } from "~/services/accounts/metrics/accountTodayStats"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
  selectDisplayCashflow,
  type ReferenceCashflow,
} from "~/services/accounts/metrics/consumptionProjection"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import type { Amount } from "~/services/amounts/balance"
import { parseDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import { getDisplayCurrency } from "~/services/preferences/currencyDisplay"
import { ACCOUNT_SUBSCRIPTION_STATUSES as subscriptionStatuses } from "~/types"
import type { CurrencyType, DisplaySiteData } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import {
  getCurrencySymbol,
  getTodayMetricPresentation,
} from "~/utils/core/formatters"
import {
  convertCurrencyAmount,
  formatBalanceAmount,
  formatCompactAssetAmount,
  getDisplayMoneyValue,
  MONEY_DECIMAL_PLACES,
} from "~/utils/core/money"

import { AccountConsumptionDetails } from "./AccountConsumptionDetails"
import { FinancialBalanceDisplay } from "./FinancialBalanceDisplay"

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)

const BALANCE_REFRESH_TARGETS = {
  BALANCE: "balance",
  CASHFLOW: "cashflow",
  INCOME: "income",
  NET_INFLOW: "net_inflow",
} as const

type BalanceRefreshTarget =
  (typeof BALANCE_REFRESH_TARGETS)[keyof typeof BALANCE_REFRESH_TARGETS]

interface BalanceDisplayProps {
  site: DisplaySiteData
}

// Reusable component for displaying monetary values with animation
const AnimatedValue: React.FC<{
  value: number | null
  displayAmount?: Amount
  currency: CurrencyType
  startValue: number
  cashflow: AccountCashflowMetric
  suffix?: string
  className?: string
  title?: string
  onClick?: () => void
  isRefreshing?: boolean
  loading?: boolean
  disabled?: boolean
  availabilityLabel?: string
  emptyContent?: React.ReactNode
  metric?: FinancialMetricKind
}> = React.memo(
  ({
    value,
    displayAmount,
    currency,
    startValue,
    cashflow,
    suffix = "",
    className = "",
    title,
    onClick,
    isRefreshing = false,
    loading = false,
    disabled = false,
    availabilityLabel,
    emptyContent,
    metric,
  }) => {
    const { i18n } = useTranslation("account")
    const { isInitialLoad } = useAccountDataContext()
    const hasCommittedRef = useRef(false)

    useEffect(() => {
      hasCommittedRef.current = true
    }, [])

    const negativeAmount = displayAmount
      ? displayAmount.value.startsWith("-")
      : (value ?? 0) < 0
    const negativeCashflow =
      cashflow === ACCOUNT_CASHFLOW_METRICS.Consumption
        ? !negativeAmount
        : negativeAmount
    const prefix = negativeCashflow ? "-" : "+"
    const cashflowClassName =
      value === null || value === 0
        ? "text-faint-foreground hover:text-faint-foreground dark:text-muted-foreground dark:hover:text-muted-foreground"
        : negativeCashflow
          ? "text-cashflow-expense hover:text-cashflow-expense"
          : "text-cashflow-income hover:text-cashflow-income"
    const displayEndValue =
      value === null ? null : getDisplayMoneyValue(Math.abs(value))
    const displayStartValue = isInitialLoad
      ? 0
      : getDisplayMoneyValue(startValue)
    const shouldAnimate = hasCommittedRef.current
    const currencySymbol = getCurrencySymbol(currency)
    const subcentAmount =
      value !== null && Math.abs(value) > 0 && Math.abs(value) < 0.01
        ? parseDecimal(Math.abs(value))
        : undefined
    const formattedAmount = displayAmount
      ? formatBalanceAmount(
          { ...displayAmount, value: displayAmount.value.replace(/^-/, "") },
          i18n.language,
        )
      : subcentAmount
        ? formatBalanceAmount(
            {
              asset: { kind: ASSET_KINDS.Currency, code: currency },
              value: subcentAmount,
            },
            i18n.language,
          )
        : undefined
    const displayValueAccessibilityLabel =
      displayEndValue === null
        ? undefined
        : `${prefix}${formattedAmount ?? `${currencySymbol}${displayEndValue.toFixed(MONEY_DECIMAL_PLACES)}`}${suffix}`
    const content =
      displayEndValue === null ? (
        <span aria-hidden="true">{emptyContent ?? "—"}</span>
      ) : formattedAmount ? (
        <>
          {prefix}
          {formattedAmount}
          {suffix && <span className="sr-only">{suffix}</span>}
        </>
      ) : (
        <>
          {prefix}
          {currencySymbol}
          {shouldAnimate ? (
            <CountUp
              start={displayStartValue}
              end={displayEndValue}
              duration={isInitialLoad ? 1.0 : 0.6}
              decimals={MONEY_DECIMAL_PLACES}
              preserveValue
            />
          ) : (
            displayEndValue.toFixed(MONEY_DECIMAL_PLACES)
          )}
          {suffix && <span className="sr-only">{suffix}</span>}
        </>
      )

    const statusAccessibleName = availabilityLabel
      ? [displayValueAccessibilityLabel, availabilityLabel]
          .filter(Boolean)
          .join(". ")
      : undefined
    const accessibleName = statusAccessibleName
      ? [title, statusAccessibleName].filter(Boolean).join(". ")
      : title
    const shouldShowAvailabilityTooltip =
      Boolean(availabilityLabel) &&
      (Boolean(onClick) ||
        displayEndValue !== null ||
        emptyContent !== undefined)
    const withAvailabilityTooltip = (element: React.ReactElement) =>
      shouldShowAvailabilityTooltip ? (
        <Tooltip
          content={[title, suffix, availabilityLabel]
            .filter(Boolean)
            .join(". ")}
          className="shadow-none"
          wrapperClassName="ml-auto min-w-0 max-w-full"
        >
          {element}
        </Tooltip>
      ) : (
        element
      )

    if (onClick) {
      const button = (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={loading}
          disabled={disabled}
          className={`ml-auto h-auto min-h-0 max-w-full min-w-0 shrink justify-end gap-x-1 truncate bg-transparent px-0 py-0 text-right transition-opacity duration-200 hover:bg-transparent has-[>svg]:px-0 dark:hover:bg-transparent ${
            isRefreshing
              ? "animate-pulse opacity-60"
              : "cursor-pointer hover:opacity-80"
          } ${className} ${cashflowClassName}`}
          onClick={onClick}
          title={shouldShowAvailabilityTooltip ? undefined : title}
          aria-label={accessibleName}
        >
          {suffix ? (
            <History role="img" aria-label={suffix} className="size-3" />
          ) : (
            metric && <FinancialMetricIcon kind={metric} className="size-3" />
          )}
          {content}
        </Button>
      )

      return withAvailabilityTooltip(button)
    }

    const staticValue = (
      <div
        className={`ml-auto max-w-full truncate text-right transition-all duration-200 ${
          isRefreshing ? "animate-pulse opacity-60" : ""
        } ${
          shouldShowAvailabilityTooltip
            ? "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            : ""
        } ${className} ${cashflowClassName}`}
        title={shouldShowAvailabilityTooltip ? undefined : title}
        aria-label={statusAccessibleName}
        tabIndex={shouldShowAvailabilityTooltip ? 0 : undefined}
      >
        {suffix ? (
          <History
            role="img"
            aria-label={suffix}
            className="mr-1 inline-block size-3 align-middle"
          />
        ) : (
          metric && (
            <FinancialMetricIcon
              kind={metric}
              className="mr-1 inline-block size-3 align-middle"
            />
          )
        )}
        {content}
      </div>
    )

    return withAvailabilityTooltip(staticValue)
  },
)

const BalanceDisplay: React.FC<BalanceDisplayProps> = React.memo(({ site }) => {
  const { t, i18n } = useTranslation("account")
  const {
    currencyType,
    currencyDisplay = currencyType,
    showTodayCashflow,
    preferences,
  } = useUserPreferencesContext()
  const displayCurrency = getDisplayCurrency(currencyDisplay, currencyType)
  const referenceCurrency = displayCurrency ?? CURRENCIES.USD
  const { handleRefreshAccount, refreshingAccountId } =
    useAccountActionsContext()
  const [activeRefreshTarget, setActiveRefreshTarget] =
    useState<BalanceRefreshTarget | null>(null)

  const isRefreshing = refreshingAccountId === site.id
  const isAccountDisabled = site.disabled === true
  const subscriptionStatus =
    site.subscription?.status ??
    (site.subscription?.isActive === false
      ? subscriptionStatuses.Inactive
      : undefined)
  const subscriptionStatusLabel =
    subscriptionStatus === subscriptionStatuses.Active
      ? t("stats.subscriptionState.active")
      : subscriptionStatus === subscriptionStatuses.Grace
        ? t("stats.subscriptionState.grace")
        : subscriptionStatus === subscriptionStatuses.Expired
          ? t("stats.subscriptionState.expired")
          : subscriptionStatus === subscriptionStatuses.Unavailable
            ? t("stats.subscriptionState.unavailable")
            : subscriptionStatus === subscriptionStatuses.Inactive
              ? t("stats.subscriptionState.inactive")
              : undefined
  const savedAllowance =
    !site.allowances?.entries.length &&
    (subscriptionStatus === subscriptionStatuses.Active ||
      subscriptionStatus === subscriptionStatuses.Grace ||
      (!subscriptionStatus && site.subscription?.isActive === true)) &&
    !(
      site.subscription?.expireTime &&
      Date.parse(site.subscription.expireTime) <= Date.now()
    )
      ? site.subscription
      : undefined
  const remainingTokens = savedAllowance?.remainingTokens
  const remainingCount = savedAllowance?.remainingCount
  const hasRemainingTokens =
    remainingTokens !== undefined &&
    Number.isFinite(remainingTokens) &&
    remainingTokens >= 0
  const hasRemainingCount =
    remainingCount !== undefined &&
    Number.isFinite(remainingCount) &&
    remainingCount >= 0
  const siteDayReadings = getSiteDayReadings(site)
  const siteDayReading = siteDayReadings[0]
  const siteDay = siteDayReading?.usage
  const showGenericUsageCounters =
    !siteDay ||
    (site.usage?.scope !== ACCOUNT_USAGE_SCOPES.SiteToday &&
      site.usage?.scope !== ACCOUNT_USAGE_SCOPES.Today)
  const formatDayCost = (dayCost: NonNullable<typeof siteDay>["cost"]) =>
    dayCost &&
    dayCost.asset.kind !== ASSET_KINDS.Unknown &&
    isKnownOrStaleObservation(dayCost.amount)
      ? formatCompactAssetAmount(
          convertCurrencyAmount(
            {
              asset: dayCost.asset,
              value: dayCost.amount.value,
            },
            displayCurrency,
            site.exchangeRate,
          ),
        )
      : undefined
  const estimate = preferences?.balanceHistory?.estimatedTodayIncome?.enabled
    ? site.estimatedTodayIncome?.[displayCurrency ?? CURRENCIES.USD]
    : undefined
  const asOf = Date.now()
  const consumption = getDisplayConsumptionProjection(
    [{ ...site, disabled: false }],
    asOf,
  )
  const displayedConsumption = selectDisplayCashflow(
    consumption,
    displayCurrency,
    site.exchangeRate,
  )
  const consumptionPresentation = getTodayMetricPresentation(
    displayedConsumption.value,
    !site.settledConsumption?.length &&
      site.todayStatsAvailability.consumption.status ===
        ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
      ? site.todayStatsAvailability.consumption
      : displayedConsumption.coverage,
  )
  const income = getDisplayIncomeProjection(
    [{ ...site, disabled: false, excludeFromTodayIncome: false }],
    asOf,
  )
  const displayedIncome = selectDisplayCashflow(
    income,
    displayCurrency,
    site.exchangeRate,
  )
  const incomePresentation = getTodayMetricPresentation(
    displayedIncome.value,
    !site.reportedIncome?.length &&
      site.todayStatsAvailability.income.status ===
        ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
      ? site.todayStatsAvailability.income
      : displayedIncome.coverage,
  )
  const consumptionReference = site.referenceConsumption
  const incomeReference = site.referenceIncome
  const consumptionValue =
    consumptionReference?.amount[referenceCurrency] ??
    consumptionPresentation.value
  const incomeValue =
    incomeReference?.amount[referenceCurrency] ?? incomePresentation.value
  const referenceSuffix = (reference?: ReferenceCashflow) =>
    reference
      ? ` · ${t("balanceHistory:breakdown.controls.reference")}${reference.lastKnown ? ` · ${t("financial.lastKnown")}` : ""}`
      : undefined
  const referenceHelp = (reference?: ReferenceCashflow) =>
    reference
      ? [
          t("financial.legacy"),
          reference.observedAt !== undefined
            ? new Date(reference.observedAt).toLocaleString()
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : undefined
  const availabilityLabel = (presentation: typeof consumptionPresentation) =>
    presentation.requiresRefresh
      ? t(
          isAccountDisabled
            ? "todayMetricAvailability.pendingRefreshHelp"
            : "todayMetricAvailability.refreshActionHelp",
        )
      : presentation.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial
        ? t("todayMetricAvailability.partial")
        : presentation.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
          ? t("todayMetricAvailability.unavailable")
          : undefined
  const recoveryContent = (presentation: typeof consumptionPresentation) =>
    presentation.requiresRefresh
      ? t(
          isAccountDisabled
            ? "todayMetricAvailability.pendingRefresh"
            : "todayMetricAvailability.clickToRefresh",
        )
      : undefined

  const isRefreshLocked = isRefreshing || activeRefreshTarget !== null

  const handleRefreshClick = async (target: BalanceRefreshTarget) => {
    if (isAccountDisabled || isRefreshLocked) return

    setActiveRefreshTarget(target)
    try {
      await handleRefreshAccount(site, true) // Force refresh
    } finally {
      setActiveRefreshTarget(null)
    }
  }

  const refreshMetric = (target: BalanceRefreshTarget) => {
    void handleRefreshClick(target).catch(() => undefined)
  }

  const showSiteDayStats = siteDayReadings.some(
    ({ usage }) =>
      (showTodayCashflow && formatDayCost(usage.cost)) ||
      usage.totalRequests !== undefined ||
      usage.totalTokens !== undefined,
  )
  const showAccountUsageSummary = Boolean(
    site.subscription?.name ||
    subscriptionStatusLabel ||
    (showGenericUsageCounters &&
      (typeof site.usage?.totalRequests === "number" ||
        typeof site.usage?.totalTokens === "number")) ||
    hasRemainingTokens ||
    hasRemainingCount,
  )

  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)_0.75rem_1.25rem] items-start gap-x-1 gap-y-0.5 overflow-hidden text-right @max-sm/account-row:contents">
      <FinancialBalanceDisplay
        currencyType={displayCurrency}
        exchangeRate={site.exchangeRate}
        snapshot={site.balanceSnapshot}
        manual={site.manualBalanceSnapshot}
        allowances={site.allowances}
        disabled={isAccountDisabled}
        refreshing={isRefreshLocked}
        busy={activeRefreshTarget === BALANCE_REFRESH_TARGETS.BALANCE}
        onRefresh={() => refreshMetric(BALANCE_REFRESH_TARGETS.BALANCE)}
        usageDetails={
          site.usage?.cost ||
          site.usageObservations?.some((usage) => usage.cost) ||
          site.settledConsumption?.length ||
          site.reportedIncome?.length ||
          site.referenceConsumption ||
          site.referenceIncome ? (
            <AccountConsumptionDetails site={site} />
          ) : undefined
        }
      />

      {(showTodayCashflow || showAccountUsageSummary || showSiteDayStats) && (
        <div className="contents @max-sm/account-row:col-span-2 @max-sm/account-row:col-start-2 @max-sm/account-row:row-start-3 @max-sm/account-row:grid @max-sm/account-row:grid-cols-1 @max-sm/account-row:items-start @max-sm/account-row:gap-y-0.5 @max-sm/account-row:border-t @max-sm/account-row:border-border/50 @max-sm/account-row:pt-1 @max-sm/account-row:[&_.text-3xs]:text-xs">
          {/* Today's Statistics */}
          {showTodayCashflow && (
            <div className="col-start-1 flex max-w-full flex-wrap justify-end gap-x-1.5 gap-y-0.5 justify-self-end">
              {/* Consumption */}
              <AnimatedValue
                value={consumptionValue}
                displayAmount={
                  consumptionReference
                    ? undefined
                    : displayedConsumption.displayAmount
                }
                currency={
                  consumptionReference
                    ? referenceCurrency
                    : displayedConsumption.currency
                }
                startValue={0}
                cashflow={ACCOUNT_CASHFLOW_METRICS.Consumption}
                suffix={referenceSuffix(consumptionReference)}
                metric={consumptionValue === null ? undefined : "consumption"}
                className="text-3xs sm:text-xs"
                title={
                  isAccountDisabled
                    ? t("list.site.disabled")
                    : t("list.balance.refreshCashflow")
                }
                onClick={
                  isAccountDisabled
                    ? undefined
                    : () => refreshMetric(BALANCE_REFRESH_TARGETS.CASHFLOW)
                }
                isRefreshing={isRefreshing}
                loading={
                  activeRefreshTarget === BALANCE_REFRESH_TARGETS.CASHFLOW
                }
                disabled={isRefreshLocked}
                availabilityLabel={
                  referenceHelp(consumptionReference) ??
                  availabilityLabel(consumptionPresentation)
                }
                emptyContent={recoveryContent(consumptionPresentation)}
              />

              {/* Income */}
              <AnimatedValue
                value={incomeValue}
                displayAmount={
                  incomeReference ? undefined : displayedIncome.displayAmount
                }
                currency={
                  incomeReference ? referenceCurrency : displayedIncome.currency
                }
                startValue={0}
                cashflow={ACCOUNT_CASHFLOW_METRICS.Income}
                suffix={referenceSuffix(incomeReference)}
                metric={incomeValue === null ? undefined : "income"}
                className="text-3xs sm:text-xs"
                title={
                  isAccountDisabled
                    ? t("list.site.disabled")
                    : t("list.balance.refreshIncome")
                }
                onClick={
                  isAccountDisabled
                    ? undefined
                    : () => refreshMetric(BALANCE_REFRESH_TARGETS.INCOME)
                }
                isRefreshing={isRefreshing}
                loading={activeRefreshTarget === BALANCE_REFRESH_TARGETS.INCOME}
                disabled={isRefreshLocked}
                availabilityLabel={
                  referenceHelp(incomeReference) ??
                  availabilityLabel(incomePresentation)
                }
                emptyContent={recoveryContent(incomePresentation)}
              />

              {typeof estimate === "number" && (
                <span
                  className="text-xs text-muted-foreground"
                  title={t("stats.estimatedTodayIncome")}
                >
                  ~
                  {formatBalanceAmount(
                    {
                      asset: {
                        kind: "currency",
                        code: displayCurrency ?? CURRENCIES.USD,
                      },
                      value: String(estimate),
                    },
                    i18n.language,
                  )}
                </span>
              )}
            </div>
          )}

          {showAccountUsageSummary && (
            <div className="col-start-1 mt-0.5 flex max-w-full flex-wrap justify-end gap-x-1.5 gap-y-0.5 justify-self-end text-3xs text-muted-foreground sm:text-xs">
              {site.subscription?.name && (
                <span
                  className="max-w-full truncate"
                  title={t("stats.subscriptionTitle")}
                >
                  {site.subscription.name}
                </span>
              )}
              {subscriptionStatusLabel && (
                <span
                  className={`min-w-0 break-words whitespace-normal ${subscriptionStatus === subscriptionStatuses.Active ? "text-muted-foreground" : "text-warning-text"}`}
                  title={t("stats.subscriptionStatus")}
                >
                  {subscriptionStatusLabel}
                </span>
              )}
              {showGenericUsageCounters &&
                typeof site.usage?.totalRequests === "number" && (
                  <span title={t("stats.usageRequests")}>
                    {formatCompactNumber(site.usage.totalRequests)}
                  </span>
                )}
              {showGenericUsageCounters &&
                typeof site.usage?.totalTokens === "number" && (
                  <span title={t("stats.usageTokens")}>
                    {formatCompactNumber(site.usage.totalTokens)}
                  </span>
                )}
              {(hasRemainingTokens || hasRemainingCount) && (
                <span className="inline-flex flex-wrap justify-end gap-x-1">
                  <span>{t("financial.lastKnown")}</span>
                  {hasRemainingTokens && (
                    <span title={t("stats.subscriptionRemainingTokens")}>
                      {formatCompactNumber(remainingTokens)}{" "}
                      {t("stats.tokenCredit")}
                    </span>
                  )}
                  {hasRemainingCount && (
                    <span title={t("stats.subscriptionRemainingCount")}>
                      {formatCompactNumber(remainingCount)}
                    </span>
                  )}
                </span>
              )}
            </div>
          )}
          {showSiteDayStats &&
            siteDayReadings.map((siteDayReading, index) => {
              const siteDay = siteDayReading.usage
              const displayDayCost = formatDayCost(siteDay.cost)
              return (
                <div
                  key={index}
                  role="group"
                  aria-label={t("account:financial.siteDay")}
                  className="col-start-1 flex flex-wrap justify-end gap-x-1.5 text-3xs text-muted-foreground sm:text-xs"
                >
                  <span>
                    {siteDay.reportedDay ?? t("account:financial.siteDay")}
                  </span>
                  {siteDayReading?.lastKnown && (
                    <span>{t("financial.lastKnown")}</span>
                  )}
                  {siteDayReading?.lastKnown &&
                    siteDayReading.observedAt !== undefined && (
                      <time
                        dateTime={new Date(
                          siteDayReading.observedAt,
                        ).toISOString()}
                        title={new Date(
                          siteDayReading.observedAt,
                        ).toLocaleString()}
                      >
                        {formatLocalDayKey(new Date(siteDayReading.observedAt))}
                      </time>
                    )}
                  {showTodayCashflow && displayDayCost && (
                    <span className="text-cashflow-expense">
                      {displayDayCost}
                    </span>
                  )}
                  {showTodayCashflow &&
                    displayDayCost &&
                    siteDay.cost?.coverage === FINANCIAL_COVERAGE.Partial && (
                      <span title={t("todayMetricAvailability.partial")}>
                        {t("keyManagement:financial.partial")}
                      </span>
                    )}
                  {siteDay.totalRequests !== undefined && (
                    <span title={t("stats.usageRequests")}>
                      {formatCompactNumber(siteDay.totalRequests)}
                    </span>
                  )}
                  {siteDay.totalTokens !== undefined && (
                    <span title={t("stats.usageTokens")}>
                      {formatCompactNumber(siteDay.totalTokens)}
                    </span>
                  )}
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
})

export default BalanceDisplay
