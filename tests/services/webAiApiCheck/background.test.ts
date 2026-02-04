import { describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DEFAULT_PREFERENCES } from "~/services/userPreferences"

vi.mock("~/services/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/userPreferences")>()
  return {
    ...actual,
    userPreferences: {
      getPreferences: vi.fn(),
    },
  }
})

vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: vi.fn(),
}))

vi.mock("~/services/aiApiVerification", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/aiApiVerification")>()
  return {
    ...actual,
    runApiVerificationProbe: vi.fn(),
  }
})

describe("webAiApiCheck background handlers", () => {
  it("shouldPrompt returns false when auto-detect is disabled", async () => {
    vi.resetModules()
    const { userPreferences } = await import("~/services/userPreferences")
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      webAiApiCheck: {
        enabled: true,
        autoDetect: {
          enabled: false,
          urlWhitelist: { patterns: ["^https://example\\.com"] },
        },
      },
    })

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckShouldPrompt,
        pageUrl: "https://example.com/docs",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      shouldPrompt: false,
    })
  })

  it("shouldPrompt returns true when enabled and whitelisted", async () => {
    vi.resetModules()
    const { userPreferences } = await import("~/services/userPreferences")
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      webAiApiCheck: {
        enabled: true,
        autoDetect: {
          enabled: true,
          urlWhitelist: { patterns: ["^https://example\\.com"] },
        },
      },
    })

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckShouldPrompt,
        pageUrl: "https://example.com/docs",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      shouldPrompt: true,
    })
  })

  it("fetchModels normalizes baseUrl and returns model ids", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/apiService/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockResolvedValue(["m1", "m2"])

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1/chat/completions",
        apiKey: "sk-abcdef123456",
      },
      sendResponse,
    )

    expect(fetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-abcdef123456",
    })
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      modelIds: ["m1", "m2"],
    })
  })

  it("fetchModels sanitizes apiKey in error messages", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/apiService/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue(
      new Error("Unauthorized: sk-secret-xyz"),
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret-xyz",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unauthorized: [REDACTED]",
    })
  })

  it("runProbe sanitizes apiKey when probe execution throws", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Forbidden: sk-secret-xyz"),
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckRunProbe,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1",
        apiKey: "sk-secret-xyz",
        modelId: "gpt-4o-mini",
        probeId: "text-generation",
      },
      sendResponse,
    )

    const response = sendResponse.mock.calls[0]?.[0] as any
    expect(response?.success).toBe(true)
    expect(response?.result?.status).toBe("fail")
    expect(response?.result?.summary).toBe("Forbidden: [REDACTED]")
  })
})
