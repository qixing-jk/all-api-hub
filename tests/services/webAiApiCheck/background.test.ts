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

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...actual,
    runApiVerificationProbe: vi.fn(),
  }
})

describe("webAiApiCheck background handlers", () => {
  it("shouldPrompt rejects missing page urls", async () => {
    vi.resetModules()

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckShouldPrompt,
        pageUrl: "   ",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Missing pageUrl",
    })
  })

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
      "~/services/verification/webAiApiCheck/background"
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
      "~/services/verification/webAiApiCheck/background"
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

  it("shouldPrompt falls back to default web-ai-api-check preferences when the section is missing", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      webAiApiCheck: undefined,
    })

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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

  it("fetchModels rejects requests with missing required fields", async () => {
    vi.resetModules()

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai-compatible",
        baseUrl: " ",
        apiKey: "",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Missing apiType, baseUrl, or apiKey",
    })
  })

  it("fetchModels rejects invalid base urls before calling providers", async () => {
    vi.resetModules()
    const { fetchGoogleModelIds } = await import("~/services/apiService/google")

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "google",
        baseUrl: "not a url",
        apiKey: "AIza-test-key",
      },
      sendResponse,
    )

    expect(fetchGoogleModelIds).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Invalid baseUrl",
    })
  })

  it("fetchModels normalizes baseUrl and returns model ids", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/apiService/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockResolvedValue(["m1", "m2"])

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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
      "~/services/verification/webAiApiCheck/background"
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
      "~/services/verification/webAiApiCheck/background"
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
      "~/services/verification/webAiApiCheck/background"
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

  it("fetchModels does not expose message-derived status codes to analytics", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/apiService/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue(
      new Error("Unauthorized 401: sk-secret-xyz"),
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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
      error: "Unauthorized 401: [REDACTED]",
    })
  })

  it("fetchModels returns structured status codes for analytics classification", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/apiService/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue({
      statusCode: 401,
      message: "Unauthorized: sk-secret-xyz",
    })

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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
      errorStatusCode: 401,
    })
  })

  it("fetchModels returns a stable error for unsupported api types after generic normalization", async () => {
    vi.resetModules()

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "custom-api" as any,
        baseUrl: "proxy.example.com/api",
        apiKey: "sk-test-unsupported",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unsupported apiType",
    })
  })

  it("runProbe rejects requests with missing required fields", async () => {
    vi.resetModules()

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckRunProbe,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1",
        apiKey: "sk-secret-xyz",
        probeId: "" as any,
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Missing apiType, baseUrl, apiKey, or probeId",
    })
  })

  it("runProbe rejects invalid base urls before dispatching a probe", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckRunProbe,
        apiType: "openai-compatible",
        baseUrl: "not a url",
        apiKey: "sk-secret-xyz",
        probeId: "text-generation",
      },
      sendResponse,
    )

    expect(runApiVerificationProbe).not.toHaveBeenCalled()
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Invalid baseUrl",
    })
  })

  it("runProbe forwards undefined model ids when the input only contains whitespace", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockResolvedValue({
      id: "text-generation",
      status: "pass",
      latencyMs: 42,
      summary: "ok",
      input: {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
      },
    } as any)

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckRunProbe,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1",
        apiKey: "sk-secret-xyz",
        modelId: "   ",
        probeId: "text-generation",
      },
      sendResponse,
    )

    expect(runApiVerificationProbe).toHaveBeenCalledWith({
      apiType: "openai-compatible",
      apiKey: "sk-secret-xyz",
      baseUrl: "https://proxy.example.com/api",
      modelId: undefined,
      probeId: "text-generation",
    })
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      result: {
        id: "text-generation",
        status: "pass",
        latencyMs: 42,
        summary: "ok",
        input: {
          apiType: "openai-compatible",
          baseUrl: "https://proxy.example.com/api",
        },
      },
    })
  })

  it("runProbe sanitizes apiKey when probe execution throws", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Forbidden: sk-secret-xyz"),
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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

  it("runProbe omits analytics HTTP status when status is message-derived", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Forbidden 401: sk-secret-xyz"),
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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
    expect(response?.result?.summaryKey).toBe(
      "verifyDialog.summaries.unauthorized",
    )
    expect(response?.result?.summaryParams).toEqual({ status: 401 })
    expect(response?.result?.output).toBeUndefined()
  })

  it("runProbe exposes structured HTTP status for analytics classification", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue({
      response: { status: 401 },
      message: "Forbidden: sk-secret-xyz",
    })

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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
    expect(response?.result?.output).toEqual({ inferredHttpStatus: 401 })
  })

  it("runProbe omits summary params when the failure has no inferable status code", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Socket hang up: sk-secret-xyz"),
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckRunProbe,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1",
        apiKey: "sk-secret-xyz",
        probeId: "text-generation",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      result: {
        id: "text-generation",
        status: "fail",
        latencyMs: 0,
        summary: "Socket hang up: [REDACTED]",
        summaryKey: undefined,
        summaryParams: undefined,
        input: {
          apiType: "openai-compatible",
          baseUrl: "https://proxy.example.com/api",
        },
      },
    })
  })

  it("saveProfile normalizes baseUrl and persists a profile without echoing secrets", async () => {
    vi.resetModules()

    const { apiCredentialProfilesStorage } = await import(
      "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
    )

    vi.mocked(apiCredentialProfilesStorage.createProfile).mockResolvedValue({
      id: "p-1",
      name: "proxy.example.com",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-secret-xyz",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    } as any)

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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
      name: "proxy.example.com",
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
    expect(response?.name).toBe("proxy.example.com")
    expect(response?.apiKey).toBeUndefined()
  })

  it("saveProfile rejects missing required fields", async () => {
    vi.resetModules()

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckSaveProfile,
        apiType: "openai-compatible",
        baseUrl: "",
        apiKey: "",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Missing apiType, baseUrl, or apiKey",
    })
  })

  it("saveProfile rejects invalid base urls", async () => {
    vi.resetModules()

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckSaveProfile,
        apiType: "openai-compatible",
        baseUrl: "not a url",
        apiKey: "sk-valid-enough",
      },
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Invalid baseUrl",
    })
  })

  it("saveProfile sanitizes apiKey when profile creation fails", async () => {
    vi.resetModules()

    const { apiCredentialProfilesStorage } = await import(
      "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
    )

    vi.mocked(apiCredentialProfilesStorage.createProfile).mockRejectedValue(
      new Error("duplicate key sk-secret-xyz"),
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: RuntimeActionIds.ApiCheckSaveProfile,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1",
        apiKey: "sk-secret-xyz",
        name: "  My Profile  ",
      },
      sendResponse,
    )

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith({
      name: "My Profile",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-secret-xyz",
      tagIds: [],
      notes: "",
    })
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "duplicate key [REDACTED]",
    })
  })

  it("returns an error for unknown actions", async () => {
    vi.resetModules()

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const sendResponse = vi.fn()
    await handleWebAiApiCheckMessage(
      {
        action: "unknown-action",
      } as any,
      sendResponse,
    )

    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("falls back to a generic error when the top-level handler throws", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockRejectedValue(
      new Error("preferences exploded"),
    )

    const { handleWebAiApiCheckMessage } = await import(
      "~/services/verification/webAiApiCheck/background"
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
      success: false,
      error: "Failed to handle request",
    })
  })
})
