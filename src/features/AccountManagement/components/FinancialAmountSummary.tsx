import { useTranslation } from "react-i18next"

import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import { Caption } from "~/components/ui"
import type { Amount } from "~/services/amounts/balance"
import { formatAssetAmount, formatCompactAssetAmount } from "~/utils/core/money"

export const FINANCIAL_AMOUNT_TONES = {
  Income: "income",
  Expense: "expense",
} as const

/** A bounded overview with full native amounts and intervals available on demand. */
export function FinancialAmountSummary({
  label,
  amounts,
  emptyLabel,
  tone,
}: {
  label: string
  amounts: Array<Amount & { qualifier?: string }>
  emptyLabel: string
  tone?: (typeof FINANCIAL_AMOUNT_TONES)[keyof typeof FINANCIAL_AMOUNT_TONES]
}) {
  const { i18n } = useTranslation("account")
  return (
    <section aria-label={label} className="min-w-0 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Caption className="min-w-0 font-medium">
          {tone ? (
            <FinancialMetricLabel
              kind={
                tone === FINANCIAL_AMOUNT_TONES.Income
                  ? "income"
                  : "consumption"
              }
            >
              {label}
            </FinancialMetricLabel>
          ) : (
            label
          )}
        </Caption>
      </div>
      {amounts.length ? (
        amounts.slice(0, 2).map((amount, index) => {
          const text = formatAssetAmount(amount, i18n.language)
          return (
            <div key={index}>
              <p
                title={text}
                className={`truncate text-base leading-snug font-semibold tracking-tight tabular-nums ${tone === FINANCIAL_AMOUNT_TONES.Income ? "text-cashflow-income" : tone === FINANCIAL_AMOUNT_TONES.Expense ? "text-cashflow-expense" : "text-foreground"}`}
              >
                {formatCompactAssetAmount(amount, i18n.language)}
              </p>
              {amount.qualifier && <Caption as="p">{amount.qualifier}</Caption>}
            </div>
          )
        })
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
      {amounts.length > 2 && <Caption as="p">+{amounts.length - 2}</Caption>}
    </section>
  )
}
