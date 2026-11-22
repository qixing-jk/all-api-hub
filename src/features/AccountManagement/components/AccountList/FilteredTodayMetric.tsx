import type { TFunction } from "i18next"
import { Info } from "lucide-react"

import Tooltip from "~/components/Tooltip"
import { CURRENCIES } from "~/constants/money"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  displayCashflowAmount,
  getReferenceCashflowTotal,
  selectDisplayCashflowGroups,
  type ConsumptionProjection,
} from "~/services/accounts/metrics/consumptionProjection"
import { getDisplayCurrency } from "~/services/preferences/currencyDisplay"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { formatBalanceWindow } from "~/utils/core/balancePresentation"
import { formatAssetAmount, formatCompactAssetAmount } from "~/utils/core/money"

import { formatAccountMetricCoverage } from "../accountMetricCoverage"

const COMPACT_GROUP_LIMIT = 2

/** Filtered totals retain each native asset, interval, and coverage qualifier. */
export function FilteredTodayMetric({
  total,
  t,
  compact = false,
}: {
  total: ConsumptionProjection
  t: TFunction
  compact?: boolean
}) {
  const { currencyType, currencyDisplay = currencyType } =
    useUserPreferencesContext()
  const displayCurrency = getDisplayCurrency(currencyDisplay, currencyType)
  const reference = getReferenceCashflowTotal(
    total,
    displayCurrency ?? CURRENCIES.USD,
  )
  const groups = selectDisplayCashflowGroups(total, displayCurrency)
  if (groups.length || reference) {
    const nativeCoverageLabel = t(
      total.nativeCoverage.legacyUnclassifiedCount
        ? "account:todayMetricAvailability.includesPendingRefresh"
        : "shareSnapshots:financial.partial",
    )
    return (
      <span
        className={
          compact
            ? "inline-flex flex-col gap-1 [@container(min-width:56rem)]:flex-row [@container(min-width:56rem)]:flex-wrap [@container(min-width:56rem)]:items-center [@container(min-width:56rem)]:gap-2"
            : "inline-flex flex-wrap gap-x-2 gap-y-1"
        }
      >
        {(compact ? groups.slice(0, COMPACT_GROUP_LIMIT) : groups).map(
          (group, index) => {
            const amount = formatCompactAssetAmount(
              displayCashflowAmount(group, displayCurrency),
            )
            const partial =
              group.coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial
            const pending = group.coverage.legacyUnclassifiedCount > 0
            const qualifier = pending
              ? t("account:todayMetricAvailability.includesPendingRefresh")
              : partial
                ? t("account:todayMetricAvailability.partial")
                : ""
            const coverage = formatAccountMetricCoverage(
              group.coverage,
              t,
              pending,
            )
            const help = [
              formatAssetAmount(group.amount),
              ...formatBalanceWindow(group.window, t),
              ...(partial ? [coverage] : []),
            ].join(" · ")
            return (
              <Tooltip key={index} content={help} anchorAsChild>
                <span
                  tabIndex={0}
                  aria-label={qualifier ? `${amount}. ${qualifier}` : undefined}
                  className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>{amount}</span>
                  {!compact && partial && (
                    <span> · {pending ? qualifier : coverage}</span>
                  )}
                </span>
              </Tooltip>
            )
          },
        )}
        {reference && (
          <Tooltip content={t("account:financial.legacy")} anchorAsChild>
            <span
              tabIndex={0}
              className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{formatCompactAssetAmount(reference)}</span>
              {" · "}
              <span>{t("balanceHistory:breakdown.controls.reference")}</span>
            </span>
          </Tooltip>
        )}
        {compact &&
          groups.length > 0 &&
          (total.nativeCoverage.status !==
            ACCOUNT_TODAY_METRIC_STATUSES.Complete ||
            groups.length > COMPACT_GROUP_LIMIT) && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
              {total.nativeCoverage.status !==
                ACCOUNT_TODAY_METRIC_STATUSES.Complete && (
                <Tooltip
                  anchorAsChild
                  openOnClick
                  content={formatAccountMetricCoverage(total.nativeCoverage, t)}
                >
                  <span
                    tabIndex={0}
                    className="inline-flex cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={nativeCoverageLabel}
                  >
                    <span className="[@container(min-width:56rem)]:sr-only">
                      {nativeCoverageLabel}
                    </span>
                    <Info
                      aria-hidden="true"
                      className="hidden size-3.5 [@container(min-width:56rem)]:block"
                    />
                  </span>
                </Tooltip>
              )}
              {groups.length > COMPACT_GROUP_LIMIT &&
                ` +${groups.length - COMPACT_GROUP_LIMIT}`}
            </span>
          )}
      </span>
    )
  }
  const pending = total.nativeCoverage.legacyUnclassifiedCount > 0
  const visibleLabel = t(
    pending
      ? "account:todayMetricAvailability.pendingRefresh"
      : "account:todayMetricAvailability.unavailable",
  )
  const value = (
    <span
      aria-label={pending ? visibleLabel : undefined}
      tabIndex={pending ? 0 : undefined}
      className={
        pending
          ? "cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          : undefined
      }
    >
      <span aria-hidden="true">{pending ? visibleLabel : "—"}</span>
      {!pending && <span className="sr-only">{visibleLabel}</span>}
    </span>
  )
  return pending ? (
    <Tooltip
      content={t("account:todayMetricAvailability.pendingRefreshHelp")}
      anchorAsChild
    >
      {value}
    </Tooltip>
  ) : (
    value
  )
}
