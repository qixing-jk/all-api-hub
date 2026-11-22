import { Layers2, Ticket } from "lucide-react"
import type { ReactNode } from "react"

import {
  AccountBalanceChangeIcon,
  AccountBalanceIcon,
  AccountConsumptionIcon,
  AccountIncomeIcon,
} from "~/components/icons/productIcons"
import { cn } from "~/lib/utils"

import { FINANCIAL_METRIC_KINDS } from "./financialMetricKinds"
import type { FinancialMetricKind } from "./financialMetricKinds"

const metricIcons = {
  [FINANCIAL_METRIC_KINDS.Balance]: AccountBalanceIcon,
  [FINANCIAL_METRIC_KINDS.Allowance]: Ticket,
  [FINANCIAL_METRIC_KINDS.Consumption]: AccountConsumptionIcon,
  [FINANCIAL_METRIC_KINDS.Income]: AccountIncomeIcon,
  [FINANCIAL_METRIC_KINDS.Change]: AccountBalanceChangeIcon,
  [FINANCIAL_METRIC_KINDS.Tokens]: Layers2,
} as const

export type { FinancialMetricKind } from "./financialMetricKinds"

/** Decorative glyphs keep financial labels and refresh actions consistent. */
export function FinancialMetricIcon({
  kind,
  className,
}: {
  kind: FinancialMetricKind
  className?: string
}) {
  const Icon = metricIcons[kind]
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 text-faint-foreground", className)}
    />
  )
}

/** Position the glyph independently so it cannot change the text baseline. */
export function FinancialMetricLabel({
  kind,
  children,
  className,
  iconClassName,
}: {
  kind: FinancialMetricKind
  children: ReactNode
  className?: string
  iconClassName?: string
}) {
  return (
    <span className={cn("relative inline-block min-w-0 pl-5", className)}>
      <FinancialMetricIcon
        kind={kind}
        className={cn(
          "absolute top-1/2 left-0 -translate-y-1/2",
          iconClassName,
        )}
      />
      <span>{children}</span>
    </span>
  )
}
