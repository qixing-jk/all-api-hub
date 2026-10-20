import { z } from "zod"

import {
  PRICING_METERS,
  QUOTE_STATUSES,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import { quotaAssetSchema } from "~/services/quotaAssets/quotaAsset"

/** Runtime values shared by quota plan validation, evaluation and presentation. */
export const QUOTA_QUOTE_STATUSES = {
  Complete: QUOTE_STATUSES.COMPLETE,
  Reference: "reference",
  Unavailable: QUOTE_STATUSES.UNAVAILABLE,
} as const

export const QUOTA_QUOTE_REASONS = {
  InvalidPlan: "invalid-plan",
  InvalidUsage: "invalid-usage",
  MissingRate: "missing-rate",
} as const

export const QUOTA_COMPARISON_SCOPES = {
  Source: "source",
  Unit: "unit",
} as const

export const QUOTA_ROUNDING_MODES = {
  Floor: "floor",
  None: "none",
} as const

const quotaMeters = [
  PRICING_METERS.INPUT,
  PRICING_METERS.OUTPUT,
  PRICING_METERS.CACHE_READ,
  PRICING_METERS.CACHE_WRITE,
] as const

const nonnegative = z.number().finite().nonnegative()

/** Quota assets have their own identity; matching labels do not imply equivalence. */
export const quotaPricingPlanSchema = z.strictObject({
  unit: quotaAssetSchema,
  /** Amount of the atomic quota asset consumed per measured model Token. */
  rates: z
    .partialRecord(
      z.enum(quotaMeters),
      z.strictObject({
        amount: nonnegative,
        per: z.number().finite().positive(),
      }),
    )
    .refine((rates) => Object.keys(rates).length > 0),
  adjustments: z
    .array(
      z.strictObject({
        id: z.string().trim().min(1),
        label: z.strictObject({
          en: z.string().min(1),
          zh: z.string().min(1).optional(),
        }),
        multiplier: nonnegative.optional(),
      }),
    )
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
    ),
  /** Reference rates with unresolved adjustments can only compare within a source. */
  comparisonScope: z.enum(QUOTA_COMPARISON_SCOPES),
  rounding: z.enum(QUOTA_ROUNDING_MODES),
  sourceUrl: z.url({ protocol: /^https?$/ }),
})

export type QuotaPricingPlan = z.infer<typeof quotaPricingPlanSchema>

export type QuotaUsage = Partial<
  Record<keyof QuotaPricingPlan["rates"], number | null>
>

export interface QuotaQuote {
  status: (typeof QUOTA_QUOTE_STATUSES)[keyof typeof QUOTA_QUOTE_STATUSES]
  baseAmount: number | null
  amount: number | null
  missingAdjustments: string[]
  reason?: (typeof QUOTA_QUOTE_REASONS)[keyof typeof QUOTA_QUOTE_REASONS]
}

/** Quotes quota directly, without exchange rates or invented adjustment values. */
export function quoteQuotaUsage(
  input: QuotaPricingPlan,
  usage: QuotaUsage,
  options: {
    comparison?: boolean
    adjustments?: Record<string, number | undefined>
  } = {},
): QuotaQuote {
  const result: QuotaQuote = {
    status: QUOTA_QUOTE_STATUSES.Unavailable,
    baseAmount: null,
    amount: null,
    missingAdjustments: [],
  }
  const parsed = quotaPricingPlanSchema.safeParse(input)
  if (!parsed.success)
    return { ...result, reason: QUOTA_QUOTE_REASONS.InvalidPlan }
  const plan = parsed.data
  let total = 0
  let quantity = 0
  for (const meter of quotaMeters) {
    const value = usage[meter] === undefined ? 0 : usage[meter]
    if (options.comparison && value == null) continue
    if (
      value == null ||
      !Number.isFinite(value) ||
      value < 0 ||
      (!options.comparison && !Number.isSafeInteger(value))
    )
      return { ...result, reason: QUOTA_QUOTE_REASONS.InvalidUsage }
    if (value === 0) continue
    const rate = plan.rates[meter]
    if (!rate) return { ...result, reason: QUOTA_QUOTE_REASONS.MissingRate }
    total += (value * rate.amount) / rate.per
    quantity += value
  }
  if (options.comparison) {
    if (!(quantity > 0) || !Number.isFinite(quantity))
      return { ...result, reason: QUOTA_QUOTE_REASONS.InvalidUsage }
    total = (total / quantity) * TOKENS_PER_MILLION
  }
  if (
    !Number.isFinite(total) ||
    (!options.comparison && total > Number.MAX_SAFE_INTEGER)
  )
    return { ...result, reason: QUOTA_QUOTE_REASONS.InvalidUsage }
  let multiplier = 1
  for (const adjustment of plan.adjustments) {
    const value = options.adjustments?.[adjustment.id] ?? adjustment.multiplier
    if (value === undefined) result.missingAdjustments.push(adjustment.id)
    else if (!Number.isFinite(value) || value < 0)
      return { ...result, reason: QUOTA_QUOTE_REASONS.InvalidUsage }
    else multiplier *= value
  }
  const amount = total * multiplier
  if (
    !Number.isFinite(amount) ||
    (!options.comparison && amount > Number.MAX_SAFE_INTEGER)
  )
    return { ...result, reason: QUOTA_QUOTE_REASONS.InvalidUsage }
  return {
    status: result.missingAdjustments.length
      ? QUOTA_QUOTE_STATUSES.Reference
      : QUOTA_QUOTE_STATUSES.Complete,
    baseAmount: total,
    amount: result.missingAdjustments.length
      ? null
      : !options.comparison && plan.rounding === QUOTA_ROUNDING_MODES.Floor
        ? Math.floor(amount)
        : amount,
    missingAdjustments: result.missingAdjustments,
  }
}
