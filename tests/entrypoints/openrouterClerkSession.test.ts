import { describe, expect, it, vi } from "vitest"

import entrypoint from "~/entrypoints/openrouter-clerk-session"

const { setupBridgeMock } = vi.hoisted(() => ({
  setupBridgeMock: vi.fn(),
}))

vi.mock(
  "~/entrypoints/content/messageHandlers/openrouter/clerkSessionProtocol",
  () => ({
    setupOpenRouterClerkSessionBridge: setupBridgeMock,
  }),
)

describe("OpenRouter Clerk session unlisted entrypoint", () => {
  it("only delegates main-world setup to the bridge", () => {
    expect(entrypoint.main).toBeTypeOf("function")

    entrypoint.main?.()

    expect(setupBridgeMock).toHaveBeenCalledTimes(1)
  })
})
