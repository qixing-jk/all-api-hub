import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_RESPONSE_FORMATS,
  PRICING_SELECTION_AXES,
  PRICING_SERVICE_TIERS,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import {
  CACHE_TOKEN_METERS,
  pricingPlanSchema,
  type PriceMeter,
  type PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { scalePricingRates } from "~/services/modelPricing/pricingRates"

import {
  calendarConditions,
  intersectBillingConditions,
  negateBillingAlternatives,
  parseBillingConditions,
  type BillingRange,
} from "./billingConditions"
import { BILLING_EXPRESSION_LIMITS } from "./billingLimits"
import { splitBillingRequestFactors } from "./billingRequestFactors"

const variables = {
  p: PRICING_METERS.INPUT,
  c: PRICING_METERS.OUTPUT,
  cr: PRICING_METERS.CACHE_READ,
  cc: PRICING_METERS.CACHE_WRITE,
  cc1h: PRICING_METERS.CACHE_WRITE1H,
  img: PRICING_METERS.IMAGE_INPUT,
  img_o: PRICING_METERS.IMAGE_OUTPUT,
  ai: PRICING_METERS.AUDIO_INPUT,
  ao: PRICING_METERS.AUDIO_OUTPUT,
} as const
const numberPattern = "(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?"

/**
 * Recognize v1 editor-generated linear token tiers, never execute upstream code.
 * https://github.com/QuantumNous/new-api/blob/bee45b58a3c0b77e8dc81e6b5aeb4474aa9058d1/pkg/billingexpr/expr.md
 * service/tiered_settle.go: `len` includes cache; omitted cache variables have
 * different fallback semantics for Claude and OpenAI, so leave those unpriced.
 * `p` subtracts explicitly priced input subcategories for OpenAI usage, while
 * Claude's total input length always loses cache when converted back to `p`.
 */
export function parseNewApiBillingExpression(expression: unknown): PricingPlan {
  const unsupported: PricingPlan = {
    rates: {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
    issues: [
      {
        code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
        reason: PRICING_ISSUE_REASONS.PRICE_EXPRESSION,
      },
    ],
  }
  if (
    typeof expression !== "string" ||
    expression.length > BILLING_EXPRESSION_LIMITS.CHARACTERS
  ) {
    unsupported.issues[0].reason =
      typeof expression !== "string"
        ? PRICING_ISSUE_REASONS.MISSING_EXPRESSION
        : PRICING_ISSUE_REASONS.EXPRESSION_LIMIT
    return unsupported
  }
  if (/^v(?!1:)/.test(expression.trim())) {
    unsupported.issues[0].reason = PRICING_ISSUE_REASONS.EXPRESSION_VERSION
    return unsupported
  }
  const parsedExpression = splitBillingRequestFactors(
    expression.trim().replace(/^v1:\s*/, ""),
  )
  if (!parsedExpression) {
    unsupported.issues[0].reason = PRICING_ISSUE_REASONS.REQUEST_CONDITION
    return unsupported
  }
  let rest = parsedExpression.base
  // tier() records a label but returns its numeric argument unchanged. Accept
  // a fully matched linear formula as an unnamed base tier, using the same
  // coefficient validation and token normalization as explicitly named tiers.
  const linearTerm = `(?:(?:p|c|cr|cc|cc1h|img|img_o|ai|ao)\\s*\\*\\s*)?${numberPattern}`
  if (new RegExp(`^${linearTerm}(?:\\s*\\+\\s*${linearTerm})*\\s*$`).test(rest))
    rest = `tier("base", ${rest})`
  const branches: {
    id: string
    alternatives: BillingRange[][]
    coefficients: Partial<Record<PriceMeter, number>>
    fixed: boolean
  }[] = []
  let remaining: BillingRange[][] = [[]]
  let finished = false
  const used = new Set<PriceMeter>()
  while (rest && branches.length < BILLING_EXPRESSION_LIMITS.BRANCHES) {
    let conditions: BillingRange[][] | undefined
    if (!rest.startsWith("tier(")) {
      const separator = rest.indexOf("?")
      if (separator < 0) return unsupported
      conditions = parseBillingConditions(rest.slice(0, separator))
      if (!conditions) {
        unsupported.issues[0].reason = PRICING_ISSUE_REASONS.CONDITION_SYNTAX
        return unsupported
      }
      rest = rest.slice(separator + 1).trimStart()
    }
    const tier = new RegExp(
      `^tier\\(\\s*"([^"\\\\\\r\\n]{1,160})"\\s*,\\s*(fixed\\(\\s*${numberPattern}\\s*\\)|[^()]+)\\s*\\)\\s*`,
    ).exec(rest)
    if (!tier) return unsupported
    const coefficients: Partial<Record<PriceMeter, number>> = {}
    const termPattern = new RegExp(
      `^\\s*(?:(p|c|cr|cc|cc1h|img|img_o|ai|ao)\\s*\\*\\s*)?(${numberPattern})\\s*(?:\\+|$)`,
    )
    let body = tier[2]
    const fixed = new RegExp(`^fixed\\(\\s*(${numberPattern})\\s*\\)$`).exec(
      body.trim(),
    )
    // Official v1 fixed() returns USD * 1M internally; reuse the existing
    // request coefficient conversion without interpreting it as token pricing.
    // https://github.com/QuantumNous/new-api/blob/main/pkg/billingexpr/expr.md#fixed-request-prices
    if (fixed) body = String(Number(fixed[1]) * TOKENS_PER_MILLION)
    while (body) {
      const term = termPattern.exec(body)
      if (!term) return unsupported
      const meter = term[1]
        ? variables[term[1] as keyof typeof variables]
        : PRICING_METERS.REQUEST
      const amount = Number(term[2])
      if (!Number.isFinite(amount) || coefficients[meter] !== undefined)
        return unsupported
      coefficients[meter] = amount
      used.add(meter)
      body = body.slice(term[0].length)
      if (!body && term[0].trimEnd().endsWith("+")) return unsupported
    }
    branches.push({
      fixed: Boolean(fixed),
      id: `${branches.length + 1}-${tier[1]}`,
      alternatives: remaining.flatMap((path) =>
        (conditions ?? [[]]).flatMap((group) => {
          const merged = intersectBillingConditions(path, group)
          return merged ? [merged] : []
        }),
      ),
      coefficients,
    })
    rest = rest.slice(tier[0].length)
    if (!conditions) {
      finished = true
      if (rest) return unsupported
      break
    }
    if (!rest.startsWith(":")) return unsupported
    rest = rest.slice(1).trimStart()
    const inverseConditions = negateBillingAlternatives(conditions)
    if (!inverseConditions) {
      unsupported.issues[0].reason = PRICING_ISSUE_REASONS.EXPRESSION_LIMIT
      return unsupported
    }
    remaining = remaining.flatMap((path) =>
      inverseConditions.flatMap((inverse) => {
        const merged = intersectBillingConditions(path, inverse)
        return merged ? [merged] : []
      }),
    )
    if (remaining.length > BILLING_EXPRESSION_LIMITS.ALTERNATIVES) {
      unsupported.issues[0].reason = PRICING_ISSUE_REASONS.EXPRESSION_LIMIT
      return unsupported
    }
  }
  if (rest || !branches.length || !finished) {
    if (branches.length === BILLING_EXPRESSION_LIMITS.BRANCHES)
      unsupported.issues[0].reason = PRICING_ISSUE_REASONS.EXPRESSION_LIMIT
    return unsupported
  }
  // Mixed token/request leaves require a scenario-dependent comparison unit.
  // Until that contract exists, do not flatten them into a misleading index.
  if (
    branches.some((branch) => branch.fixed) &&
    branches.some((branch) => !branch.fixed)
  )
    return unsupported
  if (
    branches.reduce((count, branch) => count + branch.alternatives.length, 0) >
    BILLING_EXPRESSION_LIMITS.ALTERNATIVES
  ) {
    unsupported.issues[0].reason = PRICING_ISSUE_REASONS.EXPRESSION_LIMIT
    return unsupported
  }
  const plan: PricingPlan = {
    ...unsupported,
    issues: [],
    requiresRuleMatch: true,
    rates: {
      request: {
        amount: 0,
        currency: "USD",
        unit: PRICE_RATE_UNITS.REQUEST,
        per: 1,
      },
    },
    rules: branches.flatMap((branch) =>
      branch.alternatives.map((ranges, index) => ({
        id: `${branch.id}-${index}`,
        conditions: ranges.flatMap(
          (range): PricingPlan["rules"][number]["conditions"] =>
            range.timeZone
              ? calendarConditions(range)
              : [
                  {
                    kind: PRICING_CONDITION_KINDS.RANGE,
                    axis:
                      range.variable === "c"
                        ? PRICING_RANGE_AXES.OUTPUT_TOKENS
                        : PRICING_RANGE_AXES.INPUT_TOKENS,
                    ...(range.variable === "p"
                      ? {
                          inputTokenDeductions: {
                            openai: (
                              [
                                PRICING_METERS.CACHE_READ,
                                PRICING_METERS.CACHE_WRITE,
                                PRICING_METERS.CACHE_WRITE1H,
                                PRICING_METERS.IMAGE_INPUT,
                                PRICING_METERS.AUDIO_INPUT,
                              ] as const
                            ).filter((meter) => used.has(meter)),
                            anthropic: [...CACHE_TOKEN_METERS],
                          },
                        }
                      : {}),
                    ...(range.variable === "c"
                      ? {
                          outputTokenDeductions: {
                            openai: (
                              [
                                PRICING_METERS.IMAGE_OUTPUT,
                                PRICING_METERS.AUDIO_OUTPUT,
                              ] as const
                            ).filter((meter) => used.has(meter)),
                            anthropic: [],
                          },
                        }
                      : {}),
                    min: range.min,
                    maxExclusive: range.maxExclusive,
                  },
                ],
        ),
        rates: Object.fromEntries(
          (
            [
              PRICING_METERS.INPUT,
              PRICING_METERS.OUTPUT,
              ...[...used].filter(
                (meter) =>
                  meter !== PRICING_METERS.INPUT &&
                  meter !== PRICING_METERS.OUTPUT,
              ),
            ] as PriceMeter[]
          ).map((meter) => [
            meter,
            {
              amount:
                (branch.coefficients[meter] ?? 0) /
                (meter === PRICING_METERS.REQUEST ? TOKENS_PER_MILLION : 1),
              currency: "USD",
              unit:
                meter === PRICING_METERS.REQUEST
                  ? PRICE_RATE_UNITS.REQUEST
                  : PRICE_RATE_UNITS.TOKEN,
              per: meter === PRICING_METERS.REQUEST ? 1 : TOKENS_PER_MILLION,
            },
          ]),
        ),
      })),
    ),
  }
  if (branches.length === 1) {
    plan.rates = { ...plan.rates, ...plan.rules[0].rates }
    plan.rules = []
    plan.requiresRuleMatch = false
  }
  const standardRules =
    branches.length === 1
      ? [{ id: "base", conditions: [], rates: plan.rates }]
      : [...plan.rules]
  for (const rule of standardRules) {
    for (const format of [
      PRICING_RESPONSE_FORMATS.OPENAI,
      PRICING_RESPONSE_FORMATS.ANTHROPIC,
    ] as const) {
      const rates: PricingPlan["rates"] = {}
      for (const meter of CACHE_TOKEN_METERS) {
        if (!used.has(meter))
          rates[meter] = {
            ...rule.rates.input!,
            amount:
              format === PRICING_RESPONSE_FORMATS.ANTHROPIC
                ? 0
                : rule.rates.input!.amount,
          }
      }
      for (const meter of [
        PRICING_METERS.IMAGE_INPUT,
        PRICING_METERS.AUDIO_INPUT,
        PRICING_METERS.IMAGE_OUTPUT,
        PRICING_METERS.AUDIO_OUTPUT,
      ] as const) {
        const base =
          meter === PRICING_METERS.IMAGE_INPUT ||
          meter === PRICING_METERS.AUDIO_INPUT
            ? rule.rates.input!
            : rule.rates.output!
        // Claude skips subcategory subtraction; its separate media counters
        // are therefore additional to the raw prompt/completion charge.
        if (!used.has(meter)) rates[meter] = base
        else if (format === PRICING_RESPONSE_FORMATS.ANTHROPIC)
          rates[meter] = {
            ...rule.rates[meter]!,
            amount: rule.rates[meter]!.amount + base.amount,
          }
      }
      plan.rules.push({
        id: `${rule.id}-${format}`,
        conditions: [
          ...rule.conditions,
          {
            kind: PRICING_CONDITION_KINDS.SELECTION,
            axis: PRICING_SELECTION_AXES.RESPONSE_FORMAT,
            value: format,
          },
        ],
        rates,
      })
    }
  }
  for (const [index, factor] of parsedExpression.factors.entries()) {
    const prior = [
      { id: "base", conditions: [], rates: plan.rates },
      ...plan.rules,
    ]
    if (
      prior.length * factor.alternatives.length >
      BILLING_EXPRESSION_LIMITS.FACTOR_RULES
    )
      return unsupported
    for (const [
      alternativeIndex,
      conditions,
    ] of factor.alternatives.entries()) {
      for (const condition of conditions)
        if (
          condition.kind === PRICING_CONDITION_KINDS.SELECTION &&
          condition.axis === PRICING_SELECTION_AXES.SERVICE_TIER
        )
          plan.serviceTiers = [
            ...new Set([
              ...(plan.serviceTiers ?? [PRICING_SERVICE_TIERS.STANDARD]),
              condition.value as NonNullable<
                PricingPlan["serviceTiers"]
              >[number],
            ]),
          ]
      for (const rule of prior)
        plan.rules.push({
          id: `factor-${index}-${alternativeIndex}-${rule.id}`,
          conditions: [...rule.conditions, ...conditions],
          rates: scalePricingRates(rule.rates, factor.multiplier),
        })
    }
  }
  // A v1 constant shares the expression's /1M conversion, but occurs once
  // per request. Zero token coefficients must not turn a fixed fee into free tokens.
  if (
    used.has(PRICING_METERS.REQUEST) &&
    branches.every((branch) =>
      Object.entries(branch.coefficients).every(
        ([meter, amount]) => meter === PRICING_METERS.REQUEST || amount === 0,
      ),
    )
  ) {
    plan.usageMode = PRICING_USAGE_MODES.REQUEST
    plan.rates = plan.rates.request ? { request: plan.rates.request } : {}
    plan.rules = plan.rules
      .filter((rule) => rule.rates.request)
      .map((rule) => ({ ...rule, rates: { request: rule.rates.request! } }))
  }
  return pricingPlanSchema.safeParse(plan).success ? plan : unsupported
}
