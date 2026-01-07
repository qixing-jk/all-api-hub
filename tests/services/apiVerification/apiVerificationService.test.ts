import { beforeEach, describe, expect, it, vi } from "vitest"

import { runApiVerification } from "~/services/apiVerification/apiVerificationService"

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

const mockGenerateText = vi.fn()

vi.mock("ai", () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
  jsonSchema: (schema: any) => schema,
  tool: (definition: any) => definition,
}))

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => (modelId: string) => ({ modelId }),
}))

describe("apiVerificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("runs models + tool-calling probes successfully", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m1", "m2"])
    mockGenerateText.mockResolvedValueOnce({
      toolCalls: [{ toolName: "get_current_time" }],
      toolResults: [],
    })

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
    })

    expect(report.baseUrl).toBe("https://example.com")
    expect(report.modelId).toBe("m1")

    const models = report.results.find((r) => r.id === "models")
    expect(models?.status).toBe("pass")

    const tools = report.results.find((r) => r.id === "tool-calling")
    expect(tools?.status).toBe("pass")
  })

  it("prefers explicit modelId override", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m1"])
    mockGenerateText.mockResolvedValueOnce({
      toolCalls: [{ toolName: "get_current_time" }],
      toolResults: [],
    })

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
      modelId: "override-model",
    })

    expect(report.modelId).toBe("override-model")
    expect(mockGenerateText).toHaveBeenCalledTimes(1)
    expect(mockGenerateText.mock.calls[0][0].model.modelId).toBe(
      "override-model",
    )
  })

  it("uses token model hint when available", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m1"])
    mockGenerateText.mockResolvedValueOnce({
      toolCalls: [{ toolName: "get_current_time" }],
      toolResults: [],
    })

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
      tokenMeta: {
        id: 1,
        name: "t",
        models: "hint-model,other",
      },
    })

    expect(report.modelId).toBe("hint-model")
  })

  it("redacts apiKey from error summaries", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m1"])
    mockGenerateText.mockRejectedValueOnce(new Error("invalid key: secret"))

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
    })

    const tools = report.results.find((r) => r.id === "tool-calling")
    expect(tools?.status).toBe("fail")
    expect(tools?.summary).not.toContain("secret")
    expect(tools?.summary).toContain("[REDACTED]")
  })

  it("fails tool-calling probe when no model is available", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce([])

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
    })

    const tools = report.results.find((r) => r.id === "tool-calling")
    expect(tools?.status).toBe("fail")
  })
})
