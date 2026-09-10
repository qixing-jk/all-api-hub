import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_ISSUE_CODES,
  PRICING_METERS,
  PRICING_RANGE_AXES,
  PRICING_SOURCE_KINDS,
} from "~/services/modelPricing/pricingConstants"
import type {
  PriceMeter,
  PricingPlan,
} from "~/services/modelPricing/pricingPlan"
import { isRecord } from "~/utils/core/object"

const fields: Record<string, PriceMeter> = {
  prompt: PRICING_METERS.INPUT,
  completion: PRICING_METERS.OUTPUT,
  input_cache_read: PRICING_METERS.CACHE_READ,
  input_cache_write: PRICING_METERS.CACHE_WRITE,
  input_cache_write_1h: PRICING_METERS.CACHE_WRITE1H,
  request: PRICING_METERS.REQUEST,
  image: PRICING_METERS.IMAGE,
  web_search: PRICING_METERS.SEARCH,
  image_token: PRICING_METERS.IMAGE_INPUT,
  audio: PRICING_METERS.AUDIO_INPUT,
  audio_output: PRICING_METERS.AUDIO_OUTPUT,
  input_audio_cache: PRICING_METERS.AUDIO_CACHE,
  image_output: PRICING_METERS.OUTPUT_IMAGE,
}
const days = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

/** Accept only finite, nonnegative numeric prices from the public catalog. */
function readPrice(value: unknown): number | undefined {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined
}
const clock = (value: unknown): number | undefined =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 2359 &&
  value % 100 < 60
    ? Math.floor(value / 100) * 60 + (value % 100)
    : undefined

/**
 * OpenRouter owns wire semantics; the quote engine receives explicit units and predicates.
 * https://github.com/OpenRouterTeam/docs/blob/516401e777830524f1a6ca63cf45997129a7c727/guides/overview/models.mdx
 * Overrides are ordered per-key, thresholds are strict, UTC days use the request instant.
 */
export function normalizeOpenRouterPricingPlan(value: unknown): PricingPlan {
  const plan: PricingPlan = {
    rates: {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
    source: {
      kind: PRICING_SOURCE_KINDS.CATALOG,
      capturedAt: new Date().toISOString(),
      url: "https://openrouter.ai/models",
    },
    issues: [],
  }
  if (!isRecord(value)) {
    plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    return plan
  }
  // Reasoning tokens are included in billed output tokens, not an extra charge.
  // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
  // Only fold an explicitly equal rate; differing prices need an unknown
  // reasoning/visible-output split. Check overrides in their own price tier.
  const completion = readPrice(value.completion)
  const reasoning = readPrice(value.internal_reasoning)
  const stableReasoningRate =
    completion !== undefined &&
    reasoning !== undefined &&
    (value.overrides === undefined ||
      (Array.isArray(value.overrides) &&
        value.overrides.every(
          (raw) =>
            isRecord(raw) &&
            (!Object.hasOwn(raw, "internal_reasoning") ||
              readPrice(raw.internal_reasoning) === reasoning),
        )))
  const readRates = (record: Record<string, unknown>) => {
    const rates: PricingPlan["rates"] = {}
    for (const [key, meter] of Object.entries(fields)) {
      const raw = record[key]
      if (raw === undefined) continue
      const amount =
        typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : typeof raw === "number"
            ? raw
            : NaN
      if (!Number.isFinite(amount) || amount < 0) {
        plan.issues.push({
          code:
            amount === -1
              ? PRICING_ISSUE_CODES.PRICE_UNAVAILABLE
              : PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
          meters: [meter],
        })
        continue
      }
      rates[meter] = {
        amount,
        currency: "USD",
        unit:
          meter === PRICING_METERS.REQUEST
            ? PRICE_RATE_UNITS.REQUEST
            : meter === PRICING_METERS.IMAGE ||
                meter === PRICING_METERS.OUTPUT_IMAGE
              ? PRICE_RATE_UNITS.IMAGE
              : meter === PRICING_METERS.SEARCH
                ? PRICE_RATE_UNITS.SEARCH
                : PRICE_RATE_UNITS.TOKEN,
        per: 1,
      }
    }
    const unsupportedMeters: Record<string, PriceMeter[]> = {
      internal_reasoning: [PRICING_METERS.OUTPUT],
    }
    for (const key of Object.keys(record)) {
      if (key === "internal_reasoning" && stableReasoningRate) continue
      if (
        !Object.hasOwn(fields, key) &&
        ![
          "overrides",
          "min_prompt_tokens",
          "utc_start",
          "utc_end",
          "utc_days",
          "discount",
        ].includes(key)
      ) {
        if (record[key] !== "0" && record[key] !== 0)
          plan.issues.push({
            code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
            ...(Object.hasOwn(unsupportedMeters, key)
              ? { meters: unsupportedMeters[key] }
              : {}),
          })
      }
    }
    // Absent override keys inherit the base reasoning rate. Keep uncertainty
    // on this output rate so a later uniform tier can replace it.
    if (
      stableReasoningRate &&
      rates.output &&
      rates.output.amount !== reasoning
    )
      rates.output.unverifiedReason = PRICING_ISSUE_CODES.OUTPUT_TOKEN_MIX
    return rates
  }
  plan.rates = readRates(value)
  if (value.overrides === undefined) return plan
  if (!Array.isArray(value.overrides)) {
    plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
    return plan
  }
  const scheduledMeters = new Set<PriceMeter>()
  for (const [index, raw] of value.overrides.entries()) {
    if (!isRecord(raw)) {
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
      continue
    }
    const rates = readRates(raw)
    const conditions: PricingPlan["rules"][number]["conditions"] = []
    let valid = Object.keys(raw).every(
      (key) =>
        Object.hasOwn(fields, key) ||
        ["min_prompt_tokens", "utc_start", "utc_end", "utc_days"].includes(key),
    )
    if (raw.min_prompt_tokens !== undefined) {
      if (
        typeof raw.min_prompt_tokens !== "number" ||
        !Number.isSafeInteger(raw.min_prompt_tokens) ||
        raw.min_prompt_tokens < 0 ||
        !Number.isSafeInteger(raw.min_prompt_tokens + 1)
      )
        valid = false
      else
        conditions.push({
          kind: PRICING_CONDITION_KINDS.RANGE,
          axis: PRICING_RANGE_AXES.INPUT_TOKENS,
          min: raw.min_prompt_tokens + 1,
        })
    }
    if (
      raw.utc_start !== undefined ||
      raw.utc_end !== undefined ||
      raw.utc_days !== undefined
    ) {
      const start =
        raw.utc_start === undefined && raw.utc_end === undefined
          ? 0
          : clock(raw.utc_start)
      const end =
        raw.utc_start === undefined && raw.utc_end === undefined
          ? 0
          : clock(raw.utc_end)
      const weekdays = Array.isArray(raw.utc_days)
        ? raw.utc_days.map((day) => days.indexOf(String(day)))
        : undefined
      if (
        start === undefined ||
        end === undefined ||
        (raw.utc_days !== undefined &&
          (!weekdays || !weekdays.length || weekdays.includes(-1)))
      )
        valid = false
      else
        conditions.push({
          kind: PRICING_CONDITION_KINDS.UTC_WINDOW,
          startMinute: start,
          endMinute: end,
          ...(weekdays ? { days: weekdays } : {}),
        })
      for (const meter of Object.values(fields))
        if (rates[meter]) scheduledMeters.add(meter)
    }
    if (!valid || conditions.length === 0) {
      plan.issues.push({ code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE })
      continue
    }
    plan.rules.push({ id: `override-${index}`, conditions, rates })
  }
  // Scheduled top-level values reflect response time, not a timeless base.
  for (const meter of scheduledMeters) delete plan.rates[meter]
  return plan
}
