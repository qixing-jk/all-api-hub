import type { CalculatedModelItem } from "~/features/ModelList/hooks/useFilteredModels"
import {
  CALCULATED_PRICE_KINDS,
  PRICE_RATE_UNITS,
  QUOTE_STATUSES,
  QUOTE_UNITS,
} from "~/services/modelPricing/pricingConstants"
import {
  pricingPlanSchema,
  type PricingPlan,
  type QuoteResult,
} from "~/services/modelPricing/pricingPlan"

import { MODEL_MANAGEMENT_SOURCE_KINDS } from "./modelManagementSources"

type DiagnosticInput = Pick<
  CalculatedModelItem,
  "model" | "source" | "effectiveGroup" | "calculatedPrice"
>

/** Keeps only an HTTP origin; credential-bearing URL parts are never exported. */
function diagnosticOrigin(value: string) {
  try {
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) ? url.origin : undefined
  } catch {
    return undefined
  }
}

/** Summarizes existing quotes without fetching data or running a second pricing engine. */
export function buildPricingDiagnostics(models: readonly DiagnosticInput[]) {
  const rows = models.map((item) => {
    const source =
      item.source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
        ? item.source.account
        : item.source.profile
    const quote = item.calculatedPrice.quote
    // Default sorting retains the legacy fixed-call calculation without a quote.
    // Inspect that already-computed price; do not run another pricing engine.
    const legacyPrice =
      !quote &&
      !item.model.pricingPlan &&
      item.calculatedPrice.kind === CALCULATED_PRICE_KINDS.PER_CALL &&
      typeof item.calculatedPrice.usdPerCall === "number" &&
      Number.isFinite(item.calculatedPrice.usdPerCall) &&
      item.calculatedPrice.usdPerCall >= 0
        ? {
            amount: item.calculatedPrice.usdPerCall,
            currency: "USD" as const,
            unit: PRICE_RATE_UNITS.REQUEST,
          }
        : undefined
    let plan: PricingPlan | undefined
    let invalidPlan = false
    if (item.model.pricingPlan) {
      try {
        const parsed = pricingPlanSchema.safeParse(item.model.pricingPlan)
        if (parsed.success) plan = parsed.data
        else invalidPlan = true
      } catch {
        // Diagnostic inspection must survive throwing schema refinements too.
        invalidPlan = true
      }
    }
    const issues = new Map<string, QuoteResult["issues"][number]>()
    const addIssue = (
      code: string,
      meter?: QuoteResult["issues"][number]["meter"],
    ) => {
      issues.set(
        JSON.stringify([code, meter]),
        meter ? { code, meter } : { code },
      )
    }
    for (const issue of quote?.issues ?? []) addIssue(issue.code, issue.meter)
    for (const issue of plan?.issues ?? []) {
      // A meter-specific limitation only needs attention when this quote uses
      // that meter. The full plan still retains it in diagnostic details.
      const relevant =
        !quote ||
        !issue.meters ||
        issue.meters.some(
          (meter) =>
            quote.lines.some(
              (line) => line.meter === meter && line.quantity > 0,
            ) || quote.issues.some((problem) => problem.meter === meter),
        )
      if (issue.reason && relevant) addIssue(`unsupported:${issue.reason}`)
    }
    const unavailable =
      !quote && item.calculatedPrice.kind === CALCULATED_PRICE_KINDS.UNAVAILABLE
        ? item.calculatedPrice
        : undefined
    if (unavailable) addIssue(`availability:${unavailable.reason}`)
    else if (!quote && !legacyPrice) addIssue("diagnostic:not-quoted")
    if (invalidPlan) addIssue("diagnostic:invalid-plan")
    if (
      quote?.status === QUOTE_STATUSES.COMPLETE &&
      (quote.amount === null ||
        !Number.isFinite(quote.amount) ||
        quote.amount < 0 ||
        quote.unit === QUOTE_UNITS.UNRESOLVED)
    )
      addIssue("diagnostic:inconsistent-quote")
    return {
      model: item.model.model_name,
      source: { name: source.name, origin: diagnosticOrigin(source.baseUrl) },
      group: item.effectiveGroup,
      status:
        quote?.status ??
        (legacyPrice
          ? QUOTE_STATUSES.COMPLETE
          : unavailable
            ? QUOTE_STATUSES.UNAVAILABLE
            : "not-quoted"),
      unit:
        quote?.unit ??
        legacyPrice?.unit ??
        (unavailable
          ? unavailable.billingMode === "per-call"
            ? QUOTE_UNITS.REQUEST
            : QUOTE_UNITS.MILLION_SELECTED_TOKENS
          : "not-quoted"),
      issues: [...issues.values()],
      ...(quote?.conditionDetails
        ? { conditionDetails: quote.conditionDetails }
        : {}),
      ...(quote?.requirementDetails
        ? { requirementDetails: quote.requirementDetails }
        : {}),
      legacyPrice,
      quote: quote
        ? {
            amount: quote.amount,
            currency: quote.currency,
            sourceKind: quote.source.kind,
            matchedRuleIds: quote.matchedRules.map((rule) => rule.id),
            calculation: quote.calculation
              ? {
                  groupMultiplier: quote.calculation.groupMultiplier,
                  cnyPerUsd: quote.calculation.cnyPerUsd,
                  totalWeight: quote.calculation.totalWeight,
                }
              : undefined,
            lines: quote.lines.map((line) => ({
              meter: line.meter,
              quantity: line.quantity,
              amount: line.amount,
              rate: {
                amount: line.rate.amount,
                currency: line.rate.currency,
                unit: line.rate.unit,
                per: line.rate.per,
              },
            })),
          }
        : undefined,
      // The schema rejects extra fields. Source URLs and descriptions are omitted.
      plan: plan
        ? {
            source: {
              kind: plan.source.kind,
              rulesUnavailable: plan.source.rulesUnavailable,
              hasUnpricedCharges: plan.source.hasUnpricedCharges,
            },
            usageMode: plan.usageMode,
            rates: plan.rates,
            rules: plan.rules,
            issues: plan.issues,
            groupMultiplier: plan.groupMultiplier,
            requiresRuleMatch: plan.requiresRuleMatch,
          }
        : undefined,
    }
  })
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    scope: "current-filtered-models",
    ...summarizePricingDiagnostics(rows),
    rows,
  }
}

/** Use the same counting rules for full reports and locally filtered exports. */
export function summarizePricingDiagnostics(
  rows: readonly {
    status: string
    unit: string
    issues: readonly { code: string }[]
  }[],
) {
  const counts = new Map<string, number>()
  const units = new Map<string, number>()
  for (const row of rows) {
    for (const code of new Set(row.issues.map((issue) => issue.code)))
      counts.set(code, (counts.get(code) ?? 0) + 1)
    units.set(row.unit, (units.get(row.unit) ?? 0) + 1)
  }
  return {
    summary: {
      total: rows.length,
      complete: rows.filter((row) => row.status === QUOTE_STATUSES.COMPLETE)
        .length,
      partial: rows.filter((row) => row.status === QUOTE_STATUSES.PARTIAL)
        .length,
      unavailable: rows.filter(
        (row) => row.status === QUOTE_STATUSES.UNAVAILABLE,
      ).length,
      notQuoted: rows.filter((row) => row.status === "not-quoted").length,
      attention: rows.filter((row) => row.issues.length > 0).length,
    },
    issueCounts: [...counts]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    units: [...units]
      .map(([unit, count]) => ({ unit, count }))
      .sort((a, b) => a.unit.localeCompare(b.unit)),
  }
}
