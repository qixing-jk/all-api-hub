import { describe, expect, it, vi } from "vitest"

import {
  runCliSupportSimulation,
  runCliSupportTool,
} from "~/services/verification/cliSupportVerification/cliSupportVerificationService"

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

  it("runs all tools with the same modelId in the simulation suite", async () => {
    mockRunCliSupportToolFromRegistry.mockResolvedValue({
      id: "codex",
      status: "pass",
      latencyMs: 0,
      summary: "ok",
    })

    await runCliSupportSimulation({
      baseUrl: "https://example.com",
      apiKey: "k",
      modelId: "m1",
    })

    expect(mockRunCliSupportToolFromRegistry).toHaveBeenCalledTimes(3)
    expect(mockRunCliSupportToolFromRegistry).toHaveBeenNthCalledWith(
      1,
      "claude",
      {
        baseUrl: "https://example.com",
        apiKey: "k",
        modelId: "m1",
      },
    )
    expect(mockRunCliSupportToolFromRegistry).toHaveBeenNthCalledWith(
      2,
      "codex",
      {
        baseUrl: "https://example.com",
        apiKey: "k",
        modelId: "m1",
      },
    )
    expect(mockRunCliSupportToolFromRegistry).toHaveBeenNthCalledWith(
      3,
      "gemini",
      {
        baseUrl: "https://example.com",
        apiKey: "k",
        modelId: "m1",
      },
    )
  })
})
