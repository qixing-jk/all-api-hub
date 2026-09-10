import { z } from "zod"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_MEASUREMENT_AXES,
  PRICING_METERS,
  type PRICING_PURPOSES,
  PRICING_RANGE_AXES,
  type PRICING_RESPONSE_FORMATS,
  PRICING_SELECTION_AXES,
  PRICING_SERVICE_TIERS,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  type QUOTE_STATUSES,
  type QUOTE_UNITS,
} from "~/services/modelPricing/pricingConstants"

import { type PRICING_IMAGE_SIZES, type PRICING_VIDEO_INPUTS } from "./pricingConstants"

export const SERVICE_TIERS = [
  PRICING_SERVICE_TIERS.STANDARD,
  PRICING_SERVICE_TIERS.FLEX,
  PRICING_SERVICE_TIERS.PRIORITY,
  PRICING_SERVICE_TIERS.FAST,
  PRICING_SERVICE_TIERS.ULTRAFAST,
  PRICING_SERVICE_TIERS.BATCH,
] as const
const serviceTierSchema = z.enum(SERVICE_TIERS)

export const PRICE_METERS = [
  PRICING_METERS.VIDEO_OUTPUT,
  PRICING_METERS.INPUT,
  PRICING_METERS.OUTPUT,
  PRICING_METERS.CACHE_READ,
  PRICING_METERS.CACHE_WRITE,
  PRICING_METERS.CACHE_WRITE1H,
  PRICING_METERS.IMAGE_INPUT,
  PRICING_METERS.IMAGE_OUTPUT,
  PRICING_METERS.AUDIO_INPUT,
  PRICING_METERS.AUDIO_OUTPUT,
  PRICING_METERS.AUDIO_CACHE,
  PRICING_METERS.OUTPUT_IMAGE,
  PRICING_METERS.REQUEST,
  PRICING_METERS.IMAGE,
  PRICING_METERS.AUDIO,
  PRICING_METERS.SEARCH,
  PRICING_METERS.CHARACTERS,
  PRICING_METERS.VIDEO_SECONDS,
  PRICING_METERS.REFERENCE_IMAGE,
  PRICING_METERS.SEARCH_UNITS,
  PRICING_METERS.PAGES,
  PRICING_METERS.OUTPUT_MEGAPIXELS,
] as const
export const TOKEN_METERS = [
  PRICING_METERS.VIDEO_OUTPUT,
  PRICING_METERS.INPUT,
  PRICING_METERS.OUTPUT,
  PRICING_METERS.CACHE_READ,
  PRICING_METERS.CACHE_WRITE,
  PRICING_METERS.CACHE_WRITE1H,
  PRICING_METERS.IMAGE_INPUT,
  PRICING_METERS.IMAGE_OUTPUT,
  PRICING_METERS.AUDIO_INPUT,
  PRICING_METERS.AUDIO_OUTPUT,
  PRICING_METERS.AUDIO_CACHE,
] as const
export type PriceMeter = (typeof PRICE_METERS)[number]
const nonnegative = z.number().finite().nonnegative()
/** Cache counters share the same exclusion semantics in token conditions. */
export const CACHE_TOKEN_METERS = [
  PRICING_METERS.CACHE_READ,
  PRICING_METERS.CACHE_WRITE,
  PRICING_METERS.CACHE_WRITE1H,
] as const

export const INPUT_TOKEN_METERS = [
  PRICING_METERS.INPUT,
  PRICING_METERS.CACHE_READ,
  PRICING_METERS.CACHE_WRITE,
  PRICING_METERS.CACHE_WRITE1H,
  PRICING_METERS.IMAGE_INPUT,
  PRICING_METERS.AUDIO_INPUT,
] as const
const inputDeductionsSchema = z.array(z.enum(INPUT_TOKEN_METERS))
export const OUTPUT_TOKEN_METERS = [
  PRICING_METERS.OUTPUT,
  PRICING_METERS.IMAGE_OUTPUT,
  PRICING_METERS.AUDIO_OUTPUT,
] as const
const outputDeductionsSchema = z.array(z.enum(OUTPUT_TOKEN_METERS))
const rateSchema = z.strictObject({
  /** Published rate cannot represent the whole meter without a usage split. */
  unverifiedReason: z.literal(PRICING_ISSUE_CODES.OUTPUT_TOKEN_MIX).optional(),
  amount: nonnegative,
  currency: z.enum(["USD", "CNY"]),
  unit: z.enum(PRICE_RATE_UNITS),
  per: z.number().finite().positive(),
  /** Allowance per task, deducted from measured quantity before applying the rate. */
  freeQuantity: nonnegative.optional(),
})
/** Shared meter units keep adapters, validation and settlement consistent. */
export function getPriceMeterUnit(meter: PriceMeter) {
  if (TOKEN_METERS.some((token) => token === meter))
    return PRICE_RATE_UNITS.TOKEN
  if (meter === PRICING_METERS.AUDIO || meter === PRICING_METERS.VIDEO_SECONDS)
    return PRICE_RATE_UNITS.SECOND
  if (
    meter === PRICING_METERS.OUTPUT_IMAGE ||
    meter === PRICING_METERS.REFERENCE_IMAGE
  )
    return PRICE_RATE_UNITS.IMAGE
  if (meter === PRICING_METERS.PAGES) return PRICE_RATE_UNITS.PAGE
  if (meter === PRICING_METERS.OUTPUT_MEGAPIXELS)
    return PRICE_RATE_UNITS.MEGAPIXEL
  if (meter === PRICING_METERS.CHARACTERS) return PRICE_RATE_UNITS.CHARACTER
  if (meter === PRICING_METERS.SEARCH_UNITS) return PRICE_RATE_UNITS.SEARCH_UNIT
  return meter
}
const ratesSchema = z
  .partialRecord(z.enum(PRICE_METERS), rateSchema)
  .superRefine((rates, context) => {
    for (const meter of PRICE_METERS) {
      const rate = rates[meter]
      const unit = getPriceMeterUnit(meter)
      if (rate && rate.unit !== unit)
        context.addIssue({
          code: "custom",
          path: [meter, "unit"],
          message: "Price meter and unit disagree",
        })
    }
  })
const timeZoneSchema = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value })
    return true
  } catch {
    return false
  }
})

export const pricingPlanSchema = z.strictObject({
  rates: ratesSchema,
  /** A comparable output quantity; other task meters are never token weights. */
  comparison: z
    .strictObject({
      meter: z.enum([
        PRICING_METERS.CHARACTERS,
        PRICING_METERS.VIDEO_SECONDS,
        PRICING_METERS.SEARCH_UNITS,
        PRICING_METERS.IMAGE,
        PRICING_METERS.AUDIO,
        PRICING_METERS.PAGES,
        PRICING_METERS.OUTPUT_MEGAPIXELS,
      ]),
    })
    .optional(),
  serviceTiers: z.array(serviceTierSchema).optional(),
  usageMode: z.enum(PRICING_USAGE_MODES).optional(),
  rules: z.array(
    z.strictObject({
      id: z.string().min(1),
      conditions: z.array(
        z.discriminatedUnion("kind", [
          z.strictObject({
            kind: z.literal(PRICING_CONDITION_KINDS.CALENDAR),
            part: z.enum(["hour", "minute", "weekday", "month", "day"]),
            timeZone: timeZoneSchema,
            operator: z.enum(["==", ">=", "<=", ">", "<"]),
            value: nonnegative.int().max(60),
          }),
          z.strictObject({
            kind: z.literal(PRICING_CONDITION_KINDS.SELECTION),
            axis: z.enum(PRICING_SELECTION_AXES),
            value: z.string().min(1),
          }),
          z.strictObject({
            kind: z.literal(PRICING_CONDITION_KINDS.MEASUREMENT),
            axis: z.literal(PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS),
            gt: nonnegative.optional(),
            lte: nonnegative.optional(),
          }),
          z.strictObject({
            kind: z.literal(PRICING_CONDITION_KINDS.RANGE),
            axis: z.enum(PRICING_RANGE_AXES),
            inputTokenDeductions: z
              .strictObject({
                openai: inputDeductionsSchema,
                anthropic: inputDeductionsSchema,
              })
              .optional(),
            outputTokenDeductions: z
              .strictObject({
                openai: outputDeductionsSchema,
                anthropic: outputDeductionsSchema,
              })
              .optional(),
            min: nonnegative.int().max(Number.MAX_SAFE_INTEGER).optional(),
            maxExclusive: nonnegative
              .int()
              .max(Number.MAX_SAFE_INTEGER)
              .optional(),
          }),
          z
            .strictObject({
              kind: z.literal(PRICING_CONDITION_KINDS.DATE_WINDOW),
              start: z.iso.datetime({ offset: true }),
              end: z.iso.datetime({ offset: true }).optional(),
            })
            .refine(
              (value) =>
                !value.end || Date.parse(value.end) > Date.parse(value.start),
            ),
          z.strictObject({
            kind: z.literal(PRICING_CONDITION_KINDS.TIME_WINDOW),
            timeZone: timeZoneSchema,
            startMinute: nonnegative.int().max(1439),
            endMinute: nonnegative.int().max(1440),
            days: z.array(z.number().int().min(0).max(6)).optional(),
          }),
          z.strictObject({
            kind: z.literal(PRICING_CONDITION_KINDS.UTC_WINDOW),
            startMinute: nonnegative.int().max(1439),
            endMinute: nonnegative.int().max(1439),
            days: z.array(z.number().int().min(0).max(6)).optional(),
          }),
        ]),
      ),
      rates: ratesSchema,
    }),
  ),
  requiresRuleMatch: z.boolean().optional(),
  limits: z
    .strictObject({
      inputTokens: nonnegative.int().optional(),
      outputTokens: nonnegative.int().optional(),
      totalTokens: nonnegative.int().optional(),
    })
    .optional(),
  source: z.strictObject({
    kind: z.enum(PRICING_SOURCE_KINDS),
    label: z.string().optional(),
    rulesUnavailable: z.boolean().optional(),
    hasUnpricedCharges: z.boolean().optional(),
    pricingDescription: z
      .object({ zh: z.string().optional(), en: z.string().optional() })
      .optional(),
    capturedAt: z.string().optional(),
    conversion: z
      .strictObject({
        originalCurrency: z.literal("CNY"),
        cnyPerUsd: z.number().finite().positive(),
      })
      .optional(),
    url: z
      .url()
      .refine((value) => ["https:", "http:"].includes(new URL(value).protocol))
      .optional(),
  }),
  groupMultiplier: z.enum(PRICING_GROUP_MULTIPLIERS),
  issues: z.array(
    z.strictObject({
      code: z.enum([
        PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
        PRICING_ISSUE_CODES.UNVERIFIED_AXIS,
        PRICING_ISSUE_CODES.UNKNOWN_FEES,
        PRICING_ISSUE_CODES.PRICE_UNAVAILABLE,
        PRICING_ISSUE_CODES.SOURCE_UNAVAILABLE,
      ]),
      reason: z.enum(PRICING_ISSUE_REASONS).optional(),
      meters: z.array(z.enum(PRICE_METERS)).optional(),
    }),
  ),
})
export type PricingPlan = z.infer<typeof pricingPlanSchema>
export type PriceRate = z.infer<typeof rateSchema>
export interface PricingScenario {
  purpose: (typeof PRICING_PURPOSES)[keyof typeof PRICING_PURPOSES]
  serviceTier?: (typeof SERVICE_TIERS)[number]
  responseFormat?: (typeof PRICING_RESPONSE_FORMATS)[keyof typeof PRICING_RESPONSE_FORMATS]
  imageSize?: (typeof PRICING_IMAGE_SIZES)[keyof typeof PRICING_IMAGE_SIZES]
  videoInput?: (typeof PRICING_VIDEO_INPUTS)[keyof typeof PRICING_VIDEO_INPUTS]
  imageQuality?: string
  videoQuality?: string
  imageMegapixels?: number
  inputTokens?: number
  outputTokens?: number
  at?: string
  usage: Partial<Record<PriceMeter, number | null>>
  /** Actual task quantities used to amortize independent fees in unit comparisons. */
  taskUsage?: Partial<Record<PriceMeter, number | null>>
}
export interface PricingCostContext {
  groupMultiplier?: number
  currency?: "USD" | "CNY"
  cnyPerUsd?: number
}
export interface QuoteResult {
  /** Safe numeric/time context for explaining quote failures, not request payloads. */
  requirementDetails?: {
    axis:
      | "imageMegapixels"
      | "inputTokens"
      | "outputTokens"
      | "totalTokens"
      | "at"
      | PriceMeter
    value?: number | string | null
    kind: "quantity" | "range" | "time"
    ranges?: {
      min?: number
      max?: number
      minExclusive?: boolean
      maxExclusive?: boolean
    }[]
  }[]
  /** Actionable selection gaps, using only product-owned condition axes. */
  conditionDetails?: {
    axis: (typeof PRICING_SELECTION_AXES)[keyof typeof PRICING_SELECTION_AXES]
    selected?: string
    available: string[]
  }[]
  status: (typeof QUOTE_STATUSES)[keyof typeof QUOTE_STATUSES]
  amount: number | null
  currency: "USD" | "CNY"
  unit: (typeof QUOTE_UNITS)[keyof typeof QUOTE_UNITS]
  /** Actual factors and denominator used by the quote, including missing-price weights. */
  calculation?: {
    groupMultiplier: number
    cnyPerUsd?: number
    totalWeight?: number
    comparisonQuantity?: number
  }
  /** Source prices retained even when a scenario or conversion cannot be quoted. */
  publishedSchedule?: PricingPlan["rules"]
  schedule: PricingPlan["rules"]
  lines: {
    meter: PriceMeter
    quantity: number
    billableQuantity?: number
    rate: PriceRate
    amount: number
    effectiveUnitRate?: number
  }[]
  matchedRules: PricingPlan["rules"]
  issues: { code: string; meter?: PriceMeter }[]
  source: PricingPlan["source"]
}
