import type { TFunction } from "i18next"

import Tooltip from "~/components/Tooltip"
import type { CurrencyMetricTotal } from "~/types"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { getTodayMetricPresentation } from "~/utils/core/formatters"
import { formatMoneyFixed } from "~/utils/core/money"

/** Renders a filtered today metric without leaking unavailable placeholders. */
export function FilteredTodayMetric({
  total,
  t,
}: {
  total: CurrencyMetricTotal
  t: TFunction
}) {
  const presentation = getTodayMetricPresentation(
    total.amount.USD,
    total.coverage,
  )

  if (presentation.value === null) {
    const visibleLabel = t(
      presentation.requiresRefresh
        ? "account:todayMetricAvailability.pendingRefresh"
        : "account:todayMetricAvailability.unavailable",
    )
    const helpLabel = t(
      presentation.requiresRefresh
        ? "account:todayMetricAvailability.pendingRefreshHelp"
        : "account:todayMetricAvailability.unavailable",
    )
    const value = (
      <span
        aria-label={presentation.requiresRefresh ? visibleLabel : undefined}
        className={
          presentation.requiresRefresh
            ? "focus-visible:ring-ring cursor-help rounded-sm outline-none focus-visible:ring-2"
            : undefined
        }
        tabIndex={presentation.requiresRefresh ? 0 : undefined}
      >
        <span aria-hidden="true">
          {presentation.requiresRefresh ? visibleLabel : "—"}
        </span>
        {!presentation.requiresRefresh && (
          <span className="sr-only">{visibleLabel}</span>
        )}
      </span>
    )

    return presentation.requiresRefresh ? (
      <Tooltip content={helpLabel} anchorAsChild>
        {value}
      </Tooltip>
    ) : (
      value
    )
  }

  const formattedValue = `USD ${formatMoneyFixed(total.amount.USD)} / CNY ${formatMoneyFixed(total.amount.CNY)}`

  if (
    presentation.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial &&
    total.coverage.legacyUnclassifiedCount > 0
  ) {
    const qualifier = t(
      "account:todayMetricAvailability.includesPendingRefresh",
    )
    const coverageLabel = t(
      "account:todayMetricAvailability.coverageWithRefresh",
      {
        complete: total.coverage.completeCount,
        partial: total.coverage.partialCount,
        refresh: total.coverage.legacyUnclassifiedCount,
        eligible: total.coverage.eligibleCount,
      },
    )

    return (
      <Tooltip content={coverageLabel} anchorAsChild>
        <span
          aria-label={`${formattedValue}. ${qualifier}`}
          className="focus-visible:ring-ring cursor-help rounded-sm outline-none focus-visible:ring-2"
          tabIndex={0}
        >
          <span aria-hidden="true">{formattedValue}</span>{" "}
          <span
            aria-hidden="true"
            className="text-muted-foreground text-[10px]"
          >
            {qualifier}
          </span>
        </span>
      </Tooltip>
    )
  }

  return (
    <>
      {formattedValue}
      {presentation.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial ? (
        <>
          {" · "}
          <span>
            {t("account:todayMetricAvailability.coverage", {
              complete: total.coverage.completeCount,
              partial: total.coverage.partialCount,
              refresh: total.coverage.legacyUnclassifiedCount,
              eligible: total.coverage.eligibleCount,
            })}
          </span>
        </>
      ) : null}
    </>
  )
}
