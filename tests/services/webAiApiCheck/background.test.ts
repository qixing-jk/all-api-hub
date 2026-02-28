import { describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
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

vi.mock("~/services/apiService/google", () => ({
  fetchGoogleModelIds: vi.fn(),
}))

vi.mock("~/services/apiService/anthropic", () => ({
  fetchAnthropicModelIds: vi.fn(),
}))

vi.mock(
  "~/services/apiCredentialProfiles/apiCredentialProfilesStorage",
  () => ({
    apiCredentialProfilesStorage: {
      createProfile: vi.fn(),
    },
  }),
)

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
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      webAiApiCheck: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
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
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      webAiApiCheck: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
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

  it("fetchModels supports google and strips /v1beta from baseUrl", async () => {
    vi.resetModules()
    const { fetchGoogleModelIds } = await import("~/services/apiService/google")
    vi.mocked(fetchGoogleModelIds).mockResolvedValue([
      "gemini-1.0",
      "gemini-2.0",
    ])

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "google",
        baseUrl: "https://proxy.example.com/api/v1beta/models",
        apiKey: "AIza-test-key",
      },
      sendResponse,
    )

    expect(fetchGoogleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example.com/api",
      apiKey: "AIza-test-key",
    })
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      modelIds: ["gemini-1.0", "gemini-2.0"],
    })
  })

  it("fetchModels supports anthropic and strips /v1 from baseUrl", async () => {
    vi.resetModules()
    const { fetchAnthropicModelIds } = await import(
      "~/services/apiService/anthropic"
    )
    vi.mocked(fetchAnthropicModelIds).mockResolvedValue([
      "claude-3-7-sonnet-latest",
      "claude-3-5-haiku-latest",
    ])

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "anthropic",
        baseUrl: "https://api.anthropic.com/v1/messages",
        apiKey: "sk-ant-test-key",
      },
      sendResponse,
    )

    expect(fetchAnthropicModelIds).toHaveBeenCalledWith({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-key",
    })
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      modelIds: ["claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
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

  it("saveProfile normalizes baseUrl and persists a profile without echoing secrets", async () => {
    vi.resetModules()

    const { apiCredentialProfilesStorage } = await import(
      "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
    )

    vi.mocked(apiCredentialProfilesStorage.createProfile).mockResolvedValue({
      id: "p-1",
      name: "proxy.example.com (OpenAI-compatible)",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-secret-xyz",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    } as any)

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckSaveProfile,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1/chat/completions",
        apiKey: "sk-secret-xyz",
        pageUrl: "https://example.com/docs",
      },
      sendResponse,
    )

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith({
      name: "proxy.example.com (OpenAI-compatible)",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-secret-xyz",
      tagIds: [],
      notes: "",
    })

    const response = sendResponse.mock.calls[0]?.[0] as any
    expect(response?.success).toBe(true)
    expect(response?.profileId).toBe("p-1")
    expect(response?.baseUrl).toBe("https://proxy.example.com/api")
    expect(response?.apiType).toBe("openai-compatible")
    expect(response?.name).toBe("proxy.example.com (OpenAI-compatible)")
    expect(response?.apiKey).toBeUndefined()
  })
})
