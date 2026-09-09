import { matchesPricingCondition } from "./pricingConditions"
import {
  PRICING_CONDITION_KINDS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_RANGE_AXES,
  PRICING_SELECTION_AXES,
  PRICING_SERVICE_TIERS,
  PRICING_USAGE_MODES,
} from "./pricingConstants"
import type { PricingPlan, PricingScenario, QuoteResult } from "./pricingPlan"
import { normalizeVideoQuality } from "./videoQuality"

/** Lists missing or unsupported selections using published rule order. */
export function getQuoteConditionDetails(
  plan: PricingPlan,
  scenario: PricingScenario,
): QuoteResult["conditionDetails"] {
  const selections = new Map<
    NonNullable<QuoteResult["conditionDetails"]>[number]["axis"],
    Set<string>
  >()
  for (const rule of plan.rules) {
    for (const condition of rule.conditions) {
      if (condition.kind !== PRICING_CONDITION_KINDS.SELECTION) continue
      const values = selections.get(condition.axis) ?? new Set<string>()
      values.add(
        condition.axis === PRICING_SELECTION_AXES.VIDEO_QUALITY
          ? normalizeVideoQuality(condition.value)
          : condition.value,
      )
      selections.set(condition.axis, values)
    }
  }
  return [...selections].flatMap(([axis, values]) => {
    const selected =
      axis === PRICING_SELECTION_AXES.SERVICE_TIER
        ? scenario.serviceTier ?? PRICING_SERVICE_TIERS.STANDARD
        : scenario[axis]
    const normalized =
      selected && axis === PRICING_SELECTION_AXES.VIDEO_QUALITY
        ? normalizeVideoQuality(selected)
        : selected
    return normalized !== undefined && values.has(normalized)
      ? []
      : [{ axis, selected, available: [...values] }]
  })
}

/** Explains quote issues using the original user-entered scenario quantities. */
export function getQuoteRequirementDetails(
  plan: PricingPlan,
  scenario: PricingScenario,
  quote: QuoteResult,
): QuoteResult["requirementDetails"] {
  const details = new Map<
    string,
    NonNullable<QuoteResult["requirementDetails"]>[number]
  >()
  for (const issue of quote.issues) {
    if (
      [
        PRICING_ISSUE_CODES.USAGE_MISSING,
        PRICING_ISSUE_CODES.USAGE_INVALID,
      ].some((code) => code === issue.code) &&
      issue.meter
    ) {
      details.set(issue.meter, {
        axis: issue.meter,
        kind: "quantity",
        value:
          scenario.taskUsage && Object.hasOwn(scenario.taskUsage, issue.meter)
            ? scenario.taskUsage[issue.meter]
            : scenario.usage[issue.meter],
        ranges: [
          {
            min: 0,
            minExclusive:
              scenario.purpose === PRICING_PURPOSES.TOKEN_INDEX &&
              (plan.comparison?.meter === issue.meter ||
                (plan.usageMode === PRICING_USAGE_MODES.IMAGE &&
                  issue.meter === PRICING_METERS.IMAGE)),
          },
        ],
      })
    }
    if (issue.code === PRICING_ISSUE_CODES.MODEL_LIMIT_EXCEEDED) {
      for (const axis of [
        PRICING_RANGE_AXES.INPUT_TOKENS,
        PRICING_RANGE_AXES.OUTPUT_TOKENS,
        PRICING_RANGE_AXES.TOTAL_TOKENS,
      ] as const) {
        const max = plan.limits?.[axis]
        const value =
          axis === PRICING_RANGE_AXES.TOTAL_TOKENS
            ? (scenario.inputTokens ?? 0) + (scenario.outputTokens ?? 0)
            : scenario[axis]
        if (
          max !== undefined &&
          value !== undefined &&
          (!Number.isSafeInteger(value) || value < 0 || value > max)
        )
          details.set(axis, {
            axis,
            kind: "range",
            value,
            ranges: [{ min: 0, max }],
          })
      }
    }
  }
  if (
    quote.issues.some((issue) =>
      [
        PRICING_ISSUE_CODES.CONDITION_MISSING,
        PRICING_ISSUE_CODES.PRICE_RANGE_UNAVAILABLE,
      ].some((code) => code === issue.code),
    )
  ) {
    const satisfied = new Set<string>()
    for (const rule of plan.rules) {
      // Do not suggest conditions belonging to a different selected variant.
      if (
        rule.conditions.some(
          (condition) =>
            condition.kind === PRICING_CONDITION_KINDS.SELECTION &&
            matchesPricingCondition(condition, scenario) === false,
        )
      )
        continue
      const evaluations = new Map<string, boolean[]>()
      for (const condition of rule.conditions) {
        if (condition.kind === PRICING_CONDITION_KINDS.SELECTION) continue
        if (
          condition.kind === PRICING_CONDITION_KINDS.RANGE &&
          condition.axis === PRICING_RANGE_AXES.UNVERIFIED_CONTEXT_TOKENS
        )
          continue
        const isRange = condition.kind === PRICING_CONDITION_KINDS.RANGE
        const axis =
          condition.kind === PRICING_CONDITION_KINDS.MEASUREMENT
            ? condition.axis
            : isRange
              ? condition.axis === PRICING_RANGE_AXES.OUTPUT_TOKENS
                ? PRICING_RANGE_AXES.OUTPUT_TOKENS
                : condition.axis === PRICING_RANGE_AXES.TOTAL_TOKENS
                  ? PRICING_RANGE_AXES.TOTAL_TOKENS
                  : PRICING_RANGE_AXES.INPUT_TOKENS
              : "at"
        evaluations.set(axis, [
          ...(evaluations.get(axis) ?? []),
          matchesPricingCondition(condition, scenario) === true,
        ])
        const value =
          axis === PRICING_RANGE_AXES.TOTAL_TOKENS
            ? scenario.inputTokens === undefined ||
              scenario.outputTokens === undefined
              ? undefined
              : scenario.inputTokens + scenario.outputTokens
            : scenario[axis]
        const existing = details.get(axis)
        const ranges = existing?.ranges ?? []
        if (condition.kind === PRICING_CONDITION_KINDS.MEASUREMENT)
          ranges.push({
            min: condition.gt,
            minExclusive: true,
            max: condition.lte,
          })
        if (isRange)
          ranges.push({
            min: condition.min,
            max: condition.maxExclusive,
            maxExclusive: true,
          })
        details.set(axis, {
          axis,
          value,
          kind: axis === "at" ? "time" : "range",
          ...(ranges.length ? { ranges } : {}),
        })
      }
      for (const [axis, matches] of evaluations)
        if (matches.every(Boolean)) satisfied.add(axis)
    }
    for (const axis of satisfied) details.delete(axis)
  }
  return details.size ? [...details.values()] : undefined
}
