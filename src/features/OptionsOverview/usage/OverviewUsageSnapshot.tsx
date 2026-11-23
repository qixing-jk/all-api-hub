import type { TFunction } from "i18next"
import { BarChart3 } from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Card, WorkflowTransitionButton } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ObservationWindow } from "~/features/AccountManagement/components/ObservationWindow"
import type { OptionsOverviewUsageSnapshot } from "~/features/OptionsOverview/types"
import { getUsagePercentShare } from "~/features/OptionsOverview/usage/usageSnapshotMath"
import { OverviewMetricTile } from "~/features/OptionsOverview/workspace/OverviewMetricTile"
import {
  displayCashflowAmount,
  selectDisplayCashflowGroups,
} from "~/services/accounts/metrics/consumptionProjection"
import { FINANCIAL_COVERAGE } from "~/services/amounts/financialConstants"
import { getDisplayCurrency } from "~/services/preferences/currencyDisplay"
import type { AccountMetricCoverage } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { formatBalanceWindow } from "~/utils/core/balancePresentation"
import {
  formatTokenCount,
  getTodayMetricPresentation,
} from "~/utils/core/formatters"
import {
  formatAssetAmount,
  formatCurrencyDisplayAmount,
} from "~/utils/core/money"

interface OverviewUsageSnapshotProps {
  snapshot: OptionsOverviewUsageSnapshot
  t: TFunction
  onNavigate: (target: OptionsOverviewUsageSnapshot["target"]) => void
}

/**
 * Renders today's and recent request/token aggregates.
 */
export function OverviewUsageSnapshot({
  snapshot,
  t,
  onNavigate,
}: OverviewUsageSnapshotProps) {
  const { i18n } = useTranslation("optionsOverview")
  const { currencyType, currencyDisplay = currencyType } =
    useUserPreferencesContext()
  const displayCurrency = getDisplayCurrency(currencyDisplay, currencyType)
  const todayCostGroups = selectDisplayCashflowGroups(
    {
      groups: snapshot.todayCostGroups ?? [],
      nativeCoverage: snapshot.todayCostCoverage,
    },
    displayCurrency,
  )
  if (!snapshot.hasUsageData) {
    return (
      <Card className="overflow-hidden border-theme-100 bg-gradient-to-br from-card via-card to-theme-50/70 shadow-sm shadow-theme-100/60 dark:border-foreground/10 dark:from-card dark:via-background/90 dark:to-theme-950/10 dark:shadow-shadow/20">
        <div className="grid gap-x-5 gap-y-density-5 px-5 py-density-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 gap-x-4 gap-y-density-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-theme-100 bg-card/80 text-theme-600 shadow-sm dark:border-foreground/10 dark:bg-foreground/[0.04] dark:text-theme-300">
              <BarChart3 className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="text-base font-semibold text-foreground">
                {t("optionsOverview:usage.empty.title")}
              </div>
              <div className="mt-density-1 max-w-3xl text-sm leading-6 text-muted-foreground dark:text-secondary-foreground">
                {t("optionsOverview:usage.empty.description")}
              </div>
            </div>
          </div>

          <WorkflowTransitionButton
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={() => onNavigate(snapshot.target)}
          >
            {t("optionsOverview:actions.open")}
          </WorkflowTransitionButton>
        </div>
      </Card>
    )
  }

  const todayRequestShare = getUsagePercentShare(
    snapshot.todayRequests,
    snapshot.sevenDayRequests,
    {
      todayCoverage: snapshot.todayRequestsCoverage,
      hasTotalData: snapshot.hasSevenDayUsageData,
    },
  )
  const todayTokenShare = getUsagePercentShare(
    snapshot.todayTokens,
    snapshot.sevenDayTokens,
    {
      todayCoverage: snapshot.todayTokensCoverage,
      hasTotalData: snapshot.hasSevenDayUsageData,
    },
  )

  return (
    <Card className="overflow-hidden border-theme-100 bg-gradient-to-br from-card via-card to-theme-50/70 shadow-sm shadow-theme-100/60 dark:border-foreground/10 dark:from-card dark:via-background/90 dark:to-theme-950/10 dark:shadow-shadow/20">
      {snapshot.siteDayUsage?.length ? (
        <section
          className="space-y-2 px-5 py-density-5"
          aria-label={t("optionsOverview:usage.siteDay")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {t("optionsOverview:usage.siteDay")}
            </h3>
            {!snapshot.hasTodayUsageData && !snapshot.hasSevenDayUsageData && (
              <WorkflowTransitionButton
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onNavigate(snapshot.target)}
              >
                {t("optionsOverview:actions.open")}
              </WorkflowTransitionButton>
            )}
          </div>
          <ul className="divide-y divide-border">
            {snapshot.siteDayUsage.map(
              ({
                id,
                label,
                exchangeRate,
                lastKnown,
                reportedDay,
                observedAt,
                window,
                cost,
                costCoverage,
                requests,
                tokens,
              }) => (
                <li
                  key={id}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2 text-sm"
                >
                  <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                    {label}
                  </span>
                  {reportedDay && (
                    <span className="text-xs text-muted-foreground">
                      {reportedDay}
                    </span>
                  )}
                  {window && <ObservationWindow window={window} />}
                  {!reportedDay && !window && observedAt !== undefined && (
                    <time
                      dateTime={new Date(observedAt).toISOString()}
                      className="text-xs text-muted-foreground"
                    >
                      {new Date(observedAt).toLocaleString(
                        i18n.language === "cimode" ? "en" : i18n.language,
                      )}
                    </time>
                  )}
                  {lastKnown && (
                    <span className="text-xs text-muted-foreground">
                      {t("account:financial.lastKnown")}
                    </span>
                  )}
                  {cost && (
                    <span className="tabular-nums">
                      {formatCurrencyDisplayAmount(
                        cost,
                        i18n.language,
                        displayCurrency,
                        exchangeRate,
                      )}
                    </span>
                  )}
                  {cost && costCoverage === FINANCIAL_COVERAGE.Partial && (
                    <span className="text-xs text-muted-foreground">
                      {t("account:todayMetricAvailability.partial")}
                    </span>
                  )}
                  {requests !== undefined && (
                    <span>
                      <span className="text-muted-foreground">
                        {t("optionsOverview:usage.requests")}
                      </span>{" "}
                      <span className="tabular-nums">
                        {formatTokenCount(requests)}
                      </span>
                    </span>
                  )}
                  {tokens !== undefined && (
                    <span>
                      <span className="text-muted-foreground">
                        {t("optionsOverview:usage.tokens")}
                      </span>{" "}
                      <span className="tabular-nums">
                        {formatTokenCount(tokens)}
                      </span>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        </section>
      ) : null}
      {(snapshot.hasTodayUsageData || snapshot.hasSevenDayUsageData) && (
        <div className="grid gap-x-5 gap-y-density-5 px-5 py-density-5 lg:grid-cols-[minmax(12rem,0.85fr)_minmax(0,1.5fr)_minmax(14rem,1fr)] lg:items-stretch">
          <div className="flex min-w-0 flex-col justify-between gap-x-5 gap-y-density-5">
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase">
                {t("optionsOverview:usage.todayCost")}
              </div>
              <div className="mt-density-2 min-w-0 text-3xl leading-tight font-semibold break-words text-foreground">
                {todayCostGroups.length ? (
                  todayCostGroups.map((group, index) => (
                    <div key={index}>
                      <AvailabilityAwareValue
                        value={formatAssetAmount(
                          displayCashflowAmount(group, displayCurrency),
                          i18n.language,
                        )}
                        coverage={group.coverage}
                        t={t}
                      />
                      {formatBalanceWindow(group.window, t).map((line) => (
                        <div
                          key={line}
                          className="mt-1 text-xs font-normal text-muted-foreground"
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  ))
                ) : snapshot.todayReferenceCost === undefined ? (
                  <AvailabilityAwareValue
                    value={snapshot.todayCostText}
                    coverage={snapshot.todayCostCoverage}
                    t={t}
                  />
                ) : null}
                {snapshot.todayReferenceCost && (
                  <div>
                    <AvailabilityAwareValue
                      value={snapshot.todayReferenceCost.text}
                      coverage={snapshot.todayReferenceCost.coverage}
                      t={t}
                    />
                    <div className="mt-1 text-xs font-normal text-muted-foreground">
                      {t("usageAnalytics:summary.referenceCost")}
                      {snapshot.todayReferenceCost.coverage.status ===
                        ACCOUNT_TODAY_METRIC_STATUSES.Partial && (
                        <>
                          {" "}
                          ·{" "}
                          {t("optionsOverview:todayMetricAvailability.partial")}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <WorkflowTransitionButton
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => onNavigate(snapshot.target)}
            >
              {t("optionsOverview:actions.open")}
            </WorkflowTransitionButton>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-density-3">
            <TodayUsageMetric
              label={t("optionsOverview:usage.todayRequests")}
              value={snapshot.todayRequests}
              coverage={snapshot.todayRequestsCoverage}
              t={t}
            />
            <TodayUsageMetric
              label={t("optionsOverview:usage.todayTokens")}
              value={snapshot.todayTokens}
              coverage={snapshot.todayTokensCoverage}
              t={t}
            />
            <UsageMetric
              label={t("optionsOverview:usage.sevenDayRequests")}
              value={
                snapshot.hasSevenDayUsageData ? snapshot.sevenDayRequests : null
              }
              t={t}
            />
            <UsageMetric
              label={t("optionsOverview:usage.sevenDayTokens")}
              value={
                snapshot.hasSevenDayUsageData ? snapshot.sevenDayTokens : null
              }
              t={t}
            />
          </div>

          <div className="flex min-w-0 flex-col justify-between gap-x-4 gap-y-density-4 rounded-lg border border-theme-100/70 bg-card/65 px-4 py-density-4 dark:border-foreground/10 dark:bg-foreground/[0.03]">
            <div>
              <div className="text-sm font-semibold text-foreground dark:text-secondary-foreground">
                {t("optionsOverview:usage.activityMix")}
              </div>
              <div className="mt-density-1 text-xs leading-5 text-muted-foreground">
                {snapshot.hasSevenDayUsageData
                  ? t("optionsOverview:usage.todayShare")
                  : t("optionsOverview:usage.noRecentActivity")}
              </div>
            </div>
            <UsageShare
              label={t("optionsOverview:usage.requestShare")}
              value={todayRequestShare}
              coverage={snapshot.todayRequestsCoverage}
              t={t}
            />
            <UsageShare
              label={t("optionsOverview:usage.tokenShare")}
              value={todayTokenShare}
              coverage={snapshot.todayTokensCoverage}
              t={t}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

/** Renders one today metric while preserving its aggregate coverage state. */
function TodayUsageMetric({
  label,
  value,
  coverage,
  t,
}: {
  label: string
  value: number
  coverage: AccountMetricCoverage
  t: TFunction
}) {
  const presentation = getTodayMetricPresentation(value, coverage)

  return (
    <OverviewMetricTile
      label={label}
      value={
        <AvailabilityAwareValue
          value={
            presentation.value === null
              ? null
              : formatTokenCount(presentation.value)
          }
          coverage={coverage}
          t={t}
        />
      }
      className="border-theme-100/60 bg-card/70 px-3 py-density-3 dark:bg-foreground/[0.03]"
      labelClassName="text-muted-foreground"
      valueClassName="text-lg leading-normal text-foreground"
    />
  )
}

/** Renders a value, partial qualifier, or unavailable marker from coverage. */
function AvailabilityAwareValue({
  value,
  coverage,
  t,
}: {
  value: string | null
  coverage: AccountMetricCoverage
  t: TFunction
}) {
  if (coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable) {
    const unavailableLabel = t(
      coverage.legacyUnclassifiedCount > 0
        ? "optionsOverview:todayMetricAvailability.pendingRefreshHelp"
        : "optionsOverview:todayMetricAvailability.unavailable",
    )
    if (coverage.legacyUnclassifiedCount > 0) {
      return (
        <Tooltip
          content={unavailableLabel}
          wrapperClassName="min-w-0 justify-start"
        >
          <span
            aria-label={unavailableLabel}
            className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
          >
            <span aria-hidden="true">
              {t("optionsOverview:todayMetricAvailability.pendingRefresh")}
            </span>
          </span>
        </Tooltip>
      )
    }
    return (
      <span aria-label={unavailableLabel}>
        <span aria-hidden="true">—</span>
      </span>
    )
  }

  if (coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial) {
    const partialLabel = t("optionsOverview:todayMetricAvailability.partial")
    const qualifier =
      coverage.legacyUnclassifiedCount > 0
        ? t("optionsOverview:todayMetricAvailability.includesPendingRefresh")
        : undefined
    const coverageLabel = t(
      coverage.legacyUnclassifiedCount > 0
        ? "optionsOverview:todayMetricAvailability.coverageWithRefresh"
        : "optionsOverview:todayMetricAvailability.coverage",
      {
        complete: coverage.completeCount,
        partial: coverage.partialCount,
        refresh: coverage.legacyUnclassifiedCount,
        eligible: coverage.eligibleCount,
      },
    )
    return (
      <Tooltip content={coverageLabel} wrapperClassName="min-w-0 justify-start">
        <span
          aria-label={[value, qualifier ?? partialLabel, coverageLabel]
            .filter(Boolean)
            .join(". ")}
          className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
        >
          {value}
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">
            {qualifier ?? partialLabel}
          </span>
        </span>
      </Tooltip>
    )
  }

  return value
}

/**
 * Renders one numeric usage metric with compact formatting.
 */
function UsageMetric({
  label,
  value,
  t,
}: {
  label: string
  value: number | null
  t: TFunction
}) {
  return (
    <OverviewMetricTile
      label={label}
      value={
        value === null ? (
          <span className="text-sm font-normal text-muted-foreground">
            {t("optionsOverview:todayMetricAvailability.unavailable")}
          </span>
        ) : (
          formatTokenCount(value)
        )
      }
      className="border-theme-100/60 bg-card/70 px-3 py-density-3 dark:bg-foreground/[0.03]"
      labelClassName="text-muted-foreground"
      valueClassName="text-base leading-normal text-secondary-foreground"
    />
  )
}

/**
 * Renders a bounded today-vs-7-day share indicator.
 */
function UsageShare({
  label,
  value,
  coverage,
  t,
}: {
  label: string
  value: number | null
  coverage: AccountMetricCoverage
  t: TFunction
}) {
  const pendingRefreshLabel = t(
    "optionsOverview:todayMetricAvailability.pendingRefresh",
  )
  const unavailableLabel = t(
    coverage.legacyUnclassifiedCount > 0
      ? "optionsOverview:todayMetricAvailability.pendingRefreshHelp"
      : "optionsOverview:todayMetricAvailability.unavailable",
  )
  const unavailableValue = (
    <span
      aria-label={
        coverage.legacyUnclassifiedCount > 0
          ? pendingRefreshLabel
          : unavailableLabel
      }
      className={
        coverage.legacyUnclassifiedCount > 0
          ? "cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          : undefined
      }
      tabIndex={coverage.legacyUnclassifiedCount > 0 ? 0 : undefined}
    >
      <span aria-hidden="true">
        {coverage.legacyUnclassifiedCount > 0 ? pendingRefreshLabel : "—"}
      </span>
    </span>
  )
  const formattedValue = value === null ? undefined : `${value}%`
  const isLegacyPartial =
    value !== null &&
    coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial &&
    coverage.legacyUnclassifiedCount > 0
  const qualifier = isLegacyPartial
    ? t("optionsOverview:todayMetricAvailability.includesPendingRefresh")
    : undefined
  const coverageLabel = isLegacyPartial
    ? t("optionsOverview:todayMetricAvailability.coverageWithRefresh", {
        complete: coverage.completeCount,
        partial: coverage.partialCount,
        refresh: coverage.legacyUnclassifiedCount,
        eligible: coverage.eligibleCount,
      })
    : undefined
  const availableValue =
    formattedValue && qualifier && coverageLabel ? (
      <Tooltip content={coverageLabel} anchorAsChild>
        <span
          aria-label={`${formattedValue}. ${qualifier}`}
          className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
        >
          <span aria-hidden="true">{formattedValue}</span>{" "}
          <span
            aria-hidden="true"
            className="text-3xs font-medium text-muted-foreground"
          >
            {qualifier}
          </span>
        </span>
      </Tooltip>
    ) : (
      formattedValue
    )
  return (
    <div className="space-y-density-2">
      <div className="flex items-center justify-between gap-x-3 gap-y-density-3">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-semibold text-secondary-foreground">
          {value === null ? (
            coverage.legacyUnclassifiedCount > 0 ? (
              <Tooltip content={unavailableLabel} anchorAsChild>
                {unavailableValue}
              </Tooltip>
            ) : (
              unavailableValue
            )
          ) : (
            availableValue
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-theme-100 dark:bg-foreground/10">
        {value === null ? null : (
          <div
            className="h-full rounded-full bg-theme-500"
            style={{ width: `${value}%` }}
          />
        )}
      </div>
    </div>
  )
}
