import { z } from "zod"

import {
  MODEL_PRICE_PRECISION_KINDS,
  MODEL_PRICE_SOURCE_KINDS,
  MODEL_UNAVAILABLE_PRICE_REASONS,
} from "~/services/modelList/pricingModel"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import {
  pricingPlanSchema,
  type PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { scalePricingRates } from "~/services/modelPricing/pricingRates"
import { isRecord } from "~/utils/core/object"

const STATION_BILLING_MODES = {
  TOKEN: "token",
  PER_REQUEST: "per_request",
  IMAGE: "image",
} as const

const amount = z.number().finite().nonnegative().nullish()
const priceFields = {
  input_price: amount,
  output_price: amount,
  cache_read_price: amount,
  cache_write_price: amount,
  cache_write_1h_price: amount,
  per_request_price: amount,
}
const intervalSchema = z.object({
  ...priceFields,
  tier_label: z.string().optional(),
  min_tokens: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  max_tokens: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1)
    .nullish(),
  input_multiplier: amount,
  output_multiplier: amount,
  cache_read_multiplier: amount,
  cache_write_multiplier: amount,
})
const modelSchema = z.object({
  name: z.string(),
  long_context_basis: z.string().optional(),
  pricing: z.object({
    ...priceFields,
    billing_mode: z.string(),
    intervals: z.array(intervalSchema).nullish(),
    max_reasoning_effort_multiplier: amount,
  }),
  time_pricing: z
    .object({
      timezone: z.string(),
      weekdays_only: z.boolean().optional(),
      periods: z.array(
        z.object({
          start_time: z.string(),
          end_time: z.string(),
          multiplier: z.number().finite().nonnegative(),
        }),
      ),
    })
    .nullish(),
})
const tokenFields = [
  {
    meter: PRICING_METERS.INPUT,
    price: "input_price",
    multiplier: "input_multiplier",
  },
  {
    meter: PRICING_METERS.OUTPUT,
    price: "output_price",
    multiplier: "output_multiplier",
  },
  {
    meter: PRICING_METERS.CACHE_READ,
    price: "cache_read_price",
    multiplier: "cache_read_multiplier",
  },
  {
    meter: PRICING_METERS.CACHE_WRITE,
    price: "cache_write_price",
    multiplier: "cache_write_multiplier",
  },
  {
    meter: PRICING_METERS.CACHE_WRITE1H,
    price: "cache_write_1h_price",
    multiplier: "cache_write_multiplier",
  },
] as const

export interface Sub2ApiPricingCatalogs {
  plaza?: unknown
  channels?: unknown
}

/**
 * Resolve only the runtime key's already-available stable group and exact model.
 * https://github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/service/billing_context_schedule.go
 * Plaza schedules are whole-request USD/token before final user rate; channels
 * alone omit resolved time/group policies and therefore remain incomplete.
 */
export function applySub2ApiStationPrice(
  model: ModelPricing,
  groupId: string,
  groupName: string,
  effectiveRate: number,
  catalogs?: Sub2ApiPricingCatalogs,
): ModelPricing | undefined {
  const plazaGroups =
    isRecord(catalogs?.plaza) && Array.isArray(catalogs.plaza.groups)
      ? catalogs.plaza.groups.filter(isRecord)
      : []
  const groups = plazaGroups.filter((group) => String(group.id) === groupId)
  let group = groups[0]
  const candidates: unknown[] =
    group && Array.isArray(group.models)
      ? group.models.filter(
          (item) => isRecord(item) && item.name === model.model_name,
        )
      : []
  let fromChannel = false
  if (!candidates.length && Array.isArray(catalogs?.channels)) {
    for (const channel of catalogs.channels.filter(isRecord)) {
      if (!Array.isArray(channel.platforms)) continue
      for (const section of channel.platforms.filter(isRecord)) {
        if (
          !Array.isArray(section.groups) ||
          !Array.isArray(section.supported_models)
        )
          continue
        const matchedGroup = section.groups.find(
          (item) => isRecord(item) && String(item.id) === groupId,
        )
        if (!isRecord(matchedGroup)) continue
        group = matchedGroup
        candidates.push(
          ...section.supported_models.filter(
            (item) => isRecord(item) && item.name === model.model_name,
          ),
        )
      }
    }
    fromChannel = candidates.length > 0
  }
  if (!candidates.length) return undefined
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [],
  }
  const parsed = modelSchema.safeParse(candidates[0])
  if (
    candidates.length !== 1 ||
    !parsed.success ||
    !group ||
    groups.length > 1
  ) {
    plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
  } else {
    const native = parsed.data
    const price = native.pricing
    const rate = (value: number) => ({
      amount: value * effectiveRate,
      currency: "USD" as const,
      unit: PRICE_RATE_UNITS.TOKEN,
      per: 1,
    })
    if (price.billing_mode === STATION_BILLING_MODES.TOKEN) {
      for (const { meter, price: field } of tokenFields) {
        const value = price[field]
        if (typeof value === "number") plan.rates[meter] = rate(value)
      }
      plan.rates.request = {
        amount: 0,
        currency: "USD",
        unit: PRICE_RATE_UNITS.REQUEST,
        per: 1,
      }
      const intervals = price.intervals ?? []
      if (
        intervals.length &&
        !fromChannel &&
        native.long_context_basis !== "whole_request"
      )
        plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
      let previousEnd = 0
      for (const [index, interval] of intervals.entries()) {
        if (
          interval.min_tokens < previousEnd ||
          (interval.max_tokens != null &&
            interval.max_tokens <= interval.min_tokens)
        ) {
          plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
          break
        }
        previousEnd = interval.max_tokens ?? Infinity
        const rates: PricingPlan["rates"] = { ...plan.rates }
        for (const {
          meter,
          price: field,
          multiplier: multiplierKey,
        } of tokenFields) {
          const value = interval[field]
          const multiplier = interval[multiplierKey]
          if (typeof value === "number") rates[meter] = rate(value)
          else {
            const baseRate = rates[meter]
            if (typeof multiplier === "number" && baseRate)
              rates[meter] = {
                ...baseRate,
                amount: baseRate.amount * multiplier,
              }
          }
        }
        plan.rules.push({
          id: `context-${index + 1}`,
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.RANGE,
              axis: PRICING_RANGE_AXES.INPUT_TOKENS,
              min: interval.min_tokens + 1,
              ...(interval.max_tokens == null
                ? {}
                : { maxExclusive: interval.max_tokens + 1 }),
            },
          ],
          rates,
        })
      }
    } else if (
      price.billing_mode === STATION_BILLING_MODES.PER_REQUEST &&
      price.per_request_price != null &&
      !price.intervals?.length
    ) {
      plan.rates.request = {
        amount: price.per_request_price * effectiveRate,
        currency: "USD",
        unit: PRICE_RATE_UNITS.REQUEST,
        per: 1,
      }
    } else if (price.billing_mode === STATION_BILLING_MODES.IMAGE) {
      plan.usageMode = PRICING_USAGE_MODES.IMAGE
      const multiplier =
        group.image_rate_independent === true
          ? group.image_rate_multiplier
          : effectiveRate
      if (
        typeof multiplier !== "number" ||
        !Number.isFinite(multiplier) ||
        multiplier < 0
      )
        plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
      else {
        const imageRate = (amount: number) => ({
          amount: amount * multiplier,
          currency: "USD" as const,
          unit: PRICE_RATE_UNITS.IMAGE,
          per: 1,
        })
        if (price.per_request_price != null)
          plan.rates.image = imageRate(price.per_request_price)
        const labels = new Set<string>()
        for (const [index, interval] of (price.intervals ?? []).entries()) {
          const label = interval.tier_label?.toLowerCase()
          if (
            !label ||
            ![
              PRICING_IMAGE_SIZES.K1,
              PRICING_IMAGE_SIZES.K2,
              PRICING_IMAGE_SIZES.K4,
            ].some((size) => size === label) ||
            labels.has(label) ||
            interval.per_request_price == null
          ) {
            plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
            continue
          }
          labels.add(label)
          plan.rules.push({
            id: `image-${index}`,
            conditions: [
              {
                kind: PRICING_CONDITION_KINDS.SELECTION,
                axis: PRICING_SELECTION_AXES.IMAGE_SIZE,
                value: label,
              },
            ],
            rates: { image: imageRate(interval.per_request_price) },
          })
        }
      }
    } else {
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    }
    const standardRules = [...plan.rules]
    for (const [index, period] of (
      native.time_pricing?.periods ?? []
    ).entries()) {
      const minute = (value: string) => {
        const match = /^(\d{1,2}):(\d{2})$/.exec(value)
        return match && Number(match[2]) < 60
          ? Number(match[1]) * 60 + Number(match[2])
          : NaN
      }
      const startMinute = minute(period.start_time)
      const endMinute = minute(period.end_time)
      if (
        !Number.isInteger(startMinute) ||
        startMinute > 1439 ||
        !Number.isInteger(endMinute) ||
        endMinute > 1440
      ) {
        plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
        continue
      }
      const condition = {
        kind: PRICING_CONDITION_KINDS.TIME_WINDOW,
        timeZone: native.time_pricing!.timezone,
        startMinute,
        endMinute,
        ...(native.time_pricing!.weekdays_only
          ? { days: [1, 2, 3, 4, 5] }
          : {}),
      }
      for (const rule of [
        { id: "base", conditions: [], rates: plan.rates },
        ...standardRules,
      ]) {
        plan.rules.push({
          id: `time-${index + 1}-${rule.id}`,
          conditions: [...rule.conditions, condition],
          rates: scalePricingRates(rule.rates, period.multiplier),
        })
      }
    }
    // Group peak uses server-global timezone, absent from these public DTOs.
    // group.go PeakMultiplierAt; do not substitute the channel's timezone.
    if (
      price.billing_mode !== STATION_BILLING_MODES.IMAGE &&
      group.peak_rate_enabled &&
      group.subscription_type === "subscription"
    )
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    if (fromChannel)
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
  }
  const admitted = pricingPlanSchema.safeParse(plan).success
    ? plan
    : {
        ...plan,
        rates: {},
        rules: [],
        issues: [{ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE }],
      }
  const perCall =
    parsed.success &&
    [STATION_BILLING_MODES.PER_REQUEST, STATION_BILLING_MODES.IMAGE].some(
      (mode) => mode === parsed.data.pricing.billing_mode,
    )
  return {
    ...model,
    pricingPlan: admitted,
    quota_type: perCall ? 1 : 0,
    enable_groups: [groupName],
    token_price_usd_per_million: {
      input: admitted.rates.input
        ? admitted.rates.input.amount * TOKENS_PER_MILLION
        : undefined,
      output: admitted.rates.output
        ? admitted.rates.output.amount * TOKENS_PER_MILLION
        : undefined,
      cache_read: admitted.rates.cacheRead
        ? admitted.rates.cacheRead.amount * TOKENS_PER_MILLION
        : undefined,
      cache_write: admitted.rates.cacheWrite
        ? admitted.rates.cacheWrite.amount * TOKENS_PER_MILLION
        : undefined,
    },
    price_metadata: {
      source: MODEL_PRICE_SOURCE_KINDS.CHANNEL_PRICING,
      ...(admitted.issues.some(
        (issue) => issue.code === PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
      )
        ? {
            precision: MODEL_PRICE_PRECISION_KINDS.UNAVAILABLE,
            unavailable_reason:
              MODEL_UNAVAILABLE_PRICE_REASONS.PRICING_SOURCE_UNAVAILABLE,
          }
        : { precision: MODEL_PRICE_PRECISION_KINDS.EXACT }),
    },
  }
}
