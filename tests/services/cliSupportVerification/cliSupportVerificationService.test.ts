import { describe, expect, it, vi } from "vitest"

import { runCliSupportTool } from "~/services/verification/cliSupportVerification/cliSupportVerificationService"

const mockRunCliSupportToolFromRegistry = vi.fn()

vi.mock("~/services/verification/cliSupportVerification/registry", () => ({
  runCliSupportToolFromRegistry: (...args: any[]) =>
    mockRunCliSupportToolFromRegistry(...args),
}))

describe("cliSupportVerificationService", () => {
  it("passes the provided modelId through to the registry for a single tool", async () => {
    mockRunCliSupportToolFromRegistry.mockResolvedValueOnce({
      id: "codex",
      status: "pass",
      latencyMs: 0,
      summary: "ok",
    })

    await runCliSupportTool({
      toolId: "codex",
      baseUrl: "https://example.com",
      apiKey: "k",
      modelId: "m1",
    })

    expect(mockRunCliSupportToolFromRegistry).toHaveBeenCalledTimes(1)
    expect(mockRunCliSupportToolFromRegistry).toHaveBeenCalledWith("codex", {
      baseUrl: "https://example.com",
      apiKey: "k",
      modelId: "m1",
    })
  })

  it.each(["claude", "codex", "gemini"] as const)(
    "passes the selected model and mode to the %s tool",
    async (toolId) => {
      mockRunCliSupportToolFromRegistry.mockResolvedValue({
        id: toolId,
        status: "pass",
        latencyMs: 0,
        summary: "ok",
      })
      await runCliSupportTool({
        toolId,
        baseUrl: "https://example.com",
        apiKey: "k",
        modelId: "m1",
        mode: "non-streaming",
      })
      expect(mockRunCliSupportToolFromRegistry).toHaveBeenCalledTimes(1)
      expect(mockRunCliSupportToolFromRegistry).toHaveBeenCalledWith(toolId, {
        baseUrl: "https://example.com",
        apiKey: "k",
        modelId: "m1",
        mode: "non-streaming",
      })
    },
  )
})
