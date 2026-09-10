import { z } from "zod"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_SOURCE_KINDS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import {
  pricingPlanSchema,
  type PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { scalePricingRates } from "~/services/modelPricing/pricingRates"

const promotionSchema = z.strictObject({
  name: z.string().optional(),
  off_percent: z.coerce.number().min(1).max(99),
  time_type: z.enum(["daily", "weekly", "absolute"]),
  absolute: z
    .object({
      start: z.iso.datetime({ offset: true }),
      end: z.iso.datetime({ offset: true }).nullish(),
    })
    .optional(),
  daily: z.object({ ranges: z.array(z.string()) }).optional(),
  weekly: z
    .array(
      z.object({
        weekdays: z.array(z.number().int().min(1).max(7)),
        ranges: z.array(z.string()),
      }),
    )
    .optional(),
})

/**
 * Published catalog prices are before promotion; all activity windows use UTC.
 * https://aihubmix.com/static/legacy-shell-CkN7iHI2.js promotionActive/parseTimeRange
 * Daily 00:00-23:59 is all-day; weekly overnight windows belong to their start day.
 * Verified against https://aihubmix.com/model/glm-5.2 on 2026-09-08.
 */
export function buildAIHubMixPricingPlan(
  pricing?: Record<string, unknown>,
  promotion?: unknown,
): PricingPlan | undefined {
  if (!pricing) return undefined
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    source: {
      kind: PRICING_SOURCE_KINDS.CATALOG,
      url: "https://aihubmix.com/api/v1/models",
    },
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    issues: [
      {
        code: PRICING_ISSUE_CODES.UNKNOWN_FEES,
        meters: [PRICING_METERS.REQUEST],
      },
    ],
  }
  for (const [field, meter] of Object.entries({
    input: PRICING_METERS.INPUT,
    output: PRICING_METERS.OUTPUT,
    cache_read: PRICING_METERS.CACHE_READ,
    cache_write: PRICING_METERS.CACHE_WRITE,
  })) {
    const raw = pricing[field]
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
    plan.rates[meter] = {
      amount,
      currency: "USD",
      unit: PRICE_RATE_UNITS.TOKEN,
      per: TOKENS_PER_MILLION,
    }
  }
  if (promotion != null) {
    const parsed = promotionSchema.safeParse(promotion)
    if (!parsed.success)
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    else {
      const promo = parsed.data
      const entries =
        promo.time_type === "daily"
          ? promo.daily
            ? [{ ranges: promo.daily.ranges, weekdays: undefined }]
            : undefined
          : promo.time_type === "weekly"
            ? promo.weekly
            : undefined
      if (!entries?.length && promo.time_type !== "absolute")
        plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
      const rates = scalePricingRates(plan.rates, 1 - promo.off_percent / 100)
      if (promo.time_type === "absolute" && promo.absolute) {
        plan.rules.push({
          id: "promotion-absolute",
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.DATE_WINDOW,
              start: promo.absolute.start,
              ...(promo.absolute.end ? { end: promo.absolute.end } : {}),
            },
          ],
          rates,
        })
      }
      if (promo.time_type === "absolute" && !promo.absolute)
        plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
      const append = (
        startMinute: number,
        endMinute: number,
        days?: number[],
      ) =>
        plan.rules.push({
          id: `promotion-${plan.rules.length + 1}`,
          conditions: [
            {
              kind: PRICING_CONDITION_KINDS.TIME_WINDOW,
              timeZone: "UTC",
              startMinute,
              endMinute,
              ...(days ? { days } : {}),
            },
          ],
          rates,
        })
      for (const entry of entries ?? []) {
        for (const range of entry.ranges) {
          const match = /^(\d{1,2}):(\d{1,2})-(\d{1,2}):(\d{1,2})$/.exec(
            range.trim(),
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
          const start = Number(match[1]) * 60 + Number(match[2]),
            end = Number(match[3]) * 60 + Number(match[4])
          const days = entry.weekdays?.map((day) => day % 7)
          if (!days && start === 0 && end === 1439) append(0, 1440)
          else if (start < end) append(start, end, days)
          else if (start > end) {
            append(start, 1440, days)
            if (end > 0)
              append(
                0,
                end,
                days?.map((day) => (day + 1) % 7),
              )
          }
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
