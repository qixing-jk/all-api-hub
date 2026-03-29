import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  createModel: vi.fn(),
  createOpenAIProvider: vi.fn(),
  createGoogleProvider: vi.fn(),
}))

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  jsonSchema: vi.fn((schema) => schema),
  tool: vi.fn((definition) => definition),
}))

vi.mock("~/services/verification/aiApiVerification/providers", () => ({
  createModel: mocks.createModel,
  createOpenAIProvider: mocks.createOpenAIProvider,
  createGoogleProvider: mocks.createGoogleProvider,
}))

describe("AI API verification probes", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.createOpenAIProvider.mockImplementation(() => {
      const provider = ((modelId: string) => ({
        provider: "openai",
        modelId,
      })) as any
      provider.tools = {
        webSearch: vi.fn((options) => ({ type: "webSearch", options })),
      }
      return provider
    })

    mocks.createGoogleProvider.mockImplementation(() => {
      const provider = ((modelId: string) => ({
        provider: "google",
        modelId,
      })) as any
      provider.tools = {
        googleSearch: vi.fn((options) => ({ type: "googleSearch", options })),
      }
      return provider
    })

    mocks.createModel.mockImplementation((params) => params)
  })

  describe("runWebSearchProbe", () => {
    it("returns unsupported for anthropic endpoints", async () => {
      const { runWebSearchProbe } = await import(
        "~/services/verification/aiApiVerification/probes/webSearchProbe"
      )

      await expect(
        runWebSearchProbe({
          apiType: "anthropic",
          baseUrl: "https://example.com",
          apiKey: "secret",
          modelId: "claude-3-5-sonnet",
        }),
      ).resolves.toMatchObject({
        id: "web-search",
        status: "unsupported",
        summaryKey: "verifyDialog.summaries.webSearchUnsupportedAnthropic",
      })
    })

    it("passes for OpenAI endpoints when a web search tool result is present", async () => {
      mocks.generateText.mockResolvedValueOnce({
        toolResults: [{ toolName: "web_search" }],
        sources: [],
      })

      const { runWebSearchProbe } = await import(
        "~/services/verification/aiApiVerification/probes/webSearchProbe"
      )

      await expect(
        runWebSearchProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
        }),
      ).resolves.toMatchObject({
        id: "web-search",
        status: "pass",
        summaryKey: "verifyDialog.summaries.webSearchSucceeded",
        output: {
          sourcesCount: 0,
          toolResultsCount: 1,
        },
      })
    })

    it("fails for Google endpoints when grounding returns no sources or tool results", async () => {
      mocks.generateText.mockResolvedValueOnce({
        toolResults: [],
        sources: [],
      })

      const { runWebSearchProbe } = await import(
        "~/services/verification/aiApiVerification/probes/webSearchProbe"
      )

      await expect(
        runWebSearchProbe({
          apiType: "google",
          baseUrl: "https://generativelanguage.googleapis.com",
          apiKey: "AIza-secret",
          modelId: "gemini-2.5-pro",
        }),
      ).resolves.toMatchObject({
        id: "web-search",
        status: "fail",
        summaryKey: "verifyDialog.summaries.webSearchGroundingNoResults",
      })
    })

    it("returns a sanitized failure summary when the provider call throws", async () => {
      mocks.generateText.mockRejectedValueOnce(
        new Error("request failed sk-secret"),
      )

      const { runWebSearchProbe } = await import(
        "~/services/verification/aiApiVerification/probes/webSearchProbe"
      )

      const result = await runWebSearchProbe({
        apiType: "openai",
        baseUrl: "https://example.com",
        apiKey: "sk-secret",
        modelId: "gpt-4.1",
      })

      expect(result).toMatchObject({
        id: "web-search",
        status: "fail",
      })
      expect(result.summary).not.toContain("sk-secret")
    })
  })

  describe("runToolCallingProbe", () => {
    it("passes when the verify_tool tool call is present", async () => {
      mocks.generateText.mockResolvedValueOnce({
        text: "done",
        toolCalls: [{ toolName: "verify_tool" }],
        toolResults: [],
      })

      const { runToolCallingProbe } = await import(
        "~/services/verification/aiApiVerification/probes/toolCallingProbe"
      )

      await expect(
        runToolCallingProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
        }),
      ).resolves.toMatchObject({
        id: "tool-calling",
        status: "pass",
        summaryKey: "verifyDialog.summaries.toolCallSucceeded",
      })
    })

    it("fails with a detailed payload when no tool call is detected", async () => {
      mocks.generateText.mockResolvedValueOnce({
        text: "plain text only",
        toolCalls: [],
        toolResults: [],
      })

      const { runToolCallingProbe } = await import(
        "~/services/verification/aiApiVerification/probes/toolCallingProbe"
      )

      await expect(
        runToolCallingProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
        }),
      ).resolves.toMatchObject({
        id: "tool-calling",
        status: "fail",
        summaryKey: "verifyDialog.summaries.noToolCallDetected",
        output: {
          text: "plain text only",
          toolCalls: [],
          toolResults: [],
        },
      })
    })

    it("sanitizes thrown tool-calling errors and preserves inferred status metadata", async () => {
      mocks.generateText.mockRejectedValueOnce(
        new Error("403 sk-secret forbidden"),
      )

      const { runToolCallingProbe } = await import(
        "~/services/verification/aiApiVerification/probes/toolCallingProbe"
      )

      const result = await runToolCallingProbe({
        apiType: "openai",
        baseUrl: "https://example.com",
        apiKey: "sk-secret",
        modelId: "gpt-4.1",
      })

      expect(result).toMatchObject({
        id: "tool-calling",
        status: "fail",
        summaryKey: expect.any(String),
      })
      expect(result.summary).not.toContain("sk-secret")
    })
  })
})
