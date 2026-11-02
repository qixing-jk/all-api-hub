import { z } from "zod"

import { PRICING_SOURCE_NOTE_KINDS as kinds } from "./pricingConstants"

/** Product-owned explanations are data; upstream prose stays in pricingDescription. */
export const pricingSourceNoteSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.enum([
      kinds.RULES_UNAVAILABLE,
      kinds.AMBIGUOUS_VARIANT_CHARGES,
      kinds.THRESHOLD_SOURCE_CONFLICT,
      kinds.THRESHOLD_BASIS_UNVERIFIED,
      kinds.RUNTIME_DEPENDENT,
      kinds.AMBIGUOUS_CHARGES,
      kinds.PROVIDER_REPORTED_ESTIMATE,
      kinds.ENDPOINT_SOURCE_CONFLICT,
      kinds.WHOLE_REQUEST_TIER,
    ]),
  }),
  z.strictObject({
    kind: z.literal(kinds.EXCLUDED_CHARGES),
    charges: z.array(z.string()),
  }),
  z.strictObject({
    kind: z.literal(kinds.ROUTING_CONTEXT),
    routeName: z.string().optional(),
    channelName: z.string().optional(),
    dedicated: z.boolean(),
    multiplier: z.number().finite().nonnegative(),
    timeWindows: z
      .array(
        z.strictObject({
          label: z.string(),
          start: z.number().int().min(0).max(1440),
          end: z.number().int().min(0).max(1440),
          input: z.number().finite().nonnegative(),
          output: z.number().finite().nonnegative(),
          cacheRead: z.number().finite().nonnegative(),
        }),
      )
      .optional(),
  }),
])

export type PricingSourceNote = z.infer<typeof pricingSourceNoteSchema>
