import { z } from "zod"

import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import {
  getNeedleCoordinateKey,
  isSameNeedleCoordinate,
} from "~/services/verification/modelQuality/needlePlan"

import {
  NEEDLE_DEFAULTS as defaults,
  NEEDLE_OUTCOMES,
  NEEDLE_PLAN_SOURCES,
  NEEDLE_RUN_REASONS,
} from "./needleConstants"
import type { NeedleResult } from "./needleRun"

const count = z.number().int().nonnegative()
const tokens = count.max(defaults.maxInputTokens)
const coordinate = z.object({
  targetTokens: tokens,
  depth: z.union([
    z.literal(defaults.depths[0]),
    z.literal(defaults.depths[1]),
    z.literal(defaults.depths[2]),
  ]),
})
const counter = z.object({
  encoding: z.enum(CONTEXT_TOKEN_ENCODINGS),
  estimated: z.boolean(),
  declaredContext: count.optional(),
  declaredInput: count.optional(),
  declaredOutput: count.optional(),
})
const resultSchema = z
  .object({
    version: z.literal(defaults.version),
    seed: count.max(defaults.maxSeed),
    counter,
    reason: z.enum(Object.values(NEEDLE_RUN_REASONS)),
    plan: z.object({
      source: z.enum(Object.values(NEEDLE_PLAN_SOURCES)),
      lengths: z.array(tokens.min(defaults.minimumInputTokens)).min(1).max(10),
      depths: z.tuple([
        z.literal(defaults.depths[0]),
        z.literal(defaults.depths[1]),
        z.literal(defaults.depths[2]),
      ]),
      limit: tokens,
      capped: z.boolean(),
      requests: count.max(defaults.maxRequests),
      totalInputTokens: count.max(defaults.maxTotalInputTokens),
    }),
    scheduled: z.array(coordinate).min(1).max(defaults.maxRequests).optional(),
    processed: count.max(defaults.maxRequests).optional(),
    cancelled: z.array(coordinate).max(defaults.maxRequests).optional(),
    cells: z
      .array(
        z.object({
          targetTokens: tokens,
          depth: z.number().min(0).max(100),
          actualDepth: z.number().min(0).max(100),
          localInputTokens: tokens,
          outcome: z.enum(Object.values(NEEDLE_OUTCOMES)),
          inputTokens: count.optional(),
          outputTokens: count.optional(),
          latencyMs: z.number().nonnegative().optional(),
        }),
      )
      .max(defaults.maxRequests),
  })
  .refine((result) => {
    if (
      result.cancelled &&
      (!result.scheduled ||
        result.cancelled.some(
          (cell) =>
            !result.scheduled?.some((item) =>
              isSameNeedleCoordinate(item, cell),
            ),
        ) ||
        new Set(result.cancelled.map(getNeedleCoordinateKey)).size !==
          result.cancelled.length)
    )
      return false
    if (!result.scheduled) return result.processed === undefined
    return (
      result.scheduled.every(
        (cell) =>
          result.plan.lengths.includes(cell.targetTokens) &&
          result.plan.depths.some((depth) => depth === cell.depth),
      ) &&
      new Set(result.scheduled.map(getNeedleCoordinateKey)).size ===
        result.scheduled.length &&
      (result.processed === undefined ||
        result.processed <= result.scheduled.length)
    )
  })

/** Persist only bounded measurements; raw prompts, answers and errors never cross this codec. */
export function coerceNeedleResult(value: unknown): NeedleResult | null {
  const parsed = resultSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
