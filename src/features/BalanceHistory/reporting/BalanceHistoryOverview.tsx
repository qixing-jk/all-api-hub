import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import {
  FinancialMetricLabel,
  type FinancialMetricKind,
} from "~/components/FinancialMetricLabel"
import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import { Button, Card } from "~/components/ui"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { CURRENCIES } from "~/constants/money"
import { BalanceHistoryFilterSheet } from "~/features/BalanceHistory/filtering/BalanceHistoryFilterSheet"
import { BALANCE_HISTORY_TEST_IDS } from "~/features/BalanceHistory/testIds"
import { type useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import { cn } from "~/lib/utils"
import { formatMoneyFixed } from "~/utils/core/money"

/** Show the period-end observations in their original units alongside reference figures. */
export function BalanceHistoryOverview({
  model,
  historyCoverage,
  onViewTrend,
}: {
  model: ReturnType<typeof useBalanceHistoryViewModel>
  historyCoverage?: { covered: number; total: number }
  onViewTrend: (key: string) => void
}) {
  const { t, i18n } = useTranslation("balanceHistory")
  const {
    overviewTotals,
    currencySymbol,
    nativeBalanceMetrics,
    nativeActivity,
    effectiveRange,
  } = model
  const endingBalances = [...nativeBalanceMetrics]
    .sort(
      (a, b) =>
        Number(b.kind === FINANCIAL_METRIC_KINDS.Balance) -
        Number(a.kind === FINANCIAL_METRIC_KINDS.Balance),
    )
    .flatMap(({ key, kind, label, overviewEntries, openingEntries }) =>
      overviewEntries.map((entry) => ({
        key,
        kind,
        label,
        ...entry,
        opening:
          effectiveRange.startDayKey !== effectiveRange.endDayKey
            ? openingEntries.find(
                ({ accountId }) => accountId === entry.accountId,
              )
            : undefined,
      })),
    )
  const referenceMetrics = [
    {
      kind: FINANCIAL_METRIC_KINDS.Balance,
      label: t("overview.kpis.endBalance.label"),
      value: overviewTotals.endBalance,
      covered: overviewTotals.endBalanceCovered,
    },
    {
      kind: FINANCIAL_METRIC_KINDS.Change,
      label: t("overview.kpis.rangeNet.label"),
      value: overviewTotals.rangeNet,
      covered: overviewTotals.rangeNetCovered,
    },
    {
      kind: FINANCIAL_METRIC_KINDS.Income,
      label: t("overview.kpis.incomeTotal.label"),
      value: overviewTotals.incomeTotal,
      covered: overviewTotals.incomeCovered,
    },
    {
      kind: FINANCIAL_METRIC_KINDS.Consumption,
      label: t("overview.kpis.outcomeTotal.label"),
      value: overviewTotals.outcomeTotal,
      covered: overviewTotals.outcomeCovered,
    },
  ] satisfies Array<{
    kind: FinancialMetricKind
    label: string
    value: number | null
    covered: number
  }>
  const hasEndingBalances = endingBalances.length > 0
  const singleBalance = endingBalances.length === 1
  const showReferenceFigures = model.hasReferenceBalance
  const hasOverview =
    hasEndingBalances || showReferenceFigures || nativeActivity.length > 0

  const activity = [
    ...nativeActivity,
    ...(showReferenceFigures
      ? referenceMetrics.flatMap(({ kind, label, value, covered }) =>
          value === null
            ? []
            : [
                {
                  key: `reference:${kind}`,
                  kind,
                  label,
                  amount: `${currencySymbol}${formatMoneyFixed(value)}`,
                  covered,
                  reference: true,
                },
              ],
        )
      : []),
  ]

  return (
    <Card
      padding={hasOverview ? "md" : "none"}
      className={
        hasOverview
          ? "space-y-density-3"
          : "border-0 bg-transparent shadow-none"
      }
      data-testid={hasOverview ? BALANCE_HISTORY_TEST_IDS.overview : undefined}
    >
      <BalanceHistoryFilterSheet
        model={model}
        heading={
          hasEndingBalances
            ? t("native.amountsTitle")
            : hasOverview
              ? t("native.activityTitle")
              : undefined
        }
        periodEnd={
          hasEndingBalances ? (
            <span>
              {t("filters.endDay")} ·{" "}
              <time dateTime={effectiveRange.endDayKey}>
                {new Intl.DateTimeFormat(
                  i18n.resolvedLanguage ?? i18n.language,
                  {
                    dateStyle: "medium",
                    timeZone: "UTC",
                  },
                ).format(new Date(effectiveRange.endDayKey))}
              </time>
            </span>
          ) : undefined
        }
      />
      <div className="space-y-density-2">
        {hasEndingBalances && (
          <section aria-label={t("native.amountsTitle")}>
            {historyCoverage &&
              historyCoverage.covered < historyCoverage.total && (
                <p className="text-xs text-muted-foreground">
                  {t("native.coverage", historyCoverage)}
                </p>
              )}
            <ul
              className={cn(
                "mt-density-2 grid gap-x-4",
                !singleBalance && "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
              )}
            >
              {endingBalances.map(
                ({
                  key,
                  kind,
                  label,
                  accountId,
                  accountLabel,
                  amount,
                  covered,
                  total,
                  opening,
                }) => (
                  <li
                    key={JSON.stringify([key, accountId])}
                    className="min-w-0"
                  >
                    <button
                      type="button"
                      aria-label={t("overview.viewTrend", {
                        metric: accountLabel
                          ? `${label} · ${accountLabel}`
                          : label,
                        amount: amount ?? "—",
                      })}
                      className={cn(
                        "group flex w-full gap-y-density-1 rounded-sm py-density-2 text-start hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-ring",
                        singleBalance
                          ? "flex-wrap items-baseline gap-x-3"
                          : "flex-col items-start",
                      )}
                      onClick={() => onViewTrend(key)}
                    >
                      <FinancialMetricLabel
                        kind={kind}
                        className="text-xs [overflow-wrap:anywhere]"
                      >
                        {label}
                      </FinancialMetricLabel>
                      <span
                        className={cn(
                          "flex max-w-full min-w-0 items-center gap-2",
                          !singleBalance && "ps-5",
                        )}
                      >
                        <span className="min-w-0 text-base font-semibold [overflow-wrap:anywhere] tabular-nums">
                          {amount ?? "—"}
                        </span>
                        <WorkflowTransitionIcon
                          aria-hidden="true"
                          className="size-3.5 shrink-0 self-center text-muted-foreground group-hover:text-foreground"
                        />
                      </span>
                      {opening && (
                        <span
                          className={cn(
                            "text-xs text-muted-foreground",
                            !singleBalance && "ps-5",
                          )}
                        >
                          {t("table.columns.startBalance")} · {opening.amount} ·{" "}
                          {t("overview.kpis.coverageAccounts", opening)}
                        </span>
                      )}
                      <span
                        className={cn(
                          "text-xs [overflow-wrap:anywhere] text-muted-foreground",
                          !singleBalance && "ps-5",
                        )}
                      >
                        {accountLabel && <>{accountLabel} · </>}
                        {t("overview.kpis.coverageAccounts", {
                          covered,
                          total,
                        })}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          </section>
        )}

        {(activity.length > 0 || showReferenceFigures) && (
          <section
            aria-label={t("native.activityTitle")}
            className={cn(
              "@container space-y-density-2",
              hasEndingBalances && "border-t border-border pt-density-3",
            )}
          >
            <div
              className={cn(
                hasEndingBalances &&
                  "flex flex-col gap-x-4 gap-y-density-1 @lg:flex-row @lg:items-start @lg:justify-between",
              )}
            >
              {hasEndingBalances && (
                <h2 className="shrink-0 text-sm font-medium">
                  {t("native.activityTitle")}
                </h2>
              )}
              <div
                className={cn(
                  "min-w-0 space-y-density-1 text-xs text-muted-foreground",
                  hasEndingBalances && "@lg:max-w-[65%] @lg:text-end",
                )}
              >
                {nativeActivity.length > 0 && <p>{t("native.activityHint")}</p>}
                {showReferenceFigures && (
                  <div
                    className={cn(
                      "flex flex-wrap items-baseline gap-x-2",
                      hasEndingBalances && "@lg:justify-end",
                    )}
                  >
                    <p>{t("legacy.totalsHint")}</p>
                    {model.currencyType === CURRENCIES.CNY &&
                      model.legacyReferenceRates.length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto min-h-0 p-0 text-xs"
                            >
                              {t("legacy.referenceRates")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            aria-label={t("legacy.referenceRates")}
                            className="max-h-(--radix-popover-content-available-height) w-max max-w-[min(22rem,var(--radix-popover-content-available-width))] overflow-auto"
                          >
                            <ul className="space-y-density-1 text-xs [overflow-wrap:anywhere]">
                              {model.legacyReferenceRates.map((reference) => (
                                <li key={reference.accountId}>
                                  {t("legacy.referenceRate", {
                                    account: reference.label,
                                    rate: reference.rate,
                                    date: new Date().toLocaleDateString(),
                                  })}
                                </li>
                              ))}
                            </ul>
                          </PopoverContent>
                        </Popover>
                      )}
                  </div>
                )}
              </div>
            </div>
            <dl
              className={cn(
                "grid grid-cols-2 gap-x-4 gap-y-density-3 sm:grid-cols-3 lg:grid-cols-4",
                activity.length === 5 && "xl:grid-cols-5",
              )}
            >
              {activity.map((entry) => (
                <div key={entry.key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    <FinancialMetricLabel kind={entry.kind}>
                      {entry.label}
                    </FinancialMetricLabel>
                  </dt>
                  <dd className="text-base font-semibold [overflow-wrap:anywhere] tabular-nums">
                    {entry.amount}
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    {"reference" in entry && (
                      <>
                        {t("legacy.title")} · {model.currencyType} ·{" "}
                      </>
                    )}
                    {t("overview.kpis.coverageAccounts", {
                      covered: entry.covered,
                      total: overviewTotals.totalAccounts,
                    })}
                    {"days" in entry && (
                      <>
                        {" "}
                        ·{" "}
                        {t("native.activityCoverage", {
                          covered: entry.days,
                          total: model.financialHistory.dayKeys.length,
                        })}
                      </>
                    )}
                    {"partial" in entry && entry.partial && (
                      <> · {t("keyManagement:financial.partial")}</>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </Card>
  )
}
