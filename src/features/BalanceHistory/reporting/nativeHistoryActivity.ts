import type { TFunction } from "i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { sumDecimals } from "~/services/amounts/decimal"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"
import type { buildFinancialHistoryActivity } from "~/services/history/dailyBalanceHistory/activity"
import { FINANCIAL_HISTORY_ACTIVITY_KINDS } from "~/services/history/dailyBalanceHistory/constants"
import {
  NET_INFLOW_STATUSES,
  type NetInflowResult,
} from "~/services/history/dailyBalanceHistory/netInflow"
import type { FinancialHistorySeries } from "~/services/history/dailyBalanceHistory/selectors"
import { getDayKeyFromUnixSeconds } from "~/utils/core/dayKey"

import type { getFinancialHistoryPresentation } from "./financialHistoryPresentation"
import {
  financialHistoryComparisonKey,
  haveIndependentHistoryScopes,
} from "./financialHistorySelection"

type RecordedActivity = ReturnType<typeof buildFinancialHistoryActivity>[number]
type Activity = Omit<RecordedActivity, "kind"> & {
  kind:
    RecordedActivity["kind"] | typeof FINANCIAL_HISTORY_ACTIVITY_KINDS.Estimate
  seriesKey?: string
  partial?: boolean
}

/** Attribute each observed change to its closing date, separately from recorded cashflow. */
export function buildNativeHistoryEstimates(
  series: FinancialHistorySeries[],
  dayKeys: string[],
): Activity[] {
  const days = new Set(dayKeys)
  return series.flatMap((item) => {
    const byDay = new Map<
      string,
      Map<
        number,
        Extract<
          NetInflowResult,
          { status: typeof NET_INFLOW_STATUSES.Available }
        >
      >
    >()
    for (const { netInflow } of item.observations) {
      if (netInflow?.status !== NET_INFLOW_STATUSES.Available) continue
      const day = getDayKeyFromUnixSeconds(netInflow.window.end / 1000)
      if (!days.has(day)) continue
      const values = byDay.get(day) ?? new Map()
      const prior = values.get(netInflow.window.start)
      if (!prior || prior.window.end <= netInflow.window.end) {
        values.set(netInflow.window.start, netInflow)
      }
      byDay.set(day, values)
    }
    if (!byDay.size) return []
    const observations = [...byDay.values()].flatMap((values) => [
      ...values.values(),
    ])
    const total = sumAmounts(observations.map(({ amount }) => amount.value))
    if (total === null) return []
    return [
      {
        key: JSON.stringify([
          FINANCIAL_HISTORY_ACTIVITY_KINDS.Estimate,
          financialHistoryComparisonKey(item),
        ]),
        seriesKey: item.key,
        kind: FINANCIAL_HISTORY_ACTIVITY_KINDS.Estimate,
        accountId: item.accountId,
        asset: item.position.asset,
        total,
        partial: observations.some(({ partial }) => partial),
        recordedDays: [...byDay.keys()],
        values: dayKeys.map((day) => {
          const values = byDay.get(day)
          return values
            ? sumAmounts([...values.values()].map(({ amount }) => amount.value))
            : null
        }),
        scopes: [item.position.scope],
      },
    ]
  })
}

/** Keep native interval amounts available to the summary, account rows and charts. */
export function presentNativeHistoryActivity({
  activity,
  presentation,
  accountLabels,
  t,
}: {
  activity: Activity[]
  presentation: ReturnType<typeof getFinancialHistoryPresentation>
  accountLabels: Map<string, string>
  t: TFunction<"balanceHistory">
}) {
  const { displayAmount, displayValue, unitLabel } = presentation
  const groups = new Map<string, Activity[]>()
  const accountName = (id: string) => accountLabels.get(id) ?? id
  for (const entry of activity) {
    const current = groups.get(entry.key) ?? []
    current.push(entry)
    groups.set(entry.key, current)
  }
  const ordered = [...groups.values()].sort(
    ([a], [b]) =>
      Number(b?.kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Income) -
      Number(a?.kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Income),
  )
  const accountEntries = new Map<
    string,
    Array<{
      key: string
      label: string
      amount: string
      value: string
      sortLabel: string
      kind: Activity["kind"]
      partial?: boolean
    }>
  >()
  const metrics = ordered.flatMap((items) => {
    // A share of the total only makes sense for independent upstream wallets.
    const subgroups =
      !items.some((item) => "siteDay" in item && item.siteDay) &&
      new Set(items.map(({ accountId }) => accountId)).size === items.length &&
      haveIndependentHistoryScopes(items.map(({ scopes }) => scopes)) &&
      sumAmounts(items.map(({ total }) => total)) !== null
        ? [items]
        : items.map((item) => [item])
    return subgroups.flatMap((group) => {
      const first = group[0]!
      const { asset, kind } = first
      const unit = unitLabel(asset)
      const baseLabel =
        kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Net
          ? t("balanceHistory:metrics.net")
          : kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Income
            ? t("balanceHistory:native.recordedIncome")
            : kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Estimate
              ? t("balanceHistory:metrics.estimatedIncome")
              : "siteDay" in first && first.siteDay
                ? "latestReading" in first && first.latestReading
                  ? `${t("account:financial.siteDay")} · ${t("balanceHistory:native.latest")}`
                  : t("account:financial.siteDay")
                : t("balanceHistory:native.recordedSpending")
      const estimated = kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Estimate
      const metricKind =
        kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Net ||
        kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Estimate
          ? FINANCIAL_METRIC_KINDS.Change
          : kind
      const total = sumAmounts(group.map(({ total }) => total))
      if (total === null) return []
      const partialLabel = t("keyManagement:financial.partial")
      const partial = group.some((item) => item.partial)
      const accountLabel =
        subgroups.length > 1 ? accountName(first.accountId) : undefined
      const key = `native:activity:${JSON.stringify([first.key, accountLabel ? (first.seriesKey ?? first.accountId) : null])}`
      const label = `${baseLabel} · ${unit}${accountLabel ? ` · ${accountLabel}` : ""}`
      const dailyTotals =
        group.length > 1
          ? first.values.map((_, index) => {
              const known = group.flatMap(({ values }) =>
                values[index] == null ? [] : [values[index]],
              )
              return {
                value: known.length ? sumAmounts(known) : null,
                covered: known.length,
                partial: group.some(
                  (item) => item.partial && item.values[index] != null,
                ),
              }
            })
          : undefined
      for (const item of group) {
        const entries = accountEntries.get(item.accountId) ?? []
        entries.push({
          key,
          label: baseLabel,
          amount: displayAmount(asset, item.total),
          value: item.total,
          sortLabel: label,
          kind,
          partial: item.partial,
        })
        accountEntries.set(item.accountId, entries)
      }
      return [
        {
          key,
          label,
          unit,
          kind: metricKind,
          currencyCode:
            asset.kind === ASSET_KINDS.Currency ? asset.code : undefined,
          estimated,
          description: t(
            kind === FINANCIAL_HISTORY_ACTIVITY_KINDS.Net
              ? "balanceHistory:metricHelp.netHint"
              : estimated
                ? "balanceHistory:settings.estimatedTodayIncomeHint"
                : "balanceHistory:native.activityHint",
          ),
          overviewEntries: [],
          totalSeries: dailyTotals
            ? {
                name: t("balanceHistory:trend.scopes.total"),
                values: dailyTotals.map(({ value }) =>
                  value === null ? null : Number(displayValue(asset, value)),
                ),
                valueFormatter: (_value: number | string, day: number) => {
                  const entry = dailyTotals[day]
                  const coverage = t("balanceHistory:native.coverage", {
                    covered: entry?.covered ?? 0,
                    total: group.length,
                  })
                  return entry?.value == null
                    ? "—"
                    : [
                        displayAmount(asset, entry.value),
                        coverage,
                        entry.partial && partialLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                },
              }
            : undefined,
          activity: {
            key,
            kind: metricKind,
            label,
            amount: displayAmount(asset, total),
            covered: group.length,
            partial,
            days: new Set(group.flatMap(({ recordedDays }) => recordedDays))
              .size,
          },
          series: group.map((item) => ({
            name: accountName(item.accountId),
            values: item.values.map((value) =>
              value === null ? null : Number(displayValue(asset, value)),
            ),
            rangeAmount: {
              value: Number(displayValue(asset, item.total)),
              formatted: [
                displayAmount(asset, item.total),
                item.partial && partialLabel,
              ]
                .filter(Boolean)
                .join(" · "),
            },
            valueFormatter: (_value: number | string, day: number) => {
              const value = item.values[day]
              if (value == null) return "—"
              const formatted = displayAmount(asset, value)
              return item.partial
                ? `${formatted} · ${t("keyManagement:financial.partial")}`
                : formatted
            },
          })),
        },
      ]
    })
  })
  return {
    metrics,
    entries: metrics.map(({ activity }) => activity),
    accountEntries,
  }
}

/** Return an exact subtotal when it fits the supported decimal range. */
function sumAmounts(values: string[]): string | null {
  try {
    return sumDecimals(values)
  } catch {
    return null
  }
}
