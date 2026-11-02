import { describe, expect, it } from "vitest"

import { createVercelMeteredPricing } from "~/services/apiService/vercelAiGateway/meteredPricing"
import { pricingPlanSchema } from "~/services/modelPricing/pricingPlan"
import { quoteModelPrice } from "~/services/modelPricing/quoteModelPrice"

describe("Vercel published media schedules", () => {
  it.each([
    [{ resolution: 720, cost_per_second: "0.1" }],
    [{ resolution: "", cost_per_second: "0.1" }],
    [{ cost_per_second: "0.1" }, { cost_per_second: "0.2" }],
    [
      { mode: "pro", cost_per_second: "0.1" },
      { audio: true, cost_per_second: "0.2" },
    ],
    [
      { mode: "pro", cost_per_second: "0.1" },
      { audio: true, cost_per_second: "0.1" },
    ],
  ])(
    "does not turn malformed or ambiguous variants into a flat price: %j",
    (...rows) => {
      const plan = createVercelMeteredPricing("video", {
        video_duration_pricing: rows,
      })!
      expect(plan.source.rulesUnavailable).toBe(true)
      expect(
        quoteModelPrice(plan, {
          purpose: "request",
          usage: { videoSeconds: 5 },
        }),
      ).toMatchObject({ status: "unavailable", amount: null })
    },
  )
  it("rejects contradictory equivalent resolutions instead of charging whichever row is last", () => {
    const plan = createVercelMeteredPricing("video", {
      video_duration_pricing: [
        { resolution: "720P", cost_per_second: "0.1" },
        { resolution: "720p", cost_per_second: "0.2" },
      ],
    })!
    expect(
      quoteModelPrice(plan, {
        purpose: "request",
        videoQuality: "720p",
        usage: { videoSeconds: 5 },
      }),
    ).toMatchObject({ status: "unavailable", amount: null })
  })
  it("keeps generation mode distinct from resolution and service tier", () => {
    const plan = createVercelMeteredPricing("video", {
      video_duration_pricing: [
        { mode: "std", cost_per_second: "0.042" },
        { mode: "pro", audio: false, cost_per_second: "0.07" },
        { mode: "pro", audio: true, cost_per_second: "0.14" },
      ],
    })!
    expect(plan.rules).toHaveLength(3)
    expect(plan.rules[2]?.conditions).toContainEqual({
      kind: "selection",
      axis: "videoMode",
      value: "pro",
    })
    const pro = quoteModelPrice(plan, {
      purpose: "request",
      videoMode: "pro",
      videoAudio: "with-audio",
      usage: { videoSeconds: 5 },
    })
    expect(pro.status).toBe("complete")
    expect(pro.amount).toBeCloseTo(0.7)
    expect(
      quoteModelPrice(plan, {
        purpose: "request",
        videoMode: "std",
        usage: { videoSeconds: 5 },
      }).amount,
    ).toBeCloseTo(0.21)
  })
  it("quotes resolution and audio variants from the public duration schedule", () => {
    // ai-gateway.vercel.sh/v1/models, seedance-v1.5-pro, 2026-10-29.
    const plan = createVercelMeteredPricing("video", {
      video_duration_pricing: [
        { resolution: "720p", audio: false, cost_per_second: "0.0259" },
        { resolution: "720p", audio: true, cost_per_second: "0.0518" },
      ],
    })!
    expect(pricingPlanSchema.safeParse(plan).success).toBe(true)
    const quote = quoteModelPrice(plan, {
      purpose: "request",
      videoQuality: "720p",
      videoAudio: "with-audio",
      usage: { videoSeconds: 10 },
    })
    expect(quote).toMatchObject({ status: "complete" })
    expect(quote.amount).toBeCloseTo(0.518)
    expect(
      quoteModelPrice(plan, {
        purpose: "request",
        videoQuality: "720p",
        usage: { videoSeconds: 10 },
      }),
    ).toMatchObject({ status: "unavailable", amount: null })
  })
})
