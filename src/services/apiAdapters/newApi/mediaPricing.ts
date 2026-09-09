import { z } from "zod"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_CODES,
  PRICING_ISSUE_REASONS,
  PRICING_METERS,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
  PRICING_VIDEO_INPUTS,
  TOKENS_PER_MILLION,
} from "~/services/modelPricing/pricingConstants"
import type { PricingPlan } from "~/services/modelPricing/pricingPlan"
import { normalizeVideoQuality } from "~/services/modelPricing/videoQuality"
import { isRecord } from "~/utils/core/object"

import { parseMediaPriceExpression } from "./mediaPriceExpression"

const MEDIA_KINDS = { IMAGE: "image", VIDEO: "video" } as const
const MEDIA_UNITS = {
  IMAGE: "image",
  SECOND: "second",
  MILLION_OUTPUT_TOKENS: "million_output_tokens",
} as const

const presentationSchema = z.strictObject({
  kind: z.enum(MEDIA_KINDS),
  settlement: z.literal("actual_result"),
  items: z
    .array(
      z.strictObject({
        key: z.string().min(1),
        amount: z.number().finite().nonnegative(),
        unit: z.enum(MEDIA_UNITS),
        resolution: z.string().min(1).optional(),
        video_input: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(128),
})

/**
 * Deployment extension observed at https://infistar.ai/api/pricing (2026-09-09).
 * This is NOT official New API v1/task-usage syntax (pkg/billingexpr/expr.md).
 * Require the complete v2 envelope and matching table; translate only certified
 * facts into shared meters/conditions. Never infer semantics from model names.
 */
export function parseNewApiMediaPricing(
  row: Record<string, unknown>,
): PricingPlan | undefined {
  const presentation = row.price_presentation
  if (
    !isRecord(presentation) ||
    !Object.values(MEDIA_KINDS).some(
      (kind) => kind === String(presentation.kind),
    )
  )
    return undefined
  // Presentation-only metadata must not override the native request contract.
  if (
    presentation.settlement === "request" &&
    row.quota_type === 1 &&
    row.billing_mode !== "tiered_expr" &&
    row.billing_usage_schema == null
  )
    return undefined
  // Official task schemas own their semantics even if an extension is also present.
  if (row.billing_usage_schema != null) return undefined
  if (
    row.billing_mode === "tiered_expr" &&
    typeof row.billing_expr === "string" &&
    !row.billing_expr.trim().startsWith("v2:")
  )
    return undefined
  const plan: PricingPlan = {
    usageMode:
      presentation.kind === MEDIA_KINDS.IMAGE
        ? PRICING_USAGE_MODES.IMAGE
        : PRICING_USAGE_MODES.CUSTOM,
    rates: {},
    rules: [],
    groupMultiplier: PRICING_GROUP_MULTIPLIERS.PENDING,
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT, rulesUnavailable: true },
    issues: [
      {
        code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
        reason: PRICING_ISSUE_REASONS.PRICE_EXPRESSION,
      },
    ],
  }
  const parsed = presentationSchema.safeParse(presentation)
  if (!parsed.success) return plan
  const { kind, items } = parsed.data
  const unit = items[0].unit
  if (
    items.some((item) => item.unit !== unit) ||
    (kind === MEDIA_KINDS.IMAGE) !== (unit === MEDIA_UNITS.IMAGE)
  )
    return plan
  const meter =
    unit === MEDIA_UNITS.IMAGE
      ? PRICING_METERS.IMAGE
      : unit === MEDIA_UNITS.SECOND
        ? PRICING_METERS.VIDEO_SECONDS
        : PRICING_METERS.VIDEO_OUTPUT
  plan.usageMode =
    unit === MEDIA_UNITS.IMAGE
      ? PRICING_USAGE_MODES.IMAGE
      : unit === MEDIA_UNITS.SECOND
        ? PRICING_USAGE_MODES.METERED
        : PRICING_USAGE_MODES.VIDEO
  if (unit === MEDIA_UNITS.SECOND)
    plan.comparison = { meter: PRICING_METERS.VIDEO_SECONDS }
  if (
    items.some(
      (item) =>
        kind === MEDIA_KINDS.IMAGE &&
        (item.video_input !== undefined ||
          (item.resolution !== undefined &&
            ![
              PRICING_IMAGE_SIZES.K1,
              PRICING_IMAGE_SIZES.K2,
              PRICING_IMAGE_SIZES.K3,
              PRICING_IMAGE_SIZES.K4,
            ].some((size) => size === item.resolution))),
    )
  )
    return plan
  const keys = new Set(items.map((item) => item.key))
  const signatures = new Set(
    items.map((item) =>
      JSON.stringify([
        kind === MEDIA_KINDS.VIDEO && item.resolution
          ? normalizeVideoQuality(item.resolution)
          : item.resolution,
        item.video_input,
      ]),
    ),
  )
  if (keys.size !== items.length || signatures.size !== items.length)
    return plan
  plan.rules = items.map((item) => ({
    id: item.key,
    conditions: [
      ...(item.resolution === undefined
        ? []
        : [
            {
              kind: PRICING_CONDITION_KINDS.SELECTION,
              axis:
                kind === MEDIA_KINDS.IMAGE
                  ? PRICING_SELECTION_AXES.IMAGE_SIZE
                  : PRICING_SELECTION_AXES.VIDEO_QUALITY,
              value:
                kind === MEDIA_KINDS.VIDEO
                  ? normalizeVideoQuality(item.resolution)
                  : item.resolution,
            },
          ]),
      ...(item.video_input === undefined
        ? []
        : [
            {
              kind: PRICING_CONDITION_KINDS.SELECTION,
              axis: PRICING_SELECTION_AXES.VIDEO_INPUT,
              value: item.video_input
                ? PRICING_VIDEO_INPUTS.WITH_VIDEO
                : PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
            },
          ]),
    ],
    rates: {
      [meter]: {
        amount: item.amount,
        currency: "USD",
        unit:
          unit === MEDIA_UNITS.MILLION_OUTPUT_TOKENS
            ? PRICE_RATE_UNITS.TOKEN
            : unit,
        per:
          unit === MEDIA_UNITS.MILLION_OUTPUT_TOKENS ? TOKENS_PER_MILLION : 1,
      },
    },
  }))
  // Some extension deployments retain quota_type=1 for flat image models;
  // their explicit actual-result expression still bills output images.
  if (
    (row.quota_type !== 0 && row.quota_type !== 1) ||
    row.billing_mode !== "tiered_expr" ||
    typeof row.billing_expr !== "string" ||
    row.billing_expr.length > 16000
  )
    return plan
  const outer = /^v2:\s*tier\(\s*"[^"\\]+"\s*,\s*([\s\S]+)\)\s*$/.exec(
    row.billing_expr.trim(),
  )
  if (!outer) return plan
  const body =
    unit === MEDIA_UNITS.MILLION_OUTPUT_TOKENS
      ? /^c\s*\*\s*([\s\S]+)$/.exec(outer[1])?.[1]
      : new RegExp(
          `^unit\\(\\s*${unit === MEDIA_UNITS.IMAGE ? "outputs" : "seconds"}\\s*,\\s*([\\s\\S]+)\\)\\s*$`,
        ).exec(outer[1])?.[1]
  const expression = body && parseMediaPriceExpression(body)
  if (!expression) return plan
  const resolutions = new Set(items.map((item) => item.resolution))
  const videoInputs = new Set(items.map((item) => item.video_input))
  if (
    expression.resolutions.size
      ? resolutions.has(undefined) ||
        [...expression.resolutions].some((value) => !resolutions.has(value))
      : resolutions.size !== 1 || !resolutions.has(undefined)
  )
    return plan
  if (
    expression.usesVideoInput
      ? videoInputs.size !== 2 || videoInputs.has(undefined)
      : videoInputs.size !== 1 || !videoInputs.has(undefined)
  )
    return plan
  if (items.length !== resolutions.size * videoInputs.size) return plan
  if (
    items.some((item) => {
      const amount = expression.evaluate(item)
      return (
        Math.abs(amount - item.amount) >
        Number.EPSILON * 4 * Math.max(amount, item.amount)
      )
    })
  ) {
    plan.issues = [
      {
        code: PRICING_ISSUE_CODES.UNSUPPORTED_RULE,
        reason: PRICING_ISSUE_REASONS.SOURCE_CONFLICT,
      },
    ]
    return plan
  }
  return {
    ...plan,
    source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
    issues: [],
    requiresRuleMatch: true,
  }
}
