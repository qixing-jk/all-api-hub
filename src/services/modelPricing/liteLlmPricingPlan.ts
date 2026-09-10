import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_SELECTION_AXES,
  PRICING_SERVICE_TIERS,
  PRICING_SOURCE_KINDS,
} from "~/services/modelPricing/pricingConstants"
import {
  pricingPlanSchema,
  type PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { isRecord } from "~/utils/core/object"

const fields = {
  input_cost_per_token: PRICING_METERS.INPUT,
  output_cost_per_token: PRICING_METERS.OUTPUT,
  cache_read_input_token_cost: PRICING_METERS.CACHE_READ,
  cache_creation_input_token_cost: PRICING_METERS.CACHE_WRITE,
  cache_creation_input_token_cost_above_1hr: PRICING_METERS.CACHE_WRITE1H,
} as const

/**
 * Standard service-tier estimate; highest matching threshold replaces base keys.
 * https://github.com/BerriAI/litellm/blob/eeb7732fc11fd47762ca84cc3fb7cc74235d7097/litellm/litellm_core_utils/llm_cost_calc/utils.py
 * `_get_token_base_cost` uses raw prompt tokens; xAI alone uses inclusive thresholds.
 */
export function buildLiteLlmPricingPlan(
  entry: Record<string, unknown>,
  source: string,
): PricingPlan | undefined {
  const tiers = [
    PRICING_SERVICE_TIERS.FLEX,
    PRICING_SERVICE_TIERS.PRIORITY,
    PRICING_SERVICE_TIERS.FAST,
    PRICING_SERVICE_TIERS.ULTRAFAST,
  ] as const
  const available = tiers.filter((tier) =>
    Object.keys(entry).some(
      (key) =>
        key.startsWith("input_cost_per_token") &&
        key.endsWith(`_${tier}`) &&
        entry[key] != null,
    ),
  )
  const hasBatch =
    entry.input_cost_per_token_batches != null ||
    entry.output_cost_per_token_batches != null
  const base = buildStandardPlan(
    entry,
    source,
    available.length > 0 || hasBatch,
  )
  if (!base || (!available.length && !hasBatch)) return base
  base.serviceTiers = [PRICING_SERVICE_TIERS.STANDARD, ...available]
  base.rules = base.rules.map((rule) => ({
    ...rule,
    conditions: [
      {
        kind: PRICING_CONDITION_KINDS.SELECTION,
        axis: PRICING_SELECTION_AXES.SERVICE_TIER,
        value: PRICING_SERVICE_TIERS.STANDARD,
      },
      ...rule.conditions,
    ],
  }))
  for (const tier of available) {
    const variant = { ...entry }
    // utils.py _get_service_tier_cost_key appends the tier; missing keys use standard.
    for (const [key, value] of Object.entries(entry)) {
      if (key.endsWith(`_${tier}`) && value != null) {
        const standardKey = key.slice(0, -tier.length - 1)
        if (standardKey !== "cache_creation_input_token_cost_above_1hr")
          variant[standardKey] = value
      }
    }
    // A tiered_pricing table takes precedence over service-tier prices upstream.
    if (Array.isArray(entry.tiered_pricing))
      variant.tiered_pricing = entry.tiered_pricing.map((tier) =>
        isRecord(tier) && !Object.hasOwn(tier, "output_cost_per_token")
          ? { ...tier, output_cost_per_token: entry.output_cost_per_token }
          : tier,
      )
    const plan = buildStandardPlan(variant, source, true)!
    base.rules.push(
      ...[{ id: "base", conditions: [], rates: plan.rates }, ...plan.rules].map(
        (rule) => ({
          ...rule,
          id: `${tier}-${rule.id}`,
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.SELECTION,
              axis: PRICING_SELECTION_AXES.SERVICE_TIER,
              value: tier,
            },
            ...rule.conditions,
          ],
        }),
      ),
    )
    // Invalid variant input must not make any selected tier look complete.
    base.issues.push(
      ...plan.issues.filter(
        (issue) => issue.code !== PRICING_ISSUE_CODES.UNKNOWN_FEES,
      ),
    )
  }
  if (hasBatch) {
    // cost_calculator.py batch_cost_calculator: explicit prompt batch price
    // includes cache, otherwise cache is separated and each standard rate halved.
    const batchEntry: Record<string, unknown> = {
      ...entry,
      tiered_pricing: undefined,
      off_peak_pricing: undefined,
    }
    for (const key of Object.keys(batchEntry))
      if (
        key.includes("_above_") &&
        key !== "cache_creation_input_token_cost_above_1hr"
      )
        delete batchEntry[key]
    const rates = buildStandardPlan(batchEntry, source, true)!.rates
    const batchRate = (raw: unknown, fallback: typeof rates.input) =>
      raw == null
        ? fallback && { ...fallback, amount: fallback.amount / 2 }
        : {
            amount:
              typeof raw === "number" || (typeof raw === "string" && raw.trim())
                ? Number(raw)
                : NaN,
            currency: "USD" as const,
            unit: PRICE_RATE_UNITS.TOKEN,
            per: 1,
          }
    const input = batchRate(entry.input_cost_per_token_batches, rates.input)
    const cacheWrite = batchRate(
      undefined,
      rates.cacheWrite?.amount ? rates.cacheWrite : rates.input,
    )
    const batchRates = {
      input,
      output: batchRate(entry.output_cost_per_token_batches, rates.output),
      cacheRead:
        entry.input_cost_per_token_batches != null
          ? input
          : batchRate(undefined, rates.cacheRead),
      cacheWrite:
        entry.input_cost_per_token_batches != null ? input : cacheWrite,
      cacheWrite1h:
        entry.input_cost_per_token_batches != null ? input : cacheWrite,
    }
    base.serviceTiers.push(PRICING_SERVICE_TIERS.BATCH)
    base.rules.push({
      id: "batch",
      conditions: [
        {
          kind: PRICING_CONDITION_KINDS.SELECTION,
          axis: PRICING_SELECTION_AXES.SERVICE_TIER,
          value: PRICING_SERVICE_TIERS.BATCH,
        },
      ],
      rates: batchRates,
    })
  }
  return pricingPlanSchema.safeParse(base).success
    ? base
    : {
        ...base,
        rates: {},
        rules: [],
        issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
      }
}

/** Compile one resolved service tier using the upstream context/time precedence. */
function buildStandardPlan(
  entry: Record<string, unknown>,
  source: string,
  force = false,
): PricingPlan | undefined {
  if (
    !force &&
    !Object.keys(entry).some(
      (key) =>
        key.includes("_above_") ||
        key === "tiered_pricing" ||
        key === "off_peak_pricing",
    )
  )
    return undefined
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    source: { kind: PRICING_SOURCE_KINDS.ESTIMATE, url: source },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
    issues: [
      {
        code: PRICING_ISSUE_CODES.UNKNOWN_FEES,
        meters: [PRICING_METERS.REQUEST],
      },
    ],
  }
  const readRates = (suffix = "", sourceEntry = entry) => {
    const rates: PricingPlan["rates"] = {}
    for (const [field, meter] of Object.entries(fields)) {
      const raw = sourceEntry[field + suffix]
      if (raw === undefined || raw === null) continue
      const amount =
        typeof raw === "number"
          ? raw
          : typeof raw === "string" && raw.trim()
            ? Number(raw)
            : NaN
      if (!Number.isFinite(amount) || amount < 0) {
        plan.issues.push({
          code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
          meters: [meter],
        })
        continue
      }
      rates[meter] = {
        amount,
        currency: "USD",
        unit: PRICE_RATE_UNITS.TOKEN,
        per: 1,
      }
    }
    return rates
  }
  plan.rates = readRates()
  const thresholds = Object.keys(entry)
    .flatMap((key) => {
      const match = /^input_cost_per_token_above_(\d+)(k?)_tokens$/.exec(key)
      return match
        ? [
            {
              threshold: Number(match[1]) * (match[2] ? 1000 : 1),
              suffix: key.slice("input_cost_per_token".length),
            },
          ]
        : []
    })
    .sort((a, b) => a.threshold - b.threshold)
  for (const [index, { threshold, suffix }] of thresholds.entries()) {
    plan.rules.push({
      id: suffix.slice(1),
      conditions: [
        {
          kind: PRICING_CONDITION_KINDS.RANGE,
          axis: PRICING_RANGE_AXES.INPUT_TOKENS,
          min: threshold + (entry.litellm_provider === "xai" ? 0 : 1),
          ...(thresholds[index + 1]
            ? {
                maxExclusive:
                  thresholds[index + 1].threshold +
                  (entry.litellm_provider === "xai" ? 0 : 1),
              }
            : {}),
        },
      ],
      rates: { ...plan.rates, ...readRates(suffix) },
    })
  }
  if (entry.tiered_pricing != null) {
    const tiers = Array.isArray(entry.tiered_pricing)
      ? entry.tiered_pricing
      : []
    if (
      !tiers.every(
        (tier) =>
          isRecord(tier) &&
          Array.isArray(tier.range) &&
          tier.range.length === 2 &&
          tier.range.every(
            (value) =>
              typeof value === "number" &&
              Number.isSafeInteger(value) &&
              value >= 0 &&
              value < Number.MAX_SAFE_INTEGER,
          ) &&
          tier.range[1] > tier.range[0] &&
          tier.input_cost_per_token != null,
      ) ||
      !Array.isArray(entry.tiered_pricing)
    ) {
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    } else if (tiers.length) {
      const sorted = [...tiers].sort((a, b) => a.range[0] - b.range[0])
      const ratesForTier = (tier: Record<string, unknown>) => {
        const rates = readRates("", tier)
        const input = rates.input
        const cacheWrite = rates.cacheWrite ?? input
        return {
          ...rates,
          output: rates.output ?? plan.rates.output,
          cacheRead: rates.cacheRead ?? input,
          cacheWrite,
          cacheWrite1h: rates.cacheWrite1h?.amount
            ? rates.cacheWrite1h
            : cacheWrite,
        }
      }
      // Upstream selects the first matching (start, end] range; gaps use the last.
      plan.rules.push({
        id: "interval-fallback",
        conditions: [
          {
            kind: PRICING_CONDITION_KINDS.RANGE,
            axis: PRICING_RANGE_AXES.INPUT_TOKENS,
            min: 1,
          },
        ],
        rates: ratesForTier(sorted[sorted.length - 1]),
      })
      for (const [index, tier] of [...sorted].reverse().entries()) {
        plan.rules.push({
          id: `interval-${index}`,
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS,
              min: tier.range[0] + 1,
              maxExclusive: tier.range[1] + 1,
            },
          ],
          rates: ratesForTier(tier),
        })
      }
    }
  }
  if (entry.off_peak_pricing != null) {
    const offPeak = entry.off_peak_pricing
    if (!isRecord(offPeak))
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    else {
      const rates = readRates("", offPeak)
      delete rates.cacheWrite1h
      if (offPeak.output_cost_per_reasoning_token != null)
        plan.issues.push({
          code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
          meters: [PRICING_METERS.OUTPUT],
        })
      const windowStrings = (value: unknown): string[] =>
        typeof value === "string"
          ? [value]
          : Array.isArray(value) &&
              value.every((item) => typeof item === "string")
            ? value
            : []
      const windows: { hours_utc: unknown; weekdays?: unknown }[] = [
        { hours_utc: offPeak.hours_utc },
      ]
      if (Array.isArray(offPeak.windows))
        windows.push(
          ...offPeak.windows.filter(isRecord).map((value) => ({
            hours_utc: value.hours_utc,
            weekdays: value.weekdays,
          })),
        )
      let timeZone =
        typeof offPeak.weekday_timezone === "string"
          ? offPeak.weekday_timezone
          : "UTC"
      try {
        new Intl.DateTimeFormat("en", { timeZone })
      } catch {
        timeZone = "UTC"
      }
      for (const window of windows) {
        const conditions: PricingPlan["rules"][number]["conditions"] = []
        if (window.weekdays != null) {
          if (!Array.isArray(window.weekdays)) {
            plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
            continue
          }
          const names: Record<string, number> = {
            mon: 1,
            monday: 1,
            tue: 2,
            tues: 2,
            tuesday: 2,
            wed: 3,
            wednesday: 3,
            thu: 4,
            thur: 4,
            thurs: 4,
            thursday: 4,
            fri: 5,
            friday: 5,
            sat: 6,
            saturday: 6,
            sun: 7,
            sunday: 7,
          }
          const days = window.weekdays.map((day) =>
            typeof day === "number"
              ? day
              : typeof day === "string"
                ? names[day.trim().toLowerCase()]
                : undefined,
          )
          if (
            days.some(
              (day) =>
                day === undefined ||
                !Number.isInteger(day) ||
                day < 1 ||
                day > 7,
            )
          ) {
            plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
            continue
          }
          conditions.push({
            kind: PRICING_CONDITION_KINDS.TIME_WINDOW,
            timeZone,
            startMinute: 0,
            endMinute: 1440,
            days: days.map((day) => day! % 7),
          })
        }
        for (const hours of windowStrings(window.hours_utc)) {
          const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(
            hours.trim(),
          )
          if (
            !match ||
            Number(match[1]) > 23 ||
            Number(match[2]) > 59 ||
            Number(match[3]) > 23 ||
            Number(match[4]) > 59
          ) {
            plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
            continue
          }
          plan.rules.push({
            id: `off-peak-${plan.rules.length + 1}`,
            conditions: [
              ...conditions,
              {
                kind: PRICING_CONDITION_KINDS.UTC_WINDOW,
                startMinute: Number(match[1]) * 60 + Number(match[2]),
                endMinute: Number(match[3]) * 60 + Number(match[4]),
              },
            ],
            rates,
          })
        }
      }
    }
  }
  return pricingPlanSchema.safeParse(plan).success
    ? plan
    : {
        ...plan,
        rates: {},
        rules: [],
        issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
      }
}
