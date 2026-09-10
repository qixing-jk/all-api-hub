import { expect, it } from "vitest"

import {
  PRICE_RATE_UNITS,
  PRICING_CONDITION_KINDS,
  PRICING_GROUP_MULTIPLIERS,
  PRICING_IMAGE_SIZES,
  PRICING_METERS,
  PRICING_PURPOSES,
  PRICING_SELECTION_AXES,
  PRICING_SOURCE_KINDS,
  PRICING_USAGE_MODES,
} from "~/services/modelPricing/pricingConstants"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

it.each([
  ["720P", "720p", true],
  ["1080p", "1080P", true],
  ["4K", PRICING_IMAGE_SIZES.K4, true],
  ["4K", "2160p", false],
  ["standard", "STANDARD", false],
  ["720p", "1080p", false],
])(
  "matches resolution notation without inventing quality aliases: %s / %s",
  (published, selected, complete) => {
    const quote = quoteModelPrice(
      {
        rates: {},
        usageMode: PRICING_USAGE_MODES.METERED,
        comparison: { meter: PRICING_METERS.VIDEO_SECONDS },
        requiresRuleMatch: true,
        rules: [
          {
            id: "video",
            conditions: [
              {
                kind: PRICING_CONDITION_KINDS.SELECTION,
                axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
                value: published,
              },
            ],
            rates: {
              videoSeconds: {
                amount: 0.2,
                unit: PRICE_RATE_UNITS.SECOND,
                currency: "USD",
                per: 1,
              },
            },
          },
        ],
        source: { kind: PRICING_SOURCE_KINDS.ACCOUNT },
        groupMultiplier: PRICING_GROUP_MULTIPLIERS.INCLUDED,
        issues: [],
      },
      {
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        usage: {},
        videoQuality: selected,
      },
    )
    expect(quote.status).toBe(complete ? "complete" : "unavailable")
    expect(quote.amount).toBe(complete ? 0.2 : null)
    if (!complete)
      expect(quote.conditionDetails).toEqual([
        {
          axis: "videoQuality",
          selected,
          available: [
            published.toLowerCase() === "standard"
              ? published
              : published.toLowerCase(),
          ],
        },
      ])
  },
)
