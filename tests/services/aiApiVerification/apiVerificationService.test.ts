import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  runApiVerification,
  runApiVerificationProbe,
} from "~/services/aiApiVerification"

const mockFetchOpenAICompatibleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

const mockGenerateText = vi.fn()

vi.mock("ai", () => ({
  generateText: (...args: any[]) => mockGenerateText(...args),
  Output: { object: (spec: any) => spec },
  jsonSchema: (schema: any) => schema,
  stepCountIs: (...args: any[]) => ({ type: "stepCountIs", args }),
  tool: (definition: any) => definition,
}))

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => (modelId: string) => ({ modelId }),
}))

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => {
    const provider = (modelId: string) => ({ modelId })
    provider.tools = {
      webSearch: () => ({ tool: "webSearch" }),
    }
    return provider
  },
}))

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => (modelId: string) => ({ modelId }),
}))

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => {
    const provider = (modelId: string) => ({ modelId })
    provider.tools = {
      googleSearch: () => ({ tool: "googleSearch" }),
    }
    return provider
  },
}))

describe("apiVerificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchOpenAICompatibleModelIds.mockReset()
    mockGenerateText.mockReset()
  })

  it("runs openai-compatible suite successfully", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m1", "m2"])
    mockGenerateText
      .mockResolvedValueOnce({ text: "OK" })
      .mockResolvedValueOnce({
        toolCalls: [{ toolName: "verify_tool" }],
        toolResults: [],
      })
      .mockResolvedValueOnce({ output: { ok: true } })
      .mockResolvedValueOnce({ toolResults: [], sources: [] })
      .mockResolvedValueOnce({ output: { ok: true } })

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: "openai-compatible",
    })

    expect(report.baseUrl).toBe("https://example.com")
    expect(report.apiType).toBe("openai-compatible")
    expect(report.modelId).toBe("m1")

    const models = report.results.find((r) => r.id === "models")
    expect(models?.status).toBe("pass")

    const text = report.results.find((r) => r.id === "text-generation")
    expect(text?.status).toBe("pass")

    const tools = report.results.find((r) => r.id === "tool-calling")
    expect(tools?.status).toBe("pass")

    const structured = report.results.find((r) => r.id === "structured-output")
    expect(structured?.status).toBe("pass")

    const web = report.results.find((r) => r.id === "web-search")
    expect(web?.status).toBe("unsupported")
  })

  it("prefers explicit modelId override", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m1"])
    mockGenerateText
      .mockResolvedValueOnce({ text: "OK" })
      .mockResolvedValueOnce({
        toolCalls: [{ toolName: "verify_tool" }],
        toolResults: [],
      })
      .mockResolvedValueOnce({ output: { ok: true } })

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: "openai-compatible",
      modelId: "override-model",
    })

    expect(report.modelId).toBe("override-model")
    expect(mockGenerateText).toHaveBeenCalledTimes(3)
    expect(mockGenerateText.mock.calls[0][0].model.modelId).toBe(
      "override-model",
    )
  })

  it("uses token model hint when available", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["m1"])
    mockGenerateText
      .mockResolvedValueOnce({ text: "OK" })
      .mockResolvedValueOnce({
        toolCalls: [{ toolName: "verify_tool" }],
        toolResults: [],
      })
      .mockResolvedValueOnce({ output: { ok: true } })

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: "openai-compatible",
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
    mockGenerateText
      .mockResolvedValueOnce({ text: "OK" })
      .mockRejectedValueOnce(new Error("invalid key: secret"))
      .mockResolvedValueOnce({ output: { ok: true } })

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: "openai-compatible",
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
      apiType: "openai-compatible",
    })

    const tools = report.results.find((r) => r.id === "tool-calling")
    expect(tools?.status).toBe("fail")
  })

  it("runs google suite and reports probe outcomes", async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: "OK" })
      .mockResolvedValueOnce({
        toolCalls: [{ toolName: "verify_tool" }],
        toolResults: [],
      })
      .mockResolvedValueOnce({ output: { ok: true } })
      .mockResolvedValueOnce({ toolResults: [], sources: [] })

    const report = await runApiVerification({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: "google",
      modelId: "gemini-test",
    })

    expect(report.results.find((r) => r.id === "tool-calling")?.status).toBe(
      "pass",
    )
    expect(
      report.results.find((r) => r.id === "structured-output")?.status,
    ).toBe("pass")
    expect(report.results.find((r) => r.id === "web-search")?.status).toBe(
      "fail",
    )
  })

  it("runs a single probe and returns input/output diagnostics", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "OK" })

    const result = await runApiVerificationProbe({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "text-generation",
    })

    expect(result.id).toBe("text-generation")
    expect(result.status).toBe("pass")
    expect(result.input).toMatchObject({
      apiType: "openai",
      baseUrl: "https://example.com",
      modelId: "gpt-test",
    })
    expect(result.output).toMatchObject({ text: "OK" })
  })

  it("returns unsupported for models probe on non-openai-compatible apiType", async () => {
    const result = await runApiVerificationProbe({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: "openai",
      modelId: "gpt-test",
      probeId: "models",
    })

    expect(result.status).toBe("unsupported")
  })

  it("fails a probe when modelId is missing", async () => {
    const result = await runApiVerificationProbe({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: "openai",
      probeId: "tool-calling",
    })

    expect(result.status).toBe("fail")
    expect(result.summaryKey).toBe(
      "verifyDialog.summaries.noModelIdProvidedToRunProbe",
    )
  })
})
