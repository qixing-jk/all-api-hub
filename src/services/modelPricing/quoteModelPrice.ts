import {
  PRICE_RATE_UNITS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_RANGE_AXES,
  PRICING_SERVICE_TIERS,
  PRICING_USAGE_MODES,
  QUOTE_STATUSES,
  QUOTE_UNITS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"

import { matchesPricingCondition } from "./pricingConditions"
import {
  getPriceMeterUnit,
  PRICE_METERS,
  TOKEN_METERS,
  type PriceMeter,
  type PricingCostContext,
  type PricingPlan,
  type PricingScenario,
  type QuoteResult,
} from "./pricingPlan"
import {
  getQuoteConditionDetails,
  getQuoteRequirementDetails,
} from "./quoteRequirements"

/** Converts one rate using the same currency direction for schedules and totals. */
function getCurrencyConversion(
  source: QuoteResult["currency"],
  target: QuoteResult["currency"],
  cnyPerUsd: number | undefined,
) {
  return source === target
    ? 1
    : target === "CNY"
      ? cnyPerUsd
      : cnyPerUsd === undefined
        ? undefined
        : 1 / cnyPerUsd
}

/** Quotes a shared usage scenario; missing prices and quantities never mean free. */
function calculateQuote(
  plan: PricingPlan,
  scenario: PricingScenario,
  cost: PricingCostContext = {},
): QuoteResult {
  const enforceModelLimits = scenario.purpose === PRICING_PURPOSES.REQUEST
  const comparison =
    plan.comparison ??
    (plan.usageMode === PRICING_USAGE_MODES.IMAGE
      ? { meter: PRICING_METERS.IMAGE }
      : undefined)
  const isUnitIndex =
    comparison !== undefined &&
    scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX
  const comparisonQuantity = isUnitIndex
    ? scenario.taskUsage && Object.hasOwn(scenario.taskUsage, comparison.meter)
      ? scenario.taskUsage[comparison.meter] ?? NaN
      : comparison.meter === PRICING_METERS.CHARACTERS
        ? 1000
        : 1
    : 1
  const comparisonScale = isUnitIndex
    ? (comparison.meter === PRICING_METERS.CHARACTERS ? 1000 : 1) /
      comparisonQuantity
    : 1
  if (isUnitIndex)
    scenario = {
      ...scenario,
      purpose: PRICING_PURPOSES.REQUEST,
      inputTokens: undefined,
      outputTokens: undefined,
      usage: Object.fromEntries(
        PRICE_METERS.map((meter) => [
          meter,
          meter === comparison.meter
            ? comparisonQuantity
            : plan.rates[meter] ||
                plan.rules.some((rule) => rule.rates[meter]) ||
                plan.issues.some((issue) => issue.meters?.includes(meter))
              ? scenario.taskUsage && Object.hasOwn(scenario.taskUsage, meter)
                ? scenario.taskUsage[meter]
                : 0
              : 0,
        ]),
      ),
    }
  if (plan.usageMode === PRICING_USAGE_MODES.VIDEO)
    scenario = {
      ...scenario,
      inputTokens: undefined,
      outputTokens: undefined,
      usage: {
        videoOutput:
          scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX
            ? 1
            : scenario.usage.videoOutput,
      },
    }
  const currency = cost.currency ?? "USD"
  const publishedSchedule = [
    { id: "base", conditions: [], rates: plan.rates },
    ...plan.rules,
  ]
  const result: QuoteResult = {
    status: QUOTE_STATUSES.COMPLETE,
    amount: null,
    currency,
    unit:
      plan.usageMode === PRICING_USAGE_MODES.CUSTOM
        ? QUOTE_UNITS.UNRESOLVED
        : isUnitIndex
          ? {
              characters: QUOTE_UNITS.THOUSAND_CHARACTERS,
              videoSeconds: QUOTE_UNITS.VIDEO_SECOND,
              audio: QUOTE_UNITS.AUDIO_SECOND,
              searchUnits: QUOTE_UNITS.SEARCH_UNIT,
              image: QUOTE_UNITS.IMAGE,
              pages: QUOTE_UNITS.PAGE,
              outputMegapixels: QUOTE_UNITS.MEGAPIXEL,
            }[comparison.meter]
          : scenario.purpose === PRICING_PURPOSES.REQUEST
            ? QUOTE_UNITS.REQUEST
            : plan.usageMode === PRICING_USAGE_MODES.VIDEO
              ? QUOTE_UNITS.MILLION_VIDEO_OUTPUT_TOKENS
              : QUOTE_UNITS.MILLION_SELECTED_TOKENS,
    publishedSchedule,
    schedule: [],
    lines: [],
    matchedRules: [],
    issues: [],
    source: plan.source,
  }
  if (
    plan.source.rulesUnavailable ||
    plan.usageMode === PRICING_USAGE_MODES.CUSTOM
  ) {
    result.status = QUOTE_STATUSES.UNAVAILABLE
    result.issues.push({
      code: plan.issues.some(
        (issue) => issue.reason === PRICING_ISSUE_REASONS.SOURCE_CONFLICT,
      )
        ? PRICING_ISSUE_CODES.SOURCE_CONFLICT
        : plan.issues.some(
              (issue) => issue.code === PRICING_ISSUE_CODES.SOURCE_UNAVAILABLE,
            )
          ? PRICING_ISSUE_CODES.SOURCE_UNAVAILABLE
          : PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
    })
    return result
  }
  if (
    isUnitIndex &&
    (!Number.isFinite(comparisonQuantity) ||
      comparisonQuantity <= 0 ||
      !Number.isFinite(comparisonScale))
  ) {
    result.status = QUOTE_STATUSES.UNAVAILABLE
    result.issues.push({
      code: PRICING_ISSUE_CODES.USAGE_INVALID,
      meter: comparison.meter,
    })
    return result
  }
  const multiplier =
    plan.groupMultiplier === PRICING_GROUP_MULTIPLIERS.INCLUDED
      ? 1
      : cost.groupMultiplier
  if (
    scenario.serviceTier &&
    scenario.serviceTier !== PRICING_SERVICE_TIERS.STANDARD &&
    !plan.serviceTiers?.includes(scenario.serviceTier)
  ) {
    result.status = QUOTE_STATUSES.UNAVAILABLE
    result.issues.push({ code: PRICING_ISSUE_CODES.SERVICE_TIER_UNAVAILABLE })
    return result
  }
  if (
    multiplier === undefined ||
    !Number.isFinite(multiplier) ||
    multiplier < 0
  ) {
    result.issues.push({ code: PRICING_ISSUE_CODES.GROUP_RATE_MISSING })
    result.status = QUOTE_STATUSES.UNAVAILABLE
    return result
  }
  result.calculation = {
    groupMultiplier: multiplier,
    cnyPerUsd: cost.cnyPerUsd,
    ...(isUnitIndex ? { comparisonQuantity } : {}),
  }
  result.schedule = publishedSchedule
    .map((rule) => ({
      ...rule,
      rates: Object.fromEntries(
        PRICE_METERS.flatMap((meter) => {
          const rate = rule.rates[meter]
          if (!rate) return []
          const conversion = getCurrencyConversion(
            rate.currency,
            currency,
            cost.cnyPerUsd,
          )
          if (
            conversion === undefined ||
            !Number.isFinite(conversion) ||
            conversion <= 0
          )
            return []
          const per =
            rate.unit === PRICE_RATE_UNITS.TOKEN ? TOKENS_PER_MILLION : 1
          const amount =
            (rate.amount / rate.per) * per * multiplier * conversion
          return Number.isFinite(amount) && amount >= 0
            ? [[meter, { ...rate, amount, per, currency }]]
            : []
        }),
      ),
    }))
    .filter((rule) => Object.keys(rule.rates).length > 0)
  for (const axis of [
    PRICING_RANGE_AXES.INPUT_TOKENS,
    PRICING_RANGE_AXES.OUTPUT_TOKENS,
    PRICING_RANGE_AXES.TOTAL_TOKENS,
  ] as const) {
    // Reference lengths select price tiers in a unit comparison; they do not
    // describe a request that must fit this model's context window.
    const limit = enforceModelLimits ? plan.limits?.[axis] : undefined
    if (limit === undefined) continue
    const value =
      axis === PRICING_RANGE_AXES.TOTAL_TOKENS
        ? scenario.inputTokens === undefined ||
          scenario.outputTokens === undefined
          ? undefined
          : scenario.inputTokens + scenario.outputTokens
        : scenario[axis]
    if (value === undefined) continue
    if (!Number.isSafeInteger(value) || value < 0 || value > limit) {
      result.issues.push({ code: PRICING_ISSUE_CODES.MODEL_LIMIT_EXCEEDED })
      result.status = QUOTE_STATUSES.UNAVAILABLE
      return result
    }
  }
  const rates = { ...plan.rates }
  const unresolvedMeters = new Map<PriceMeter, QuoteResult["issues"]>()
  for (const rule of plan.rules) {
    const matches = rule.conditions.map((condition) =>
      matchesPricingCondition(condition, scenario),
    )
    if (matches.includes(false)) continue
    const unresolved = matches.filter((match) => match !== true)
    if (unresolved.length) {
      for (const meter of PRICE_METERS)
        if (rule.rates[meter]) {
          delete rates[meter]
          unresolvedMeters.set(
            meter,
            [...new Set(unresolved)].map((reason) => ({
              code:
                typeof reason === "string"
                  ? reason
                  : PRICING_ISSUE_CODES.CONDITION_MISSING,
              meter,
            })),
          )
        }
      continue
    }
    Object.assign(rates, rule.rates)
    for (const meter of PRICE_METERS)
      if (rule.rates[meter]) unresolvedMeters.delete(meter)
    result.matchedRules.push(rule)
  }
  for (const [meter, issues] of unresolvedMeters)
    if ((scenario.usage[meter] ?? 0) > 0) result.issues.push(...issues)
  for (const issue of plan.issues) {
    if (
      plan.comparison &&
      !isUnitIndex &&
      scenario.purpose === PRICING_PURPOSES.REQUEST
    ) {
      for (const meter of issue.meters ?? []) {
        if (scenario.usage[meter] == null && !rates[meter])
          result.issues.push({ code: PRICING_ISSUE_CODES.USAGE_MISSING, meter })
      }
    }
    // A selected-token comparison does not claim to include per-request extras.
    if (
      (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX || isUnitIndex) &&
      issue.code === PRICING_ISSUE_CODES.UNKNOWN_FEES
    )
      continue
    // An unresolved price-changing rule invalidates affected subtotals too.
    // Keep the published schedule visible, but do not quote an unverified base.
    if (
      issue.code === PRICING_ISSUE_CODES.UNSUPPORTED_RULE ||
      issue.code === PRICING_ISSUE_CODES.PRICE_UNAVAILABLE
    ) {
      for (const meter of issue.meters ?? PRICE_METERS) delete rates[meter]
    }
    if (
      !issue.meters ||
      issue.meters.some((meter) => (scenario.usage[meter] ?? 0) > 0)
    )
      result.issues.push({ code: issue.code })
  }
  if (
    result.issues.some(
      (issue) => issue.code === PRICING_ISSUE_CODES.CONDITION_MISSING,
    ) ||
    (plan.requiresRuleMatch && !result.matchedRules.length)
  ) {
    result.conditionDetails = getQuoteConditionDetails(plan, scenario)
  }
  if (plan.requiresRuleMatch && !result.matchedRules.length) {
    // Missing conditions do not establish that the scenario is out of range.
    if (
      !result.issues.some(
        (issue) =>
          issue.code === PRICING_ISSUE_CODES.CONDITION_MISSING ||
          issue.code === PRICING_ISSUE_CODES.CACHE_BASIS_UNKNOWN,
      )
    )
      result.issues.push({ code: PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE })
    result.status = QUOTE_STATUSES.UNAVAILABLE
    return result
  }
  let total = 0
  let weight = 0
  for (const meter of PRICE_METERS) {
    if (
      scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX &&
      !TOKEN_METERS.some((key) => key === meter)
    )
      continue
    const quantity = scenario.usage[meter]
    const rate = rates[meter]
    if (
      quantity === 0 ||
      (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX && quantity == null)
    )
      continue
    if (quantity == null) {
      if (rate || Object.hasOwn(scenario.usage, meter))
        result.issues.push({ code: PRICING_ISSUE_CODES.USAGE_MISSING, meter })
      continue
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      result.issues.push({ code: PRICING_ISSUE_CODES.USAGE_INVALID, meter })
      continue
    }
    weight += quantity
    if (!Number.isFinite(weight)) {
      result.status = QUOTE_STATUSES.UNAVAILABLE
      result.issues.push({ code: PRICING_ISSUE_CODES.USAGE_INVALID, meter })
      return result
    }
    if (!rate) {
      result.issues.push({ code: PRICING_ISSUE_CODES.PRICE_MISSING, meter })
      continue
    }
    if (rate.unverifiedReason) {
      result.issues.push({ code: rate.unverifiedReason, meter })
      continue
    }
    const expectedUnit = getPriceMeterUnit(meter)
    if (
      scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX &&
      rate.freeQuantity
    ) {
      result.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE, meter })
      continue
    }
    if (
      rate.unit !== expectedUnit ||
      !Number.isFinite(rate.amount) ||
      rate.amount < 0 ||
      !Number.isFinite(rate.per) ||
      rate.per <= 0 ||
      (rate.freeQuantity !== undefined &&
        (!Number.isFinite(rate.freeQuantity) || rate.freeQuantity < 0))
    ) {
      result.issues.push({ code: PRICING_ISSUE_CODES.PRICE_INVALID, meter })
      continue
    }
    const conversion = getCurrencyConversion(
      rate.currency,
      currency,
      cost.cnyPerUsd,
    )
    if (
      conversion === undefined ||
      !Number.isFinite(conversion) ||
      conversion <= 0
    ) {
      result.issues.push({
        code: PRICING_ISSUE_CODES.EXCHANGE_RATE_MISSING,
        meter,
      })
      continue
    }
    const billableQuantity = Math.max(0, quantity - (rate.freeQuantity ?? 0))
    const amount =
      ((rate.amount *
        (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX
          ? TOKENS_PER_MILLION
          : 1)) /
        rate.per) *
      billableQuantity *
      multiplier *
      conversion
    result.lines.push({
      meter,
      quantity,
      ...(rate.freeQuantity === undefined ? {} : { billableQuantity }),
      rate,
      amount,
      effectiveUnitRate:
        (rate.amount / rate.per) *
        (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX
          ? TOKENS_PER_MILLION
          : 1) *
        multiplier *
        conversion,
    })
    total += amount
    if (!Number.isFinite(amount) || !Number.isFinite(total)) {
      result.amount = null
      result.status = QUOTE_STATUSES.UNAVAILABLE
      result.issues.push({ code: PRICING_ISSUE_CODES.PRICE_INVALID, meter })
      return result
    }
  }
  if (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX)
    result.calculation.totalWeight = weight
  if (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX && weight === 0)
    result.issues.push({ code: PRICING_ISSUE_CODES.USAGE_MISSING })
  if (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX && weight > 0)
    result.lines = result.lines.map((line) => ({
      ...line,
      amount: line.amount / weight,
    }))
  result.amount = result.lines.length
    ? (total /
        (scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX ? weight : 1)) *
      comparisonScale
    : null
  if (isUnitIndex)
    result.lines = result.lines.map((line) => ({
      ...line,
      amount: line.amount * comparisonScale,
    }))
  if (result.amount !== null && !Number.isFinite(result.amount)) {
    result.amount = null
    result.lines = []
    result.issues.push({ code: PRICING_ISSUE_CODES.PRICE_INVALID })
  }
  result.status =
    result.amount === null
      ? QUOTE_STATUSES.UNAVAILABLE
      : result.issues.length
        ? QUOTE_STATUSES.PARTIAL
        : QUOTE_STATUSES.COMPLETE
  return result
}

/** Attach actionable field context to the same quote used by ranking. */
export function quoteModelPrice(
  plan: PricingPlan,
  scenario: PricingScenario,
  cost: PricingCostContext = {},
): QuoteResult {
  const quote = calculateQuote(plan, scenario, cost)
  const details = getQuoteRequirementDetails(plan, scenario, quote)
  if (details) quote.requirementDetails = details
  return quote
}
