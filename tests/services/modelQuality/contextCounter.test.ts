import { describe, expect, it } from "vitest"

import { createContextCounter } from "~/services/verification/modelQuality/contextCounter"

describe("context counter", () => {
  it("rejects oversized synthetic input before allocating its repeated text", async () => {
    const counter = await createContextCounter({ state: "unmatched" })
    expect(() => counter.makePrompt(1000000000)).toThrow("32 MiB")
  })
  it("keeps ambiguous model identity as an estimate", async () => {
    const counter = await createContextCounter({ state: "ambiguous" })
    expect(counter.info.estimated).toBe(true)
    expect(counter.info.modelId).toBeUndefined()
  })
  it("selects encoding from resolved metadata identity and preserves declaration", async () => {
    const counter = await createContextCounter({
      state: "resolved",
      match: "exact",
      metadata: {
        id: "openai/gpt-4",
        name: "custom alias",
        provider_id: "openai",
        limits: { context: 8192 },
      },
    })
    expect(counter.info).toMatchObject({
      encoding: "cl100k_base",
      estimated: false,
      declaredContext: 8192,
      modelId: "openai/gpt-4",
    })
    expect(counter.count(counter.makePrompt(1024))).toBeLessThanOrEqual(1024)
    expect(counter.count(counter.makePrompt(1024))).toBeGreaterThan(1000)
  })
})
