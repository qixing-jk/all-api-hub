import type { Amount } from "~/services/amounts/balance"
import { parseDecimal } from "~/services/amounts/decimal"
import { ASSET_KINDS } from "~/services/amounts/financialConstants"

import {
  PRICING_PURPOSES,
  PRICING_SOURCE_KINDS,
  QUOTE_STATUSES,
} from "./pricingConstants"
import type { PricingPlan, QuoteResult } from "./pricingPlan"
import {
  QUOTA_QUOTE_STATUSES,
  type QuotaPricingPlan,
  type QuotaQuote,
} from "./quotaPricing"

export const QUOTE_AMOUNT_KINDS = {
  ScenarioEstimate: "scenario-estimate",
  UnitComparison: "unit-comparison",
  PublishedReference: "published-reference",
  UnclassifiedQuote: "unclassified-quote",
} as const

const QUOTE_AMOUNT_PRECISION = "approximate"

/** A derived display/interop view of a quote, never an observed account balance or bill. */
export interface QuoteAmountProjection {
  kind: (typeof QUOTE_AMOUNT_KINDS)[keyof typeof QUOTE_AMOUNT_KINDS]
  precision: typeof QUOTE_AMOUNT_PRECISION
  amount?: Amount
  status: QuoteResult["status"] | QuotaQuote["status"]
  source: PricingPlan["source"]
}

/** Projects the existing monetary quote without storing a second amount truth. */
export function projectMonetaryQuoteAmount(
  quote: QuoteResult,
): QuoteAmountProjection {
  const value =
    quote.status !== QUOTE_STATUSES.UNAVAILABLE
      ? quoteDecimal(quote.amount)
      : undefined
  return {
    kind:
      quote.purpose === undefined
        ? QUOTE_AMOUNT_KINDS.UnclassifiedQuote
        : quote.purpose === PRICING_PURPOSES.REQUEST
          ? QUOTE_AMOUNT_KINDS.ScenarioEstimate
          : QUOTE_AMOUNT_KINDS.UnitComparison,
    precision: QUOTE_AMOUNT_PRECISION,
    status: quote.status,
    source: quote.source,
    ...(value === undefined
      ? {}
      : {
          amount: {
            value,
            asset: { kind: ASSET_KINDS.Currency, code: quote.currency },
          },
        }),
  }
}

/** Projects native quota quotes while preserving unresolved factors as reference usage. */
export function projectQuotaQuoteAmount(
  plan: QuotaPricingPlan,
  quote: QuotaQuote,
  kind: (typeof QUOTE_AMOUNT_KINDS)["ScenarioEstimate" | "UnitComparison"],
): QuoteAmountProjection {
  const reference = quote.status === QUOTA_QUOTE_STATUSES.Reference
  const value =
    quote.status !== QUOTA_QUOTE_STATUSES.Unavailable
      ? quoteDecimal(reference ? quote.baseAmount : quote.amount)
      : undefined
  return {
    kind: reference ? QUOTE_AMOUNT_KINDS.PublishedReference : kind,
    precision: QUOTE_AMOUNT_PRECISION,
    status: quote.status,
    source: { kind: PRICING_SOURCE_KINDS.CATALOG, url: plan.sourceUrl },
    ...(value === undefined
      ? {}
      : {
          amount: { value, asset: { kind: ASSET_KINDS.Quota, ...plan.unit } },
        }),
  }
}

/** Only a terminal approximation is serialized here; it never enters native balance arithmetic. */
function quoteDecimal(value: number | null) {
  return value !== null && Number.isFinite(value) && value >= 0
    ? parseDecimal(String(value))
    : undefined
}
