import { describe, expect, it } from "vitest"

import { isAxonHubChannelType } from "~/constants/axonHub"

describe("isAxonHubChannelType", () => {
  it("accepts real AxonHub channel types and rejects inherited property names", () => {
    expect(isAxonHubChannelType("openai")).toBe(true)
    expect(isAxonHubChannelType("anthropic")).toBe(true)
    expect(isAxonHubChannelType("toString")).toBe(false)
    expect(isAxonHubChannelType("constructor")).toBe(false)
  })
})
