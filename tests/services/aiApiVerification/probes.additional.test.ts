import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  createModel: vi.fn(),
  createOpenAIProvider: vi.fn(),
  createGoogleProvider: vi.fn(),
  fetchOpenAICompatibleModelIds: vi.fn(),
  fetchAnthropicModelIds: vi.fn(),
  fetchGoogleModelIds: vi.fn(),
}))

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: {
    object: vi.fn((definition) => definition),
  },
  jsonSchema: vi.fn((schema) => schema),
  tool: vi.fn((definition) => definition),
}))

vi.mock("~/services/verification/aiApiVerification/providers", () => ({
  createModel: mocks.createModel,
  createOpenAIProvider: mocks.createOpenAIProvider,
  createGoogleProvider: mocks.createGoogleProvider,
}))

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: mocks.fetchOpenAICompatibleModelIds,
}))

vi.mock("~/services/apiService/anthropic", () => ({
  fetchAnthropicModelIds: mocks.fetchAnthropicModelIds,
}))

vi.mock("~/services/apiService/google", () => ({
  fetchGoogleModelIds: mocks.fetchGoogleModelIds,
}))

function createAbortedSignalFixture() {
  const controller = new AbortController()
  const abortError = new DOMException("Aborted", "AbortError")
  controller.abort()
  return { abortError, abortSignal: controller.signal }
}

describe("AI API verification probes", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.generateText.mockReset()
    mocks.createModel.mockReset()
    mocks.createOpenAIProvider.mockReset()
    mocks.createGoogleProvider.mockReset()
    mocks.fetchOpenAICompatibleModelIds.mockReset()
    mocks.fetchAnthropicModelIds.mockReset()
    mocks.fetchGoogleModelIds.mockReset()

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

  describe("runModelsProbe", () => {
    it("rethrows aborted model-list fetches", async () => {
      const { abortError, abortSignal } = createAbortedSignalFixture()
      mocks.fetchOpenAICompatibleModelIds.mockRejectedValueOnce(abortError)

      const { runModelsProbe } = await import(
        "~/services/verification/aiApiVerification/probes/modelsProbe"
      )

      await expect(
        runModelsProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          abortSignal,
        }),
      ).rejects.toBe(abortError)
    })
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

    it("rethrows aborted OpenAI web-search requests", async () => {
      const { abortError, abortSignal } = createAbortedSignalFixture()
      mocks.generateText.mockRejectedValueOnce(abortError)

      const { runWebSearchProbe } = await import(
        "~/services/verification/aiApiVerification/probes/webSearchProbe"
      )

      await expect(
        runWebSearchProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
          abortSignal,
        }),
      ).rejects.toBe(abortError)
    })

    it("fails for OpenAI endpoints when neither tool results nor sources are returned", async () => {
      mocks.generateText.mockResolvedValueOnce({
        toolResults: [],
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
        status: "fail",
        summaryKey: "verifyDialog.summaries.webSearchNoResults",
        output: {
          sourcesCount: 0,
          toolResultsCount: 0,
        },
      })
    })

    it("passes for Google endpoints when grounded sources are returned", async () => {
      mocks.generateText.mockResolvedValueOnce({
        toolResults: [],
        sources: [{ title: "AI SDK update" }],
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
        status: "pass",
        summaryKey: "verifyDialog.summaries.webSearchGroundingSucceeded",
        output: {
          sourcesCount: 1,
          toolResultsCount: 0,
          sourcesPreview: [{ title: "AI SDK update" }],
        },
      })
    })

    it("passes for Google endpoints when the google_search tool result is present even without sources", async () => {
      mocks.generateText.mockResolvedValueOnce({
        toolResults: [{ toolName: "google_search" }],
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
        status: "pass",
        summaryKey: "verifyDialog.summaries.webSearchGroundingSucceeded",
        output: {
          sourcesCount: 0,
          toolResultsCount: 1,
        },
      })
    })

    it("rethrows aborted Google web-search requests", async () => {
      const { abortError, abortSignal } = createAbortedSignalFixture()
      mocks.generateText.mockRejectedValueOnce(abortError)

      const { runWebSearchProbe } = await import(
        "~/services/verification/aiApiVerification/probes/webSearchProbe"
      )

      await expect(
        runWebSearchProbe({
          apiType: "google",
          baseUrl: "https://generativelanguage.googleapis.com",
          apiKey: "AIza-secret",
          modelId: "gemini-2.5-pro",
          abortSignal,
        }),
      ).rejects.toBe(abortError)
    })

    it("treats omitted OpenAI tool-results and sources arrays as an empty-result failure", async () => {
      mocks.generateText.mockResolvedValueOnce({})

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
        status: "fail",
        summaryKey: "verifyDialog.summaries.webSearchNoResults",
        output: {
          sourcesCount: 0,
          toolResultsCount: 0,
          sourcesPreview: [],
        },
      })
    })

    it("treats omitted Google grounding arrays as an empty-result failure", async () => {
      mocks.generateText.mockResolvedValueOnce({})

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
        output: {
          sourcesCount: 0,
          toolResultsCount: 0,
          sourcesPreview: [],
        },
      })
    })

    it("returns unsupported for API types without a web-search implementation", async () => {
      const { runWebSearchProbe } = await import(
        "~/services/verification/aiApiVerification/probes/webSearchProbe"
      )

      await expect(
        runWebSearchProbe({
          apiType: "openai-compatible",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
        }),
      ).resolves.toMatchObject({
        id: "web-search",
        status: "unsupported",
        summaryKey: "verifyDialog.summaries.webSearchUnsupportedForApiType",
      })
    })
  })

  describe("runTextGenerationProbe", () => {
    it("passes when the model replies with OK text", async () => {
      mocks.generateText.mockResolvedValueOnce({
        text: "  OK  ",
      })

      const { runTextGenerationProbe } = await import(
        "~/services/verification/aiApiVerification/probes/textGenerationProbe"
      )

      await expect(
        runTextGenerationProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
        }),
      ).resolves.toMatchObject({
        id: "text-generation",
        status: "pass",
        summaryKey: "verifyDialog.summaries.textGenerationSucceeded",
        output: {
          text: "  OK  ",
        },
        details: undefined,
      })
    })

    it("fails with a response preview when the reply does not contain OK", async () => {
      mocks.generateText.mockResolvedValueOnce({
        text: "No thanks",
      })

      const { runTextGenerationProbe } = await import(
        "~/services/verification/aiApiVerification/probes/textGenerationProbe"
      )

      await expect(
        runTextGenerationProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
        }),
      ).resolves.toMatchObject({
        id: "text-generation",
        status: "fail",
        summaryKey: "verifyDialog.summaries.textGenerationUnexpectedResponse",
        output: {
          text: "No thanks",
        },
        details: {
          responsePreview: "No thanks",
        },
      })
    })

    it("sanitizes thrown text-generation errors", async () => {
      mocks.generateText.mockRejectedValueOnce(
        new Error("bad gateway sk-secret"),
      )

      const { runTextGenerationProbe } = await import(
        "~/services/verification/aiApiVerification/probes/textGenerationProbe"
      )

      const result = await runTextGenerationProbe({
        apiType: "openai",
        baseUrl: "https://example.com",
        apiKey: "sk-secret",
        modelId: "gpt-4.1",
      })

      expect(result).toMatchObject({
        id: "text-generation",
        status: "fail",
      })
      expect(result.summary).not.toContain("sk-secret")
    })

    it("rethrows aborted text-generation requests", async () => {
      const { abortError, abortSignal } = createAbortedSignalFixture()
      mocks.generateText.mockRejectedValueOnce(abortError)

      const { runTextGenerationProbe } = await import(
        "~/services/verification/aiApiVerification/probes/textGenerationProbe"
      )

      await expect(
        runTextGenerationProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
          abortSignal,
        }),
      ).rejects.toBe(abortError)
    })
  })

  describe("runStructuredOutputProbe", () => {
    it("passes when the model returns the expected structured output", async () => {
      mocks.generateText.mockResolvedValueOnce({
        output: { ok: true },
      })

      const { runStructuredOutputProbe } = await import(
        "~/services/verification/aiApiVerification/probes/structuredOutputProbe"
      )

      await expect(
        runStructuredOutputProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
        }),
      ).resolves.toMatchObject({
        id: "structured-output",
        status: "pass",
        summaryKey: "verifyDialog.summaries.structuredOutputSucceeded",
        output: {
          output: { ok: true },
        },
      })
    })

    it("fails when the structured payload does not contain the expected flag", async () => {
      mocks.generateText.mockResolvedValueOnce({
        output: null,
      })

      const { runStructuredOutputProbe } = await import(
        "~/services/verification/aiApiVerification/probes/structuredOutputProbe"
      )

      await expect(
        runStructuredOutputProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
        }),
      ).resolves.toMatchObject({
        id: "structured-output",
        status: "fail",
        summaryKey: "verifyDialog.summaries.structuredOutputInvalid",
        output: {
          output: null,
        },
      })
    })

    it("sanitizes thrown structured-output errors", async () => {
      mocks.generateText.mockRejectedValueOnce(
        new Error("invalid schema sk-secret"),
      )

      const { runStructuredOutputProbe } = await import(
        "~/services/verification/aiApiVerification/probes/structuredOutputProbe"
      )

      const result = await runStructuredOutputProbe({
        apiType: "openai",
        baseUrl: "https://example.com",
        apiKey: "sk-secret",
        modelId: "gpt-4.1",
      })

      expect(result).toMatchObject({
        id: "structured-output",
        status: "fail",
      })
      expect(result.summary).not.toContain("sk-secret")
    })

    it("rethrows aborted structured-output requests", async () => {
      const { abortError, abortSignal } = createAbortedSignalFixture()
      mocks.generateText.mockRejectedValueOnce(abortError)

      const { runStructuredOutputProbe } = await import(
        "~/services/verification/aiApiVerification/probes/structuredOutputProbe"
      )

      await expect(
        runStructuredOutputProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
          abortSignal,
        }),
      ).rejects.toBe(abortError)
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

    it("passes when the verify_tool result is present even without a toolCalls entry", async () => {
      mocks.generateText.mockResolvedValueOnce({
        toolResults: [{ toolName: "verify_tool", result: { now: "ok" } }],
      })

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
        status: "pass",
        summaryKey: "verifyDialog.summaries.toolCallSucceeded",
        output: {
          text: null,
          toolCalls: [],
          toolResults: [{ toolName: "verify_tool", result: { now: "ok" } }],
        },
      })
    })

    it("fails with a detailed payload when no tool call is detected", async () => {
      mocks.generateText.mockResolvedValueOnce({
        toolCalls: undefined,
        toolResults: undefined,
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
          text: null,
          toolCalls: [],
          toolResults: [],
        },
      })
    })

    it("exposes the generated verify_tool executor shape for callers that inspect the tool contract", async () => {
      mocks.generateText.mockResolvedValueOnce({
        toolCalls: [{ toolName: "verify_tool" }],
        toolResults: [],
      })

      const { runToolCallingProbe } = await import(
        "~/services/verification/aiApiVerification/probes/toolCallingProbe"
      )

      await runToolCallingProbe({
        apiType: "openai",
        baseUrl: "https://example.com",
        apiKey: "sk-secret",
        modelId: "gpt-4.1",
      })

      const toolDefinition =
        mocks.generateText.mock.calls[0][0].tools.verify_tool
      await expect(toolDefinition.execute()).resolves.toEqual({
        now: expect.any(String),
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
      })
      expect(result.summary).not.toContain("sk-secret")
    })

    it("falls back to a generic request failure message when sanitization returns nothing", async () => {
      mocks.generateText.mockRejectedValueOnce({
        message: "",
      })

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
        summary: expect.any(String),
      })
    })

    it("rethrows aborted tool-calling requests", async () => {
      const { abortError, abortSignal } = createAbortedSignalFixture()
      mocks.generateText.mockRejectedValueOnce(abortError)

      const { runToolCallingProbe } = await import(
        "~/services/verification/aiApiVerification/probes/toolCallingProbe"
      )

      await expect(
        runToolCallingProbe({
          apiType: "openai",
          baseUrl: "https://example.com",
          apiKey: "sk-secret",
          modelId: "gpt-4.1",
          abortSignal,
        }),
      ).rejects.toBe(abortError)
    })
  })
})
