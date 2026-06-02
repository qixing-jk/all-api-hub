import { describe, expect, it, vi } from "vitest"

import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/events"

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

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: vi.fn(),
}))

vi.mock("~/services/aiApi/google", () => ({
  fetchGoogleModelIds: vi.fn(),
}))

vi.mock("~/services/aiApi/anthropic", () => ({
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

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "   ",
    })

    expect(response).toEqual({
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
          enhanced: { enabled: true },
          urlWhitelist: { patterns: ["^https://example\\.com"] },
        },
      },
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "https://example.com/docs",
    })

    expect(response).toEqual({
      success: true,
      shouldPrompt: false,
      enhancedShouldPrompt: false,
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
          enhanced: { enabled: true },
          urlWhitelist: { patterns: ["^https://example\\.com"] },
        },
      },
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "https://example.com/docs",
    })

    expect(response).toEqual({
      success: true,
      shouldPrompt: true,
      enhancedShouldPrompt: true,
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

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "https://example.com/docs",
    })

    expect(response).toEqual({
      success: true,
      shouldPrompt: false,
      enhancedShouldPrompt: false,
    })
  })

  it("fetchModels rejects requests with missing required fields", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai-compatible",
      baseUrl: " ",
      apiKey: "",
    })

    expect(response).toEqual({
      success: false,
      error: "Missing apiType, baseUrl, or apiKey",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("fetchModels rejects invalid base urls before calling providers", async () => {
    vi.resetModules()
    const { fetchGoogleModelIds } = await import("~/services/aiApi/google")

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "google",
      baseUrl: "not a url",
      apiKey: "AIza-test-key",
    })

    expect(fetchGoogleModelIds).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      error: "Invalid baseUrl",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("fetchModels normalizes baseUrl and returns model ids", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/aiApi/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockResolvedValue(["m1", "m2"])

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1/chat/completions",
      apiKey: "sk-test-background-fixture-12345",
    })

    expect(fetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-background-fixture-12345",
    })
    expect(response).toEqual({
      success: true,
      modelIds: ["m1", "m2"],
    })
  })

  it("fetchModels supports google and strips /v1beta from baseUrl", async () => {
    vi.resetModules()
    const { fetchGoogleModelIds } = await import("~/services/aiApi/google")
    vi.mocked(fetchGoogleModelIds).mockResolvedValue([
      "gemini-1.0",
      "gemini-2.0",
    ])

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "google",
      baseUrl: "https://proxy.example.com/api/v1beta/models",
      apiKey: "AIza-test-key",
    })

    expect(fetchGoogleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example.com/api",
      apiKey: "AIza-test-key",
    })
    expect(response).toEqual({
      success: true,
      modelIds: ["gemini-1.0", "gemini-2.0"],
    })
  })

  it("fetchModels supports anthropic and strips /v1 from baseUrl", async () => {
    vi.resetModules()
    const { fetchAnthropicModelIds } = await import(
      "~/services/aiApi/anthropic"
    )
    vi.mocked(fetchAnthropicModelIds).mockResolvedValue([
      "claude-3-7-sonnet-latest",
      "claude-3-5-haiku-latest",
    ])

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "anthropic",
      baseUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "sk-ant-test-key",
    })

    expect(fetchAnthropicModelIds).toHaveBeenCalledWith({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-key",
    })
    expect(response).toEqual({
      success: true,
      modelIds: ["claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
    })
  })

  it("fetchModels sanitizes apiKey in error messages", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/aiApi/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue(
      new Error("Unauthorized: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test-secret-fixture",
    })

    expect(response).toEqual({
      success: false,
      error: "Unauthorized: [REDACTED]",
    })
  })

  it("fetchModels does not expose message-derived status codes to analytics", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/aiApi/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue(
      new Error("Unauthorized 401: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test-secret-fixture",
    })

    expect(response).toEqual({
      success: false,
      error: "Unauthorized 401: [REDACTED]",
    })
    expect(response).not.toHaveProperty("errorStatusCode")
  })

  it("fetchModels returns structured status codes for analytics classification", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/aiApi/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue({
      statusCode: 401,
      message: "Unauthorized: sk-test-secret-fixture",
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test-secret-fixture",
    })

    expect(response).toEqual({
      success: false,
      error: "Unauthorized: [REDACTED]",
      errorStatusCode: 401,
    })
  })

  it("fetchModels returns a stable error for unsupported api types after generic normalization", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "custom-api" as any,
      baseUrl: "proxy.example.com/api",
      apiKey: "sk-test-unsupported",
    })

    expect(response).toEqual({
      success: false,
      error: "Unsupported apiType",
    })
  })

  it("runProbe rejects requests with missing required fields", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      probeId: "" as any,
    })

    expect(response).toEqual({
      success: false,
      error: "Missing apiType, baseUrl, apiKey, or probeId",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("runProbe rejects invalid base urls before dispatching a probe", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "not a url",
      apiKey: "sk-test-secret-fixture",
      probeId: "text-generation",
    })

    expect(runApiVerificationProbe).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      error: "Invalid baseUrl",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
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

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "   ",
      probeId: "text-generation",
    })

    expect(runApiVerificationProbe).toHaveBeenCalledWith({
      apiType: "openai-compatible",
      apiKey: "sk-test-secret-fixture",
      baseUrl: "https://proxy.example.com/api",
      modelId: undefined,
      probeId: "text-generation",
    })
    expect(response).toEqual({
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
      new Error("Forbidden: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    const responsePayload = response as any
    expect(responsePayload?.success).toBe(true)
    expect(responsePayload?.result?.status).toBe("fail")
    expect(responsePayload?.result?.summary).toBe("Forbidden: [REDACTED]")
  })

  it("runProbe omits analytics HTTP status when status is message-derived", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Forbidden 401: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    const responsePayload = response as any
    expect(responsePayload?.success).toBe(true)
    expect(responsePayload?.result?.summaryKey).toBe(
      "verifyDialog.summaries.unauthorized",
    )
    expect(responsePayload?.result?.summaryParams).toEqual({ status: 401 })
    expect(responsePayload?.result?.output).toBeUndefined()
  })

  it("runProbe exposes structured HTTP status for analytics classification", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue({
      response: { status: 401 },
      message: "Forbidden: sk-test-secret-fixture",
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    const responsePayload = response as any
    expect(responsePayload?.success).toBe(true)
    expect(responsePayload?.result?.output).toEqual({ inferredHttpStatus: 401 })
  })

  it("runProbe omits summary params when the failure has no inferable status code", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Socket hang up: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      probeId: "text-generation",
    })

    expect(response).toEqual({
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
      apiKey: "sk-test-secret-fixture",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    } as any)

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1/chat/completions",
      apiKey: "sk-test-secret-fixture",
      pageUrl: "https://example.com/docs",
    })

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith({
      name: "proxy.example.com",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-secret-fixture",
      tagIds: [],
      notes: "",
    })

    const responsePayload = response as any
    expect(responsePayload?.success).toBe(true)
    expect(responsePayload?.profileId).toBe("p-1")
    expect(responsePayload?.baseUrl).toBe("https://proxy.example.com/api")
    expect(responsePayload?.apiType).toBe("openai-compatible")
    expect(responsePayload?.name).toBe("proxy.example.com")
    expect(responsePayload?.apiKey).toBeUndefined()
  })

  it("saveProfile rejects missing required fields", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "",
      apiKey: "",
    })

    expect(response).toEqual({
      success: false,
      error: "Missing apiType, baseUrl, or apiKey",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("saveProfile rejects invalid base urls", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "not a url",
      apiKey: "sk-test-valid-enough",
    })

    expect(response).toEqual({
      success: false,
      error: "Invalid baseUrl",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("saveProfile sanitizes apiKey when profile creation fails", async () => {
    vi.resetModules()

    const { apiCredentialProfilesStorage } = await import(
      "~/services/apiCredentialProfiles/apiCredentialProfilesStorage"
    )

    vi.mocked(apiCredentialProfilesStorage.createProfile).mockRejectedValue(
      new Error("duplicate key sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      name: "  My Profile  ",
    })

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith({
      name: "My Profile",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-secret-fixture",
      tagIds: [],
      notes: "",
    })
    expect(response).toEqual({
      success: false,
      error: "duplicate key [REDACTED]",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
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

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "https://example.com/docs",
    })

    expect(response).toEqual({
      success: false,
      error: "Failed to handle request",
    })
  })
})
