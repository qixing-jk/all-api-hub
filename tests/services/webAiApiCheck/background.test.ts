import { describe, expect, it, vi } from "vitest"

import { DEFAULT_PREFERENCES } from "~/services/preferences/userPreferences"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/events"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"
import { WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT } from "~/services/verification/webAiApiCheck/constants"

const { onWebAiApiCheckMessageMock, webAiApiCheckMessageHandlers } = vi.hoisted(
  () => ({
    webAiApiCheckMessageHandlers: new Map<
      string,
      (payload: { data: any }) => unknown
    >(),
    onWebAiApiCheckMessageMock: vi.fn(
      (type: string, handler: (payload: { data: any }) => unknown) => {
        webAiApiCheckMessageHandlers.set(type, handler)
        return vi.fn()
      },
    ),
  }),
)

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

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

vi.mock("~/services/verification/webAiApiCheck/messaging", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/verification/webAiApiCheck/messaging")
  >("~/services/verification/webAiApiCheck/messaging")
  return {
    ...actual,
    onWebAiApiCheckMessage: onWebAiApiCheckMessageMock,
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

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    listTags: vi.fn(),
    createTag: vi.fn(),
    renameTag: vi.fn(),
  },
}))

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
      abortSignal: undefined,
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

  it("runProbe can be cancelled by run id while the probe is in flight", async () => {
    vi.resetModules()
    let receivedSignal: AbortSignal | undefined
    const probeDeferred = createDeferred<ApiVerificationProbeResult>()

    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockImplementation(
      async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return await probeDeferred.promise
      },
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const probePromise = background.resolveWebAiApiCheckRunProbeMessage({
      runId: "web-ai-api-check-run-1",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    await vi.waitFor(() => {
      expect(receivedSignal).toBeInstanceOf(AbortSignal)
    })

    const cancelResponse =
      await background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: "web-ai-api-check-run-1",
      })

    expect(cancelResponse).toEqual({ success: true, cancelled: true })
    expect(receivedSignal?.aborted).toBe(true)

    probeDeferred.resolve({
      id: "text-generation",
      status: "fail",
      latencyMs: 0,
      summary: "Cancelled by user",
      input: {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
      },
    })
    await expect(probePromise).resolves.toMatchObject({
      success: true,
      result: {
        id: "text-generation",
        status: "fail",
        summary: "Cancelled by user",
      },
    })

    const secondCancelResponse =
      await background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: "web-ai-api-check-run-1",
      })
    expect(secondCancelResponse).toEqual({ success: true, cancelled: false })
  })

  it("cancelRunProbe rejects malformed run ids without throwing", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    await expect(
      background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: undefined,
      } as any),
    ).resolves.toEqual({ success: true, cancelled: false })
  })

  it("cancelRunProbe returns a safe response when abort throws", async () => {
    vi.resetModules()
    let receivedSignal: AbortSignal | undefined
    const probeDeferred = createDeferred<ApiVerificationProbeResult>()

    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockImplementation(
      async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return await probeDeferred.promise
      },
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const probePromise = background.resolveWebAiApiCheckRunProbeMessage({
      runId: "web-ai-api-check-run-throws",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    await vi.waitFor(() => {
      expect(receivedSignal).toBeInstanceOf(AbortSignal)
    })

    const abortSpy = vi
      .spyOn(AbortController.prototype, "abort")
      .mockImplementation(() => {
        throw new Error("abort failed")
      })

    await expect(
      background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: "web-ai-api-check-run-throws",
      }),
    ).resolves.toEqual({ success: true, cancelled: false })

    abortSpy.mockRestore()

    probeDeferred.resolve({
      id: "text-generation",
      status: "fail",
      latencyMs: 0,
      summary: "Cancelled by user",
      input: {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
      },
    })
    await probePromise
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
      tagIds: ["tag-work", " tag-work ", "", "tag-expiring"],
      notes: "  shared by Alice  ",
      expiresAt: 1790812800000,
    })

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith({
      name: "proxy.example.com",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-secret-fixture",
      tagIds: ["tag-work", " tag-work ", "", "tag-expiring"],
      notes: "  shared by Alice  ",
      expiresAt: 1790812800000,
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

  it("records Base URL history and returns current suggestions", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const recordUseSpy = vi
      .spyOn(webAiApiCheckBaseUrlHistoryStorage, "recordUse")
      .mockResolvedValue({
        version: 1,
        entries: [],
        lastUpdated: 123,
      })
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "getSuggestions",
    ).mockResolvedValue([
      {
        baseUrl: "https://canonical.example.com",
        lastUsedAt: 123,
        useCount: 2,
      },
    ])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRecordBaseUrlHistoryMessage({
        baseUrl: "https://canonical.example.com/api/v1/models",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(recordUseSpy).toHaveBeenCalledWith({
      baseUrl: "https://canonical.example.com/api/v1/models",
      pageUrl: "https://docs.example.invalid/setup",
    })
    expect(response).toEqual({
      success: true,
      suggestions: [
        {
          baseUrl: "https://canonical.example.com",
          lastUsedAt: 123,
          useCount: 2,
        },
      ],
    })
  })

  it("returns Base URL history suggestions through the registered background handler", async () => {
    vi.resetModules()
    onWebAiApiCheckMessageMock.mockClear()
    webAiApiCheckMessageHandlers.clear()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const getSuggestionsSpy = vi
      .spyOn(webAiApiCheckBaseUrlHistoryStorage, "getSuggestions")
      .mockResolvedValue([
        {
          baseUrl: "https://suggested.example.com",
          lastUsedAt: 123,
          useCount: 2,
          matchedSourceOrigin: "https://docs.example.invalid",
        },
      ])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )

    background.setupWebAiApiCheckMessagingListeners()
    const handler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
    )

    await expect(
      handler?.({
        data: {
          pageUrl: "https://docs.example.invalid/setup",
          limit: 2,
        },
      }),
    ).resolves.toEqual({
      success: true,
      suggestions: [
        {
          baseUrl: "https://suggested.example.com",
          lastUsedAt: 123,
          useCount: 2,
          matchedSourceOrigin: "https://docs.example.invalid",
        },
      ],
    })
    expect(getSuggestionsSpy).toHaveBeenCalledWith({
      pageUrl: "https://docs.example.invalid/setup",
      limit: 2,
    })
  })

  it("returns a safe failure when Base URL history suggestions cannot be read", async () => {
    vi.resetModules()
    onWebAiApiCheckMessageMock.mockClear()
    webAiApiCheckMessageHandlers.clear()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "getSuggestions",
    ).mockRejectedValue(new Error("database path leaked"))
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )

    background.setupWebAiApiCheckMessagingListeners()
    const handler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
    )

    await expect(
      handler?.({
        data: {
          pageUrl: "https://docs.example.invalid/setup",
          limit: 2,
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: "Failed to read Base URL history",
    })
  })

  it("records no Base URL history for blank input but still returns suggestions", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const recordUseSpy = vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "recordUse",
    )
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "getSuggestions",
    ).mockResolvedValue([])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRecordBaseUrlHistoryMessage({
        baseUrl: "   ",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(recordUseSpy).not.toHaveBeenCalled()
    expect(response).toEqual({ success: true, suggestions: [] })
  })

  it("keeps record Base URL history best-effort when storage fails", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    vi.spyOn(webAiApiCheckBaseUrlHistoryStorage, "recordUse").mockRejectedValue(
      new Error("storage unavailable"),
    )
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRecordBaseUrlHistoryMessage({
        baseUrl: "https://canonical.example.com/api/v1/models",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(response).toEqual({ success: true })
  })

  it("removes a stored Base URL history entry and returns current suggestions", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const removeBaseUrlSpy = vi
      .spyOn(webAiApiCheckBaseUrlHistoryStorage, "removeBaseUrl")
      .mockResolvedValue({
        version: 1,
        entries: [],
        lastUpdated: 123,
      })
    const getSuggestionsSpy = vi
      .spyOn(webAiApiCheckBaseUrlHistoryStorage, "getSuggestions")
      .mockResolvedValue([
        {
          baseUrl: "https://keep.example.com",
          lastUsedAt: 123,
          useCount: 1,
        },
      ])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRemoveBaseUrlHistoryMessage({
        baseUrl: "https://remove.example.com/api/v1/models",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(removeBaseUrlSpy).toHaveBeenCalledWith({
      baseUrl: "https://remove.example.com/api/v1/models",
    })
    expect(getSuggestionsSpy).toHaveBeenCalledWith({
      pageUrl: "https://docs.example.invalid/setup",
      limit: WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT,
    })
    expect(response).toEqual({
      success: true,
      suggestions: [
        {
          baseUrl: "https://keep.example.com",
          lastUsedAt: 123,
          useCount: 1,
        },
      ],
    })
  })

  it("removes no Base URL history for blank input but still returns suggestions", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const removeBaseUrlSpy = vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "removeBaseUrl",
    )
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "getSuggestions",
    ).mockResolvedValue([])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRemoveBaseUrlHistoryMessage({
        baseUrl: "   ",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(removeBaseUrlSpy).not.toHaveBeenCalled()
    expect(response).toEqual({ success: true, suggestions: [] })
  })

  it("keeps remove Base URL history best-effort when storage fails", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "removeBaseUrl",
    ).mockRejectedValue(new Error("storage unavailable"))
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRemoveBaseUrlHistoryMessage({
        baseUrl: "https://remove.example.com/api/v1/models",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(response).toEqual({ success: true })
  })

  it("registers the cancel-run-probe background message handler", async () => {
    vi.resetModules()
    onWebAiApiCheckMessageMock.mockClear()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    const { tagStorage } = await import("~/services/tags/tagStorage")

    vi.mocked(tagStorage.listTags).mockResolvedValue([
      { id: "tag-work", name: "Work", createdAt: 1, updatedAt: 1 },
    ])
    vi.mocked(tagStorage.createTag).mockResolvedValue({
      id: "tag-created",
      name: "Created",
      createdAt: 2,
      updatedAt: 2,
    })
    vi.mocked(tagStorage.renameTag).mockResolvedValue({
      id: "tag-work",
      name: "Renamed",
      createdAt: 1,
      updatedAt: 3,
    })
    background.setupWebAiApiCheckMessagingListeners()
    background.setupWebAiApiCheckMessagingListeners()

    expect(onWebAiApiCheckMessageMock).toHaveBeenCalledTimes(11)
    expect(
      onWebAiApiCheckMessageMock.mock.calls.map((call) => call[0]),
    ).toEqual([
      WebAiApiCheckMessageTypes.ShouldPrompt,
      WebAiApiCheckMessageTypes.FetchModels,
      WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
      WebAiApiCheckMessageTypes.RecordBaseUrlHistory,
      WebAiApiCheckMessageTypes.RemoveBaseUrlHistory,
      WebAiApiCheckMessageTypes.ListTags,
      WebAiApiCheckMessageTypes.CreateTag,
      WebAiApiCheckMessageTypes.RenameTag,
      WebAiApiCheckMessageTypes.RunProbe,
      WebAiApiCheckMessageTypes.CancelRunProbe,
      WebAiApiCheckMessageTypes.SaveProfile,
    ])

    const cancelHandler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.CancelRunProbe,
    )
    expect(cancelHandler).toEqual(expect.any(Function))
    await expect(
      cancelHandler?.({ data: { runId: "missing-run" } }),
    ).resolves.toEqual({ success: true, cancelled: false })

    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.ListTags)?.({
        data: {},
      }),
    ).resolves.toEqual({
      success: true,
      tags: [{ id: "tag-work", name: "Work", createdAt: 1, updatedAt: 1 }],
    })
    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.CreateTag)?.({
        data: { name: "Created" },
      }),
    ).resolves.toEqual({
      success: true,
      tag: { id: "tag-created", name: "Created", createdAt: 2, updatedAt: 2 },
    })
    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.RenameTag)?.({
        data: { tagId: "tag-work", name: "Renamed" },
      }),
    ).resolves.toEqual({
      success: true,
      tag: { id: "tag-work", name: "Renamed", createdAt: 1, updatedAt: 3 },
    })
    expect(tagStorage.createTag).toHaveBeenCalledWith("Created")
    expect(tagStorage.renameTag).toHaveBeenCalledWith("tag-work", "Renamed")
  })

  it("tag message handlers return sanitized errors when tag storage rejects", async () => {
    vi.resetModules()
    onWebAiApiCheckMessageMock.mockClear()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    const { tagStorage } = await import("~/services/tags/tagStorage")

    vi.mocked(tagStorage.listTags).mockRejectedValue(new Error("list failed"))
    vi.mocked(tagStorage.createTag).mockRejectedValue(
      new Error("create failed"),
    )
    vi.mocked(tagStorage.renameTag).mockRejectedValue(
      new Error("rename failed"),
    )

    background.setupWebAiApiCheckMessagingListeners()

    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.ListTags)?.({
        data: {},
      }),
    ).resolves.toEqual({
      success: false,
      error: "Failed to list tags",
    })
    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.CreateTag)?.({
        data: { name: "Created" },
      }),
    ).resolves.toEqual({
      success: false,
      error: "create failed",
    })
    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.RenameTag)?.({
        data: { tagId: "tag-work", name: "Renamed" },
      }),
    ).resolves.toEqual({
      success: false,
      error: "rename failed",
    })
  })
})
