import { beforeEach, describe, expect, it, vi } from "vitest"

// Use shared API type constants to keep test inputs aligned with supported values.
import {
  API_TYPES,
  runApiVerification,
  runApiVerificationProbe,
} from "~/services/verification/aiApiVerification"

const mockFetchOpenAICompatibleModelIds = vi.fn()
const mockFetchAnthropicModelIds = vi.fn()
const mockFetchGoogleModelIds = vi.fn()

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: (...args: any[]) =>
    mockFetchOpenAICompatibleModelIds(...args),
}))

vi.mock("~/services/apiService/anthropic", () => ({
  fetchAnthropicModelIds: (...args: any[]) =>
    mockFetchAnthropicModelIds(...args),
}))

vi.mock("~/services/apiService/google", () => ({
  fetchGoogleModelIds: (...args: any[]) => mockFetchGoogleModelIds(...args),
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
    mockFetchAnthropicModelIds.mockReset()
    mockFetchGoogleModelIds.mockReset()
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
      apiType: API_TYPES.OPENAI_COMPATIBLE,
    })

    expect(report.baseUrl).toBe("https://example.com")
    expect(report.apiType).toBe(API_TYPES.OPENAI_COMPATIBLE)
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
      apiType: API_TYPES.OPENAI_COMPATIBLE,
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
      apiType: API_TYPES.OPENAI_COMPATIBLE,
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
      apiType: API_TYPES.OPENAI_COMPATIBLE,
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
      apiType: API_TYPES.OPENAI_COMPATIBLE,
    })

    const tools = report.results.find((r) => r.id === "tool-calling")
    expect(tools?.status).toBe("fail")
  })

  it("runs google suite and reports probe outcomes", async () => {
    mockFetchGoogleModelIds.mockResolvedValueOnce(["gemini-test"])
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
      apiType: API_TYPES.GOOGLE,
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

  it("discovers modelId for google suite when omitted", async () => {
    mockFetchGoogleModelIds.mockResolvedValueOnce([
      "embedding-001",
      "gemini-1.5-pro",
    ])

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
      apiType: API_TYPES.GOOGLE,
    })

    expect(report.modelId).toBe("gemini-1.5-pro")
    expect(mockGenerateText.mock.calls[0][0].model.modelId).toBe(
      "gemini-1.5-pro",
    )
  })

  it("runs a single probe and returns input/output diagnostics", async () => {
    mockGenerateText.mockResolvedValueOnce({ text: "OK" })

    const result = await runApiVerificationProbe({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: API_TYPES.OPENAI,
      modelId: "gpt-test",
      probeId: "text-generation",
    })

    expect(result.id).toBe("text-generation")
    expect(result.status).toBe("pass")
    expect(result.input).toMatchObject({
      apiType: API_TYPES.OPENAI,
      baseUrl: "https://example.com",
      modelId: "gpt-test",
    })
    expect(result.output).toMatchObject({ text: "OK" })
  })

  it("runs models probe for openai apiType", async () => {
    mockFetchOpenAICompatibleModelIds.mockResolvedValueOnce(["gpt-test"])

    const result = await runApiVerificationProbe({
      baseUrl: "https://example.com/v1",
      apiKey: "secret",
      apiType: API_TYPES.OPENAI,
      probeId: "models",
    })

    expect(result.status).toBe("pass")
    expect(mockFetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://example.com",
      apiKey: "secret",
    })
    expect(result.input).toMatchObject({
      apiType: API_TYPES.OPENAI,
      endpoint: "/v1/models",
      baseUrl: "https://example.com",
    })
    expect(result.output as any).toMatchObject({
      suggestedModelId: "gpt-test",
    })
  })

  it("runs models probe for anthropic apiType", async () => {
    mockFetchAnthropicModelIds.mockResolvedValueOnce([
      "claude-3-5-haiku-latest",
    ])

    const result = await runApiVerificationProbe({
      baseUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "secret",
      apiType: API_TYPES.ANTHROPIC,
      probeId: "models",
    })

    expect(result.status).toBe("pass")
    expect(mockFetchAnthropicModelIds).toHaveBeenCalledWith({
      baseUrl: "https://api.anthropic.com",
      apiKey: "secret",
    })
    expect(result.input).toMatchObject({
      apiType: API_TYPES.ANTHROPIC,
      endpoint: "/v1/models",
      baseUrl: "https://api.anthropic.com",
    })
    expect(result.output as any).toMatchObject({
      suggestedModelId: "claude-3-5-haiku-latest",
    })
  })

  it("runs models probe for google apiType and prefers gemini model ids", async () => {
    mockFetchGoogleModelIds.mockResolvedValueOnce([
      "embedding-001",
      "gemini-1.5-pro",
    ])

    const result = await runApiVerificationProbe({
      baseUrl: "https://proxy.example.com/api/v1beta/models",
      apiKey: "secret",
      apiType: API_TYPES.GOOGLE,
      probeId: "models",
    })

    expect(result.status).toBe("pass")
    expect(mockFetchGoogleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example.com/api",
      apiKey: "secret",
    })
    expect(result.input).toMatchObject({
      apiType: API_TYPES.GOOGLE,
      endpoint: "/v1beta/models",
      baseUrl: "https://proxy.example.com/api",
    })
    expect(result.output as any).toMatchObject({
      suggestedModelId: "gemini-1.5-pro",
    })
  })

  it("fails a probe when modelId is missing", async () => {
    const result = await runApiVerificationProbe({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: API_TYPES.OPENAI,
      probeId: "tool-calling",
    })

    expect(result.status).toBe("fail")
    expect(result.summaryKey).toBe("verifyDialog.summaries.noModelIdProvided")
  })

  it("redacts secrets from models probe failure summaries", async () => {
    mockFetchOpenAICompatibleModelIds.mockRejectedValueOnce(
      new Error("Unauthorized: secret"),
    )

    const result = await runApiVerificationProbe({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: API_TYPES.OPENAI,
      probeId: "models",
    })

    expect(result.status).toBe("fail")
    expect(result.summary).not.toContain("secret")
    expect(result.summary).toContain("[REDACTED]")
  })

  it("returns unsupported for web-search probe on anthropic apiType", async () => {
    const result = await runApiVerificationProbe({
      baseUrl: "https://example.com",
      apiKey: "secret",
      apiType: API_TYPES.ANTHROPIC,
      modelId: "claude-test",
      probeId: "web-search",
    })

    expect(result.status).toBe("unsupported")
    expect(result.summaryKey).toBe(
      "verifyDialog.summaries.webSearchUnsupportedAnthropic",
    )
  })
})
