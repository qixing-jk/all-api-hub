import { ChevronDown } from "lucide-react"
import type { Ref } from "react"
import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import {
  FinancialMetricIcon,
  type FinancialMetricKind,
} from "~/components/FinancialMetricLabel"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { ANIMATIONS } from "~/constants/designTokens"
import type { BalanceHistoryVisibleMetric } from "~/features/BalanceHistory/contracts"
import { DAILY_BALANCE_HISTORY_METRICS } from "~/services/history/dailyBalanceHistory/constants"
import type { CurrencyType } from "~/types"

import { BalanceHistoryMetricHelp } from "./BalanceHistoryMetricHelp"
import { getBalanceHistoryMetricLabel } from "./presentation"

const metricIcons = {
  [DAILY_BALANCE_HISTORY_METRICS.Balance]: FINANCIAL_METRIC_KINDS.Balance,
  [DAILY_BALANCE_HISTORY_METRICS.Income]: FINANCIAL_METRIC_KINDS.Income,
  [DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome]:
    FINANCIAL_METRIC_KINDS.Income,
  [DAILY_BALANCE_HISTORY_METRICS.Outcome]: FINANCIAL_METRIC_KINDS.Consumption,
  [DAILY_BALANCE_HISTORY_METRICS.Net]: FINANCIAL_METRIC_KINDS.Change,
} satisfies Record<BalanceHistoryVisibleMetric, FinancialMetricKind>

type MetricOption = {
  key: string
  label: string
  kind: FinancialMetricKind
  description: string
  currencyCode?: string
  estimated?: boolean
}

/** Balance charts share the same metric labels, ordering and keyboard interaction. */
export function BalanceHistoryMetricMenu({
  title,
  metric,
  nativeMetric,
  nativeMetrics,
  hasReferenceBalance,
  referenceMetrics,
  currencyType,
  estimatedTodayIncomeEnabled,
  onChange,
  triggerRef,
}: {
  title: string
  metric: BalanceHistoryVisibleMetric
  nativeMetric?: MetricOption
  nativeMetrics: MetricOption[]
  hasReferenceBalance: boolean
  referenceMetrics?: BalanceHistoryVisibleMetric[]
  currencyType: CurrencyType
  estimatedTodayIncomeEnabled: boolean
  onChange: (key: string) => void
  triggerRef?: Ref<HTMLButtonElement>
}) {
  const { t } = useTranslation("balanceHistory")
  const descriptions = {
    balance: t("metricHelp.convertedHint"),
    income: t("metricHelp.incomeHint"),
    outcome: t("metricHelp.outcomeHint"),
    net: t("metricHelp.netHint"),
    estimatedIncome: t("metricHelp.estimatedHint"),
  } satisfies Record<BalanceHistoryVisibleMetric, string>
  const commonOption = (key: BalanceHistoryVisibleMetric): MetricOption => ({
    key: nativeMetrics.length ? `reference:${key}` : key,
    label:
      nativeMetrics.length > 0
        ? `${key === DAILY_BALANCE_HISTORY_METRICS.Balance ? t("metricMenu.convertedBalance") : getBalanceHistoryMetricLabel(t, key)} · ${t("legacy.title")}`
        : getBalanceHistoryMetricLabel(t, key),
    kind: metricIcons[key],
    description: descriptions[key],
    currencyCode: currencyType,
  })
  const availableReference =
    referenceMetrics ??
    (hasReferenceBalance || !nativeMetrics.length
      ? [
          DAILY_BALANCE_HISTORY_METRICS.Balance,
          DAILY_BALANCE_HISTORY_METRICS.Income,
          DAILY_BALANCE_HISTORY_METRICS.Outcome,
          DAILY_BALANCE_HISTORY_METRICS.Net,
          DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome,
        ]
      : [])
  const balances = nativeMetrics.filter(
    ({ kind }) => kind === FINANCIAL_METRIC_KINDS.Balance,
  )
  if (availableReference.includes(DAILY_BALANCE_HISTORY_METRICS.Balance))
    balances.push(commonOption(DAILY_BALANCE_HISTORY_METRICS.Balance))
  const cashflow: BalanceHistoryVisibleMetric[] = [
    DAILY_BALANCE_HISTORY_METRICS.Income,
    DAILY_BALANCE_HISTORY_METRICS.Outcome,
    DAILY_BALANCE_HISTORY_METRICS.Net,
    ...(estimatedTodayIncomeEnabled
      ? [DAILY_BALANCE_HISTORY_METRICS.EstimatedIncome]
      : []),
  ]
  const groups = [
    { label: t("metricMenu.balances"), options: balances },
    {
      label: t("metricMenu.allowances"),
      options: nativeMetrics.filter(
        ({ kind }) =>
          kind === FINANCIAL_METRIC_KINDS.Allowance ||
          kind === FINANCIAL_METRIC_KINDS.Tokens,
      ),
    },
    {
      label: t("metricMenu.cashflow"),
      options: [
        ...nativeMetrics.filter(
          ({ kind }) =>
            kind === FINANCIAL_METRIC_KINDS.Income ||
            kind === FINANCIAL_METRIC_KINDS.Consumption ||
            kind === FINANCIAL_METRIC_KINDS.Change,
        ),
        ...cashflow
          .filter((key) => availableReference.includes(key))
          .map(commonOption),
      ],
    },
  ].filter(({ options }) => options.length > 0)
  const selected = nativeMetric ?? commonOption(metric)
  return (
    <div className="flex min-w-0 items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={`${ANIMATIONS.transition.base} inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-sm font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-secondary`}
          >
            <FinancialMetricIcon kind={selected.kind} />
            <span className="min-w-0 text-start [overflow-wrap:anywhere] whitespace-normal">
              {title}: {selected.label}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-4 shrink-0 opacity-70"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[min(26rem,var(--radix-dropdown-menu-content-available-height))] max-w-72 min-w-48"
        >
          <DropdownMenuRadioGroup value={selected.key} onValueChange={onChange}>
            {groups.map(({ label, options }, index) => (
              <DropdownMenuGroup key={label} aria-label={label}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel
                  inset
                  className="py-1 text-xs text-muted-foreground"
                >
                  {label}
                </DropdownMenuLabel>
                {options.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.key}
                    value={option.key}
                    textValue={option.label}
                    className="gap-2"
                  >
                    <FinancialMetricIcon
                      kind={option.kind}
                      className="text-muted-foreground"
                    />
                    <span>{option.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <BalanceHistoryMetricHelp
        chart={title}
        options={groups.flatMap(({ options }) => options)}
        selectedKey={selected.key}
      />
    </div>
  )
}
