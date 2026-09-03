import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { decodeNewApiResponseError } from "~/services/apiService/newApiFamily/responseError"
import { createDeferredAbortDeadline } from "~/services/apiTransport/abortableTask"
import {
  ApiError,
  API_ERROR_CODES as ApiErrorCodes,
} from "~/services/apiTransport/errors"
import {
  fetchApi,
  fetchApiData,
  fetchApiResponse,
} from "~/services/apiTransport/request"
import {
  extractDataFromApiResponseBody,
  isHttpUrl,
} from "~/services/apiTransport/response"
import {
  API_AUTH_TOKEN_MODES,
  API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
} from "~/services/apiTransport/type"
import { DEFAULT_AUTOMATIC_FEATURE_BYPASS } from "~/services/preferences/tempWindowFallbackPreferences"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import {
  COOKIE_AUTH_HEADER_NAME,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
} from "~/utils/browser/cookieHelper"
import { server } from "~~/tests/msw/server"
import { runMockSiteRequestTask } from "~~/tests/test-utils/siteRequestLease"

const { mockLogRequestRateLimiter, mockCreateMinIntervalLimiter } = vi.hoisted(
  () => {
    const mockLogRequestRateLimiter = vi.fn().mockResolvedValue(undefined)
    const mockCreateMinIntervalLimiter = vi.fn(() => mockLogRequestRateLimiter)

    return { mockLogRequestRateLimiter, mockCreateMinIntervalLimiter }
  },
)

const { mockWithSiteApiRequestLimit } = vi.hoisted(() => {
  const mockWithSiteApiRequestLimit = vi.fn()

  return { mockWithSiteApiRequestLimit }
})

const { mockHasCookieInterceptorPermissions, mockGetPreferences } = vi.hoisted(
  () => ({
    mockHasCookieInterceptorPermissions: vi.fn(),
    mockGetPreferences: vi.fn(),
  }),
)

const {
  mockOnRuntimeMessage,
  mockSendTabMessageWithRetry,
  mockSendRuntimeMessage,
  runtimeMessageListeners,
} = vi.hoisted(() => {
  const runtimeMessageListeners = new Set<(message: any) => void>()
  return {
    mockOnRuntimeMessage: vi.fn((listener: (message: any) => void) => {
      runtimeMessageListeners.add(listener)
      return () => runtimeMessageListeners.delete(listener)
    }),
    mockSendTabMessageWithRetry: vi.fn(),
    mockSendRuntimeMessage: vi.fn(),
    runtimeMessageListeners,
  }
})

function emitRuntimeMessage(message: unknown): void {
  for (const listener of runtimeMessageListeners) listener(message)
}

const { mockIsProtectionBypassFirefoxEnv } = vi.hoisted(() => ({
  mockIsProtectionBypassFirefoxEnv: vi.fn(() => true),
}))

const { mockLoggerDebug } = vi.hoisted(() => ({
  mockLoggerDebug: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    debug: mockLoggerDebug,
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    onRuntimeMessage: mockOnRuntimeMessage,
    sendTabMessageWithRetry: mockSendTabMessageWithRetry,
    sendRuntimeMessage: mockSendRuntimeMessage,
  }
})

vi.mock("~/services/permissions/permissionManager", () => ({
  COOKIE_INTERCEPTOR_PERMISSIONS: [
    "cookies",
    "webRequest",
    "webRequestBlocking",
  ],
  hasCookieInterceptorPermissions: mockHasCookieInterceptorPermissions,
}))

vi.mock("~/services/preferences/userPreferences", async () => {
  const { DEFAULT_AUTOMATIC_FEATURE_BYPASS } = await import(
    "~/services/preferences/tempWindowFallbackPreferences"
  )

  return {
    DEFAULT_PREFERENCES: {
      tempWindowFallback: {
        enabled: false,
        automaticFeatureBypass: {
          ...DEFAULT_AUTOMATIC_FEATURE_BYPASS,
        },
      },
    },
    userPreferences: {
      getPreferences: mockGetPreferences,
    },
  }
})

vi.mock("~/services/apiTransport/minIntervalLimiter", () => ({
  createMinIntervalLimiter: mockCreateMinIntervalLimiter,
}))

vi.mock(
  "~/services/apiTransport/siteRequestLimiter",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/apiTransport/siteRequestLimiter")
      >()
    return {
      ...actual,
      withSiteApiRequestLimit: mockWithSiteApiRequestLimit,
      withSiteApiRequestLease: mockWithSiteApiRequestLimit,
    }
  },
)

vi.mock("~/utils/browser/protectionBypass", () => ({
  isProtectionBypassFirefoxEnv: mockIsProtectionBypassFirefoxEnv,
}))

vi.mock("~/utils/browser/index", () => ({
  isExtensionBackground: vi.fn(() => false),
  isExtensionOptions: vi.fn(() => false),
  isExtensionPopup: vi.fn(() => false),
  isExtensionSidePanel: vi.fn(() => false),
}))

vi.mock("~/utils/browser/extensionPageUrls", () => ({
  OPTIONS_PAGE_URL: "chrome-extension://test/options.html",
}))

const BASE_URL = "https://example.com/base/"
const ENDPOINT = "/api/test"
const API_URL = "https://example.com/base/api/test"
const backgroundProtectionBypassExecution = {
  version: PROTECTION_BYPASS_EXECUTION_VERSION,
  kind: "automatic",
  feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
  surface: PROTECTION_BYPASS_SURFACES.Background,
} as const

function mockTempWindowFallbackDisabledResponse() {
  mockSendRuntimeMessage.mockResolvedValueOnce({
    success: false,
    error: "messages:background.tempWindowPolicyContextInvalid",
    code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
  })
}

async function expectTempWindowDisabledFallback(
  endpoint: string = ENDPOINT,
): Promise<void> {
  await expect(
    fetchApiData(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        protectionBypassExecution: backgroundProtectionBypassExecution,
      },
      { endpoint },
    ),
  ).rejects.toMatchObject({
    code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
    originalCode: "HTTP_403",
    message: "请求失败: 403",
  })
}

describe("apiTransport request helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    server.resetHandlers()

    mockHasCookieInterceptorPermissions.mockReset()
    mockGetPreferences.mockReset()
    mockWithSiteApiRequestLimit.mockImplementation(
      async (_key: string, task: () => any, _signal?: AbortSignal) =>
        await runMockSiteRequestTask(task),
    )
    mockHasCookieInterceptorPermissions.mockResolvedValue(true)
    mockGetPreferences.mockResolvedValue({
      tempWindowFallback: {
        enabled: false,
        automaticFeatureBypass: {
          ...DEFAULT_AUTOMATIC_FEATURE_BYPASS,
        },
      },
    })
    mockSendTabMessageWithRetry.mockReset()
    mockSendRuntimeMessage.mockReset()
    mockOnRuntimeMessage.mockClear()
    runtimeMessageListeners.clear()
    mockSendRuntimeMessage.mockResolvedValue({ success: true })
    mockIsProtectionBypassFirefoxEnv.mockReset()
    mockIsProtectionBypassFirefoxEnv.mockReturnValue(true)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("fetchApiData should build URL with joinUrl and return data on success", async () => {
    const data = { foo: "bar" }
    let callCount = 0
    let capturedUrl: string | null = null
    let capturedCredentials: RequestCredentials | null = null
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        callCount += 1
        capturedUrl = request.url
        capturedCredentials = request.credentials
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({ success: true, data, message: "ok" })
      }),
    )

    const result = await fetchApiData<{ foo: string }>(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          userId: "123",
          accessToken: "token",
        },
      },
      { endpoint: ENDPOINT },
    )

    expect(callCount).toBe(1)
    expect(capturedUrl).toBe(API_URL)
    expect(capturedCredentials).toBe("omit")
    expect(capturedAuthorization).toBe("Bearer token")
    expect(result).toEqual(data)
  })

  it("fetchApiData merges custom headers without dropping auth headers", async () => {
    let capturedAccept: string | null = null
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedAccept = request.headers.get("accept")
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            headers: {
              Accept: "application/json",
            },
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(capturedAccept).toBe("application/json")
    expect(capturedAuthorization).toBe("Bearer token")
  })

  it("uses Bearer authorization for access tokens by default", async () => {
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApi(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-default",
        },
      },
      { endpoint: ENDPOINT },
      true,
    )

    expect(capturedAuthorization).toBe("Bearer jwt-default")
  })

  it("uses raw authorization when authTokenMode is raw", async () => {
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApi(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-raw",
        },
      },
      {
        endpoint: ENDPOINT,
        authTokenMode: API_AUTH_TOKEN_MODES.Raw,
      },
      true,
    )

    expect(capturedAuthorization).toBe("jwt-raw")
  })

  it("keeps caller-provided Authorization header override in raw-token mode", async () => {
    let capturedAuthorization: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApi(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "jwt-from-account",
        },
      },
      {
        endpoint: ENDPOINT,
        authTokenMode: API_AUTH_TOKEN_MODES.Raw,
        options: {
          headers: {
            Authorization: "manual-header",
          },
        },
      },
      true,
    )

    expect(capturedAuthorization).toBe("manual-header")
  })

  it("fetchApiData applies the site API limiter with a normalized origin key", async () => {
    server.use(
      http.get(/^https:\/\/example\.com\/base\//, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: "HTTPS://Example.com/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: "/api/user/self" },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledTimes(1)
    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
      "https://example.com",
      expect.any(Function),
      undefined,
    )
  })

  it.each([
    {
      caseName: "request abort signal",
      createSignals: () => {
        const requestController = new AbortController()
        return {
          requestSignal: requestController.signal,
          optionsSignal: undefined,
          expectedSignal: requestController.signal,
        }
      },
    },
    {
      caseName: "RequestInit signal override",
      createSignals: () => {
        const requestController = new AbortController()
        const optionsController = new AbortController()
        return {
          requestSignal: requestController.signal,
          optionsSignal: optionsController.signal,
          expectedSignal: optionsController.signal,
        }
      },
    },
  ])(
    "fetchApiData passes the effective $caseName to site limiter admission",
    async ({ createSignals }) => {
      const { requestSignal, optionsSignal, expectedSignal } = createSignals()
      server.use(
        http.get(/^https:\/\/example\.invalid\/base\//, () =>
          HttpResponse.json({
            success: true,
            data: { ok: true },
            message: "ok",
          }),
        ),
      )

      await fetchApiData(
        {
          baseUrl: "https://example.invalid/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          abortSignal: requestSignal,
        },
        {
          endpoint: "/api/user/self",
          options: { signal: optionsSignal },
        },
      )

      expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
        "https://example.invalid",
        expect.any(Function),
        expectedSignal,
      )
    },
  )

  it("starts a request timeout only after site-limiter dispatch", async () => {
    vi.useFakeTimers()
    const abortController = new AbortController()
    let dispatchRequest: (() => void) | undefined
    let completeFetch: (() => void) | undefined
    let underlyingCompletion: Promise<unknown> | undefined
    let underlyingCompleted = false
    let receivedSignal: AbortSignal | undefined
    let requestError: unknown
    let requestSettled: Promise<void> | undefined
    let runDispatchedTask: (() => void) | undefined
    let dispatchRequested = false
    let resolveLimiter!: (value: unknown) => void
    let forceRejectLimiter!: (reason?: unknown) => void
    const limiterResult = new Promise<unknown>((resolve, reject) => {
      resolveLimiter = resolve
      forceRejectLimiter = reject
    })
    void limiterResult.catch(() => undefined)
    const dispatchOrQueueRequest = () => {
      dispatchRequested = true
      runDispatchedTask?.()
    }
    dispatchRequest = dispatchOrQueueRequest
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, options) => {
        receivedSignal = options?.signal ?? undefined

        return new Promise<Response>((resolve) => {
          completeFetch = () =>
            resolve(
              new Response(
                JSON.stringify({
                  success: true,
                  data: { ok: true },
                  message: "ok",
                }),
                { headers: { "content-type": "application/json" } },
              ),
            )
        })
      })

    mockWithSiteApiRequestLimit.mockImplementation(
      async (_key: string, task: () => any) => {
        runDispatchedTask = () => {
          runDispatchedTask = undefined
          dispatchRequest = undefined
          const dispatched = task()
          underlyingCompletion = dispatched?.completion
          void underlyingCompletion?.then(() => {
            underlyingCompleted = true
          })
          void (dispatched?.result ?? dispatched).then(
            resolveLimiter,
            forceRejectLimiter,
          )
        }
        if (dispatchRequested) runDispatchedTask()
        return await limiterResult
      },
    )

    try {
      const request = fetchApiData(
        {
          baseUrl: "https://example.invalid/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          abortSignal: abortController.signal,
          requestTimeoutMs: 1_000,
        },
        { endpoint: "/api/user/self" },
      )
      requestSettled = request.then(
        () => undefined,
        (error) => {
          requestError = error
        },
      )

      await vi.advanceTimersByTimeAsync(1_000)
      expect(fetchSpy).not.toHaveBeenCalled()

      dispatchRequest?.()
      await vi.advanceTimersByTimeAsync(0)
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(999)
      expect(receivedSignal?.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      expect(receivedSignal?.aborted).toBe(true)
      await requestSettled
      expect(requestError).toMatchObject({ name: "TimeoutError" })
      expect(underlyingCompleted).toBe(false)

      completeFetch?.()
      await underlyingCompletion
      expect(underlyingCompleted).toBe(true)
    } finally {
      abortController.abort()
      forceRejectLimiter(new DOMException("Test cleanup", "AbortError"))
      await vi.advanceTimersByTimeAsync(0)
      completeFetch?.()
      await underlyingCompletion
      fetchSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("does not notify the lifecycle observer while queued behind the site limiter", async () => {
    const lifecycle: string[] = []
    let dispatchRequest: (() => void) | undefined

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { ok: true },
          message: "ok",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    )
    mockWithSiteApiRequestLimit.mockImplementation(
      async (_key: string, task: () => any) =>
        await new Promise((resolve, reject) => {
          dispatchRequest = () => {
            const dispatched = task()
            void (dispatched?.result ?? dispatched).then(resolve, reject)
          }
        }),
    )

    const request = fetchApiData(
      {
        baseUrl: "https://example.invalid/base/",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        observer: {
          onDispatch: () => lifecycle.push("dispatch"),
          onResponse: () => lifecycle.push("response"),
        },
      },
      { endpoint: "/api/user/self" },
    )

    await vi.waitFor(() => expect(dispatchRequest).toBeTypeOf("function"))
    expect(lifecycle).toEqual([])

    dispatchRequest?.()
    await expect(request).resolves.toEqual({ ok: true })
    expect(lifecycle).toEqual(["dispatch", "response"])
  })

  it("starts a shared deadline when the limiter dispatches the request", async () => {
    const abortController = new AbortController()
    const start = vi.fn()
    server.use(
      http.get("https://example.invalid/base/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        }),
      ),
    )

    await fetchApiData(
      {
        baseUrl: "https://example.invalid/base/",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        abortSignal: abortController.signal,
        abortDeadline: {
          signal: abortController.signal,
          start,
          dispose: vi.fn(),
        },
      },
      { endpoint: "/api/user/self" },
    )

    expect(start).toHaveBeenCalledTimes(1)
  })

  it("aborts a dispatched request when only its shared deadline expires", async () => {
    vi.useFakeTimers()
    const abortDeadline = createDeferredAbortDeadline(1_000)
    let receivedSignal: AbortSignal | undefined
    let settleFetch: (() => void) | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, options) => {
        receivedSignal = options?.signal ?? undefined
        return new Promise<Response>((resolve, reject) => {
          settleFetch = () => resolve(new Response("late response"))
          receivedSignal?.addEventListener(
            "abort",
            () => reject(receivedSignal?.reason),
            { once: true },
          )
        })
      })

    try {
      const request = fetchApiData(
        {
          baseUrl: "https://example.invalid/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          abortDeadline,
        },
        { endpoint: "/api/user/self" },
      )
      void request.catch(() => undefined)

      await vi.advanceTimersByTimeAsync(0)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
        "https://example.invalid",
        expect.any(Function),
        abortDeadline.signal,
      )

      await vi.advanceTimersByTimeAsync(1_000)
      expect(receivedSignal?.aborted).toBe(true)
      await expect(request).rejects.toMatchObject({ name: "TimeoutError" })
    } finally {
      abortDeadline.dispose()
      settleFetch?.()
      fetchSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("does not start a shared deadline for a pre-aborted dispatch", async () => {
    const abortController = new AbortController()
    const start = vi.fn()
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    abortController.abort(new DOMException("Cancelled", "AbortError"))

    await expect(
      fetchApiData(
        {
          baseUrl: "https://example.invalid/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          abortSignal: abortController.signal,
          abortDeadline: {
            signal: abortController.signal,
            start,
            dispose: vi.fn(),
          },
          observer,
        },
        { endpoint: "/api/user/self" },
      ),
    ).rejects.toBe(abortController.signal.reason)

    expect(start).not.toHaveBeenCalled()
    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("notifies dispatch immediately before direct fetch and response before body parsing", async () => {
    const lifecycle: string[] = []
    const response = new Response(null, {
      headers: { "content-type": "application/json" },
    })
    vi.spyOn(response, "json").mockImplementation(async () => {
      lifecycle.push("parse")
      return { success: true, data: { ok: true }, message: "ok" }
    })
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      lifecycle.push("fetch")
      return response
    })

    await expect(
      fetchApiData(
        {
          baseUrl: "https://example.invalid/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          observer: {
            onDispatch: () => lifecycle.push("dispatch"),
            onResponse: () => lifecycle.push("response"),
          },
        },
        { endpoint: "/api/user/self" },
      ),
    ).resolves.toEqual({ ok: true })

    expect(lifecycle).toEqual(["dispatch", "fetch", "response", "parse"])
  })

  it("keeps dispatch evidence without response evidence after network loss", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const networkError = new TypeError("Failed to fetch")
    vi.spyOn(globalThis, "fetch").mockRejectedValue(networkError)

    await expect(
      fetchApiData(
        {
          baseUrl: "https://example.invalid/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          observer,
        },
        { endpoint: "/api/user/self" },
      ),
    ).rejects.toBe(networkError)

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("does not let lifecycle observer failures mask the transport result", async () => {
    server.use(
      http.get("https://example.invalid/base/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        }),
      ),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: "https://example.invalid/base/",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          observer: {
            onDispatch: () => {
              throw new Error("observer dispatch failed")
            },
            onResponse: () => {
              throw new Error("observer response failed")
            },
          },
        },
        { endpoint: "/api/user/self" },
      ),
    ).resolves.toEqual({ ok: true })
  })

  it("fetchApiData uses the same site limiter key for different paths on the same origin", async () => {
    server.use(
      http.get(/^https:\/\/example\.com\/(?:base|admin)\//, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApiData(
      {
        baseUrl: "https://example.com/base/",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: "/api/user/self" },
    )
    await fetchApiData(
      {
        baseUrl: "https://example.com/admin/",
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: "/api/status" },
    )

    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledTimes(2)
    expect(mockWithSiteApiRequestLimit.mock.calls[0][0]).toBe(
      "https://example.com",
    )
    expect(mockWithSiteApiRequestLimit.mock.calls[1][0]).toBe(
      "https://example.com",
    )
  })

  it("fetchApiData forwards cookie auth headers and a session override cookie when available", async () => {
    let capturedCookie: string | null = null
    let capturedCookieAuthMode: string | null = null
    let capturedSessionOverride: string | null = null

    server.use(
      http.get(API_URL, ({ request }) => {
        capturedCookie = request.headers.get("cookie")
        capturedCookieAuthMode = request.headers.get(COOKIE_AUTH_HEADER_NAME)
        capturedSessionOverride = request.headers.get(
          COOKIE_SESSION_OVERRIDE_HEADER_NAME,
        )

        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(capturedCookie).toBe("session=abc123")
    expect(capturedCookieAuthMode).toBe("cookie")
    expect(capturedSessionOverride).toBe("session=abc123")
  })

  it("fetchApiData prefers current-tab content fetch for same-origin read requests", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "ok",
      },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "GET",
            headers: {
              "X-Probe": "auto-detect",
            },
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
    expect(mockSendTabMessageWithRetry).toHaveBeenCalledWith(
      456,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
        fetchUrl: API_URL,
        responseType: "json",
      }),
    )
    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        headers: expect.objectContaining({
          Cookie: "session=abc123",
          "X-Probe": "auto-detect",
        }),
      }),
    )
  })

  it("observes the current-tab response before inspecting its structured result", async () => {
    const lifecycle: string[] = []
    let responseObserved = false
    mockSendTabMessageWithRetry.mockImplementationOnce(
      async (_tabId, payload) => {
        lifecycle.push("content")
        expect(payload).not.toHaveProperty("observer")
        emitRuntimeMessage({
          action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
          requestId: payload.requestId,
        })
        return {
          transportLifecycle: {
            upstreamRequestDispatched: true,
            upstreamResponseReceived: true,
          },
          get success() {
            lifecycle.push("inspect")
            expect(responseObserved).toBe(true)
            return true
          },
          status: 200,
          data: {
            success: true,
            data: { ok: true },
            message: "ok",
          },
        }
      },
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer: {
            onDispatch: () => lifecycle.push("dispatch"),
            onResponse: () => {
              responseObserved = true
              lifecycle.push("response")
            },
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(lifecycle).toEqual(["content", "dispatch", "response", "inspect"])
  })

  it("keeps only current-tab dispatch evidence when the remote fetch loses the network and direct fallback also fails", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const directNetworkError = new TypeError("direct network down")
    mockSendTabMessageWithRetry.mockImplementationOnce(
      async (_tabId, payload) => {
        emitRuntimeMessage({
          action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
          requestId: payload.requestId,
        })
        return {
          transportLifecycle: {
            upstreamRequestDispatched: true,
            upstreamResponseReceived: false,
          },
          success: false,
          error: "content network down",
        }
      },
    )
    vi.spyOn(globalThis, "fetch").mockRejectedValue(directNetworkError)

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toBe(directNetworkError)

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("does not replay a current-tab mutation after remote dispatch when the message channel closes", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const messageError = new Error("message channel closed")
    mockSendTabMessageWithRetry.mockImplementationOnce(
      async (_tabId, payload) => {
        emitRuntimeMessage({
          action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
          requestId: payload.requestId,
        })
        throw messageError
      },
    )
    const directFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("direct fallback must not run"))

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toBe(messageError)

    expect(directFetch).not.toHaveBeenCalled()
    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("falls back after an affirmative current-tab receiver-unavailable failure", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const receiverUnavailable = new Error(
      "Could not establish connection. Receiving end does not exist.",
    )
    let directRequestCount = 0
    mockSendTabMessageWithRetry.mockRejectedValueOnce(receiverUnavailable)
    server.use(
      http.post(API_URL, () => {
        directRequestCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).resolves.toEqual({ ok: true })

    expect(directRequestCount).toBe(1)
    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).toHaveBeenCalledTimes(1)
  })

  it("does not leave a required current-tab context after a pre-dispatch receiver failure", async () => {
    const receiverUnavailable = new Error(
      "Could not establish connection. Receiving end does not exist.",
    )
    let directRequestCount = 0
    mockSendTabMessageWithRetry.mockRejectedValueOnce(receiverUnavailable)
    server.use(
      http.post(API_URL, () => {
        directRequestCount += 1
        return HttpResponse.json({ success: true, data: { ok: true } })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          currentTabFallback: API_TRANSPORT_CURRENT_TAB_FALLBACK_MODES.Forbid,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toBe(receiverUnavailable)

    expect(directRequestCount).toBe(0)
  })

  it("falls back after structured current-tab pre-dispatch failure evidence", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    let directRequestCount = 0
    let lifecycleReads = 0
    let dispatchReads = 0
    let responseReads = 0
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      get transportLifecycle() {
        lifecycleReads += 1
        return {
          get upstreamRequestDispatched() {
            dispatchReads += 1
            return false
          },
          get upstreamResponseReceived() {
            responseReads += 1
            return false
          },
        }
      },
      success: false,
      error: "Invalid fetch request",
    })
    server.use(
      http.post(API_URL, () => {
        directRequestCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).resolves.toEqual({ ok: true })

    expect(directRequestCount).toBe(1)
    expect(lifecycleReads).toBe(1)
    expect(dispatchReads).toBe(1)
    expect(responseReads).toBe(1)
    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).toHaveBeenCalledTimes(1)
  })

  it.each([
    { label: "null", response: null },
    { label: "primitive", response: "malformed current-tab response" },
  ])(
    "does not replay a current-tab mutation after a $label response",
    async ({ response }) => {
      const observer = {
        onDispatch: vi.fn(),
        onResponse: vi.fn(),
      }
      mockSendTabMessageWithRetry.mockResolvedValueOnce(response)
      const directFetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("direct fallback must not run"))

      await expect(
        fetchApiData<{ ok: boolean }>(
          {
            baseUrl: BASE_URL,
            auth: {
              authType: AuthTypeEnum.AccessToken,
              accessToken: "token",
            },
            fetchContext: {
              kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
              tabId: 456,
              origin: "https://example.com",
            },
            observer,
          },
          { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
        ),
      ).rejects.toBeInstanceOf(ApiError)

      expect(directFetch).not.toHaveBeenCalled()
      expect(observer.onDispatch).toHaveBeenCalledTimes(1)
      expect(observer.onResponse).not.toHaveBeenCalled()
    },
  )

  it("preserves a current-tab lifecycle inspection error without replaying the mutation", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const evidenceError = new Error("current-tab lifecycle getter failed")
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      get transportLifecycle(): never {
        throw evidenceError
      },
      success: false,
    })
    const directFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("direct fallback must not run"))

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toBe(evidenceError)

    expect(directFetch).not.toHaveBeenCalled()
    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("preserves a current-tab parsing error after explicit pre-dispatch evidence", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const parsingError = new Error("current-tab status getter failed")
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      transportLifecycle: {
        upstreamRequestDispatched: false,
        upstreamResponseReceived: false,
      },
      success: false,
      get status(): never {
        throw parsingError
      },
      error: "pre-dispatch rejection",
    })
    const directFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("direct fallback must not run"))

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toBe(parsingError)

    expect(directFetch).not.toHaveBeenCalled()
    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("keeps current-tab pre-dispatch truth when response inspection aborts", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const abortController = new AbortController()
    const abortReason = new Error("current-tab caller abort")
    const parsingError = new Error("current-tab status getter aborted")
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      transportLifecycle: {
        upstreamRequestDispatched: false,
        upstreamResponseReceived: false,
      },
      success: false,
      get status(): never {
        abortController.abort(abortReason)
        throw parsingError
      },
      error: "pre-dispatch rejection",
    })
    const directFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("direct fallback must not run"))

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "POST",
            body: "{}",
            signal: abortController.signal,
          },
        },
      ),
    ).rejects.toBe(parsingError)

    expect(directFetch).not.toHaveBeenCalled()
    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()

    const requestId =
      mockSendTabMessageWithRetry.mock.calls.at(-1)?.[1].requestId
    emitRuntimeMessage({
      action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
      requestId,
    })
    expect(observer.onDispatch).not.toHaveBeenCalled()
  })

  it("does not replay a current-tab mutation after ambiguous channel loss", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    const channelError = new Error(
      "The message port closed before a response was received",
    )
    mockSendTabMessageWithRetry.mockRejectedValueOnce(channelError)
    const directFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("direct fallback must not run"))

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "PATCH", body: "{}" } },
      ),
    ).rejects.toBe(channelError)

    expect(directFetch).not.toHaveBeenCalled()
    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("preserves remote dispatch evidence when a current-tab request times out", async () => {
    vi.useFakeTimers()
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    let resolveLateContentInspection!: () => void
    const lateContentInspected = new Promise<void>((resolve) => {
      resolveLateContentInspection = resolve
    })
    let resolveContentFetch:
      | ((value: {
          transportLifecycle: {
            upstreamRequestDispatched: boolean
            upstreamResponseReceived: boolean
          }
          readonly success: boolean
          data: { success: boolean; data: { ok: boolean } }
        }) => void)
      | undefined
    mockSendTabMessageWithRetry.mockImplementationOnce(
      async (_tabId, payload) => {
        emitRuntimeMessage({
          action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
          requestId: payload.requestId,
        })
        return await new Promise((resolve) => {
          resolveContentFetch = resolve
        })
      },
    )

    try {
      const request = fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          requestTimeoutMs: 100,
          observer,
        },
        { endpoint: ENDPOINT },
      )
      void request.catch(() => undefined)

      await vi.advanceTimersByTimeAsync(100)
      await expect(request).rejects.toMatchObject({ name: "TimeoutError" })
      expect(observer.onDispatch).toHaveBeenCalledTimes(1)
      expect(observer.onResponse).not.toHaveBeenCalled()
      expect(runtimeMessageListeners).toHaveProperty("size", 0)

      if (!resolveContentFetch) {
        throw new Error("Current-tab remote fetch did not start")
      }
      resolveContentFetch({
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
        get success() {
          resolveLateContentInspection()
          return true
        },
        data: { success: true, data: { ok: true } },
      })
      await lateContentInspected

      expect(observer.onDispatch).toHaveBeenCalledTimes(1)
      expect(observer.onResponse).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("treats a timed-out current-tab mutation handoff as dispatched and ignores late response evidence", async () => {
    vi.useFakeTimers()
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    let resolveContentFetch:
      | ((value: {
          transportLifecycle: {
            upstreamRequestDispatched: boolean
            upstreamResponseReceived: boolean
          }
          success: boolean
          data: { success: boolean; data: { ok: boolean } }
        }) => void)
      | undefined
    mockSendTabMessageWithRetry.mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          resolveContentFetch = resolve
        }),
    )

    try {
      const request = fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          requestTimeoutMs: 100,
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "DELETE" } },
      )
      void request.catch(() => undefined)

      await vi.advanceTimersByTimeAsync(0)
      expect(observer.onDispatch).not.toHaveBeenCalled()
      expect(observer.onResponse).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(100)
      await expect(request).rejects.toMatchObject({ name: "TimeoutError" })
      expect(observer.onDispatch).toHaveBeenCalledTimes(1)

      if (!resolveContentFetch) {
        throw new Error("Current-tab remote fetch did not start")
      }
      resolveContentFetch({
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
        success: true,
        data: { success: true, data: { ok: true } },
      })
      await vi.advanceTimersByTimeAsync(0)

      expect(observer.onDispatch).toHaveBeenCalledTimes(1)
      expect(observer.onResponse).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("counts a current-tab HTTP error response once without replaying it", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    mockSendTabMessageWithRetry.mockImplementationOnce(
      async (_tabId, payload) => {
        emitRuntimeMessage({
          action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
          requestId: payload.requestId,
        })
        return {
          transportLifecycle: {
            upstreamRequestDispatched: true,
            upstreamResponseReceived: true,
          },
          success: false,
          status: 503,
          error: "content fetch failed",
        }
      },
    )
    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          observer,
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({ statusCode: 503 })

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).toHaveBeenCalledTimes(1)
  })

  it("omits abort signals from current-tab content fetch messages", async () => {
    const abortController = new AbortController()
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "ok",
      },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          abortSignal: abortController.signal,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.not.objectContaining({
        signal: expect.anything(),
      }),
    )
  })

  it("normalizes Headers objects before sending current-tab content fetch", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: { success: true, data: { ok: true }, message: "content" },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "GET",
            headers: new Headers({
              "X-Header-Object": "yes",
            }),
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "session=abc123",
          "x-header-object": "yes",
        }),
      }),
    )
  })

  it("normalizes header tuple arrays before sending current-tab content fetch", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: { success: true, data: { ok: true }, message: "content" },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "GET",
            headers: [["X-Header-Tuple", "yes"]],
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "session=abc123",
          "X-Header-Tuple": "yes",
        }),
      }),
    )
  })

  it("fetchApiData can use current-tab content fetch for mutating requests", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: { success: true, data: { ok: true }, message: "content" },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "POST",
            body: JSON.stringify({ probe: true }),
          },
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
    expect(mockSendTabMessageWithRetry).toHaveBeenCalledWith(
      456,
      expect.objectContaining({
        action: RuntimeActionIds.ContentPerformTempWindowFetch,
        fetchUrl: API_URL,
        responseType: "json",
      }),
    )
    expect(mockSendTabMessageWithRetry.mock.calls[0][1].fetchOptions).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ probe: true }),
      }),
    )
  })

  it("fetchApiData skips current-tab content fetch when the request URL is not same-origin", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://other.example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("skips current-tab content fetch when the context origin is invalid", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "not a url",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("skips current-tab content fetch when the tab id is invalid", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: "456" as unknown as number,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("does not replay a completed current-tab HTTP response through the fallback transport", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: false,
      status: 503,
      error: "content fetch failed",
    })

    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({ statusCode: 503 })

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
  })

  it("redacts the request access token from current-tab fallback diagnostics", async () => {
    const dashboardBearer = "dashboard-bearer-sensitive-example"
    mockSendTabMessageWithRetry.mockRejectedValueOnce(
      new Error(`safe diagnostic: Authorization: Bearer ${dashboardBearer}`),
    )
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        }),
      ),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: dashboardBearer,
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockLoggerDebug).toHaveBeenCalledWith(
      "Current-tab content fetch failed; falling back",
      expect.objectContaining({
        error: expect.stringContaining("safe diagnostic"),
      }),
    )
    const serializedLoggerArguments = JSON.stringify(mockLoggerDebug.mock.calls)
    expect(serializedLoggerArguments).not.toContain(dashboardBearer)
    expect(serializedLoggerArguments).toContain("Bearer [REDACTED]")
  })

  it("fetchApiData preserves the popup temp window source through fallback context", async () => {
    mockIsProtectionBypassFirefoxEnv.mockReturnValue(false)
    mockGetPreferences.mockResolvedValueOnce({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: {
          ...DEFAULT_AUTOMATIC_FEATURE_BYPASS,
        },
      },
    })
    mockSendTabMessageWithRetry.mockRejectedValueOnce(
      new Error("content fetch failed"),
    )
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "temp",
      },
    })

    let normalFetchCount = 0
    const protectionBypassExecution = {
      version: PROTECTION_BYPASS_EXECUTION_VERSION,
      kind: "automatic",
      feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
      trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
      surface: PROTECTION_BYPASS_SURFACES.Popup,
    } as const
    server.use(
      http.get(API_URL, () => {
        normalFetchCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: false },
          message: "normal",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
          protectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
            incognito: true,
            cookieStoreId: "1-incognito",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(normalFetchCount).toBe(0)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        execution: protectionBypassExecution,
        task: {
          kind: "profile_isolated_fetch",
          params: expect.objectContaining({
            originUrl: BASE_URL,
            fetchUrl: API_URL,
            useIncognito: true,
            cookieStoreId: "1-incognito",
          }),
        },
      }),
    )
    const protectedTask = mockSendRuntimeMessage.mock.calls[0]?.[0]?.task
    expect(mockSendRuntimeMessage.mock.calls[0]?.[0]?.execution).toBe(
      protectionBypassExecution,
    )
    expect(protectedTask?.params).not.toHaveProperty(
      "protectionBypassExecution",
    )
    expect(protectedTask?.params).not.toHaveProperty("tempWindowRequestSource")
  })

  it("rejects forced incognito fallback without execution context", async () => {
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
    }
    mockGetPreferences.mockResolvedValueOnce({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: {
          ...DEFAULT_AUTOMATIC_FEATURE_BYPASS,
        },
      },
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "temp",
      },
    })

    let normalFetchCount = 0
    server.use(
      http.get(API_URL, () => {
        normalFetchCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: false },
          message: "normal",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            incognito: true,
            cookieStoreId: "1-incognito",
          },
          observer,
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      code: ApiErrorCodes.TEMP_WINDOW_POLICY_CONTEXT_INVALID,
    })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
    expect(normalFetchCount).toBe(0)
    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("fetchApiData skips normal fetch when a browser-context cookie store is present", async () => {
    mockGetPreferences.mockResolvedValueOnce({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: {
          ...DEFAULT_AUTOMATIC_FEATURE_BYPASS,
        },
      },
    })
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "temp",
      },
    })

    let normalFetchCount = 0
    server.use(
      http.get(API_URL, () => {
        normalFetchCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: false },
          message: "normal",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "firefox-container-2",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
    expect(normalFetchCount).toBe(0)
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "profile_isolated_fetch",
          params: expect.objectContaining({
            originUrl: BASE_URL,
            fetchUrl: API_URL,
            cookieStoreId: "firefox-container-2",
          }),
        },
      }),
    )
  })

  const forceTempWindowRoute = () => {
    mockGetPreferences.mockResolvedValueOnce({
      tempWindowFallback: {
        enabled: true,
        automaticFeatureBypass: {
          ...DEFAULT_AUTOMATIC_FEATURE_BYPASS,
        },
      },
    })
  }

  const createLifecycleObserver = () => ({
    onDispatch: vi.fn(),
    onResponse: vi.fn(),
  })

  it("uses the temp-window route for an explicitly forced request", async () => {
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: {
        success: true,
        data: { ok: true },
        message: "temp",
      },
    })

    let normalFetchCount = 0
    server.use(
      http.post(API_URL, () => {
        normalFetchCount += 1
        return HttpResponse.json({
          success: true,
          data: { ok: false },
          message: "normal",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
          forceTempWindow: true,
          protectionBypassExecution: backgroundProtectionBypassExecution,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).resolves.toEqual({ ok: true })

    expect(normalFetchCount).toBe(0)
    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: RuntimeActionIds.ProtectionBypassExecuteTask,
        task: {
          kind: "profile_isolated_fetch",
          params: expect.objectContaining({
            originUrl: BASE_URL,
            fetchUrl: API_URL,
          }),
        },
      }),
    )
  })

  it("applies the provider decoder to a forced temp-window error response", async () => {
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      status: 403,
      data: {
        error: {
          code: "group_forbidden",
          message: "Access denied for test group",
          type: "new_api_error",
        },
      },
    })

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie },
          forceTempWindow: true,
          protectionBypassExecution: backgroundProtectionBypassExecution,
        },
        {
          endpoint: ENDPOINT,
          errorResponseDecoder: decodeNewApiResponseError,
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ApiErrorCodes.BUSINESS_ERROR,
      upstreamCode: "group_forbidden",
      message: "Access denied for test group",
    })
  })

  it("keeps the observer local when a forced temp-window route is selected", async () => {
    const lifecycle: string[] = []
    let responseObserved = false
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockImplementationOnce(async (message) => {
      lifecycle.push("temp-window")
      expect(message).not.toHaveProperty("observer")
      expect(message.task?.params).not.toHaveProperty("observer")
      return {
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
        get success() {
          lifecycle.push("inspect")
          expect(responseObserved).toBe(true)
          return true
        },
        status: 200,
        data: {
          success: true,
          data: { ok: true },
          message: "temp",
        },
      }
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer: {
            onDispatch: () => lifecycle.push("dispatch"),
            onResponse: () => {
              responseObserved = true
              lifecycle.push("response")
            },
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(lifecycle.slice(0, 4)).toEqual([
      "temp-window",
      "dispatch",
      "response",
      "inspect",
    ])
    expect(lifecycle.filter((event) => event === "response")).toHaveLength(1)
  })

  it("treats a timed-out temp-window mutation handoff as dispatched and ignores late response evidence", async () => {
    vi.useFakeTimers()
    const observer = createLifecycleObserver()
    let resolveLateTempWindowInspection!: () => void
    const lateTempWindowInspected = new Promise<void>((resolve) => {
      resolveLateTempWindowInspection = resolve
    })
    let resolveTempWindowFetch:
      | ((value: {
          transportLifecycle: {
            upstreamRequestDispatched: boolean
            upstreamResponseReceived: boolean
          }
          readonly success: boolean
          data: { success: boolean; data: { ok: boolean } }
        }) => void)
      | undefined
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTempWindowFetch = resolve
        }),
    )

    try {
      const request = fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          requestTimeoutMs: 100,
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      )
      void request.catch(() => undefined)

      await vi.advanceTimersByTimeAsync(0)
      expect(observer.onDispatch).not.toHaveBeenCalled()
      expect(observer.onResponse).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(100)
      await expect(request).rejects.toMatchObject({ name: "TimeoutError" })
      expect(observer.onDispatch).toHaveBeenCalledTimes(1)
      expect(observer.onResponse).not.toHaveBeenCalled()

      if (!resolveTempWindowFetch) {
        throw new Error("Forced temp-window fetch did not start")
      }
      resolveTempWindowFetch({
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: true,
        },
        get success() {
          resolveLateTempWindowInspection()
          return true
        },
        data: { success: true, data: { ok: true } },
      })
      await lateTempWindowInspected

      expect(observer.onDispatch).toHaveBeenCalledTimes(1)
      expect(observer.onResponse).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps a forced temp-window mutation pre-dispatch policy denial undispatched", async () => {
    const observer = createLifecycleObserver()
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      error: "temporary context policy denied",
      code: ApiErrorCodes.TEMP_WINDOW_DISABLED,
    })

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toMatchObject({
      message: "temporary context policy denied",
      code: ApiErrorCodes.TEMP_WINDOW_DISABLED,
    })

    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("keeps a forced temp-window mutation receiver-unavailable failure undispatched", async () => {
    const observer = createLifecycleObserver()
    const receiverUnavailable = new Error(
      "Could not establish connection. Receiving end does not exist.",
    )
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockRejectedValueOnce(receiverUnavailable)

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toBe(receiverUnavailable)

    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it.each([
    { label: "null", response: null },
    { label: "primitive", response: "malformed temp-window response" },
  ])(
    "treats a forced temp-window mutation $label response as possibly dispatched",
    async ({ response }) => {
      const observer = createLifecycleObserver()
      forceTempWindowRoute()
      mockSendRuntimeMessage.mockResolvedValueOnce(response)

      await expect(
        fetchApiData(
          {
            baseUrl: BASE_URL,
            auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
            protectionBypassExecution: backgroundProtectionBypassExecution,
            fetchContext: {
              kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
              cookieStoreId: "example-container",
            },
            observer,
          },
          { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
        ),
      ).rejects.toBeInstanceOf(Error)

      expect(observer.onDispatch).toHaveBeenCalledTimes(1)
      expect(observer.onResponse).not.toHaveBeenCalled()
    },
  )

  it("preserves a forced temp-window lifecycle inspection error", async () => {
    const observer = createLifecycleObserver()
    const evidenceError = new Error("temp-window lifecycle getter failed")
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockResolvedValueOnce({
      get transportLifecycle(): never {
        throw evidenceError
      },
      success: false,
    })

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toBe(evidenceError)

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("preserves a forced temp-window parsing error after explicit pre-dispatch evidence", async () => {
    const observer = createLifecycleObserver()
    const parsingError = new Error("temp-window status getter failed")
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockResolvedValueOnce({
      transportLifecycle: {
        upstreamRequestDispatched: false,
        upstreamResponseReceived: false,
      },
      success: false,
      get status(): never {
        throw parsingError
      },
      error: "pre-dispatch rejection",
    })

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toBe(parsingError)

    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("keeps forced temp-window pre-dispatch truth when response inspection aborts", async () => {
    const observer = createLifecycleObserver()
    const abortController = new AbortController()
    const abortReason = new Error("temp-window caller abort")
    const parsingError = new Error("temp-window status getter aborted")
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockResolvedValueOnce({
      transportLifecycle: {
        upstreamRequestDispatched: false,
        upstreamResponseReceived: false,
      },
      success: false,
      get status(): never {
        abortController.abort(abortReason)
        throw parsingError
      },
      error: "pre-dispatch rejection",
    })

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        {
          endpoint: ENDPOINT,
          options: {
            method: "POST",
            body: "{}",
            signal: abortController.signal,
          },
        },
      ),
    ).rejects.toBe(parsingError)

    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("treats ambiguous forced temp-window mutation channel loss as dispatched", async () => {
    const observer = createLifecycleObserver()
    const channelError = new Error(
      "The message port closed before a response was received",
    )
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockRejectedValueOnce(channelError)

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        { endpoint: ENDPOINT, options: { method: "POST", body: "{}" } },
      ),
    ).rejects.toBe(channelError)

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("observes a structured temp-window failure response", async () => {
    let responseObserved = false
    let lifecycleReads = 0
    let dispatchReads = 0
    let responseReads = 0
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(() => {
        responseObserved = true
      }),
    }
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockImplementationOnce(async () => ({
      get transportLifecycle() {
        lifecycleReads += 1
        return {
          get upstreamRequestDispatched() {
            dispatchReads += 1
            return true
          },
          get upstreamResponseReceived() {
            responseReads += 1
            return true
          },
        }
      },
      get success() {
        expect(responseObserved).toBe(true)
        return false
      },
      status: 503,
      error: "upstream unavailable",
      code: ApiErrorCodes.HTTP_OTHER,
    }))

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.Cookie,
            cookie: "session=abc123",
            userId: "123",
          },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: ApiErrorCodes.HTTP_OTHER,
    })

    expect(lifecycleReads).toBe(1)
    expect(dispatchReads).toBe(1)
    expect(responseReads).toBe(1)
    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      label: "window setup failure",
      response: {
        success: false,
        error: "temporary context could not be opened",
      },
    },
    {
      label: "acquire-time policy denial",
      response: {
        success: false,
        error: "temporary context policy denied",
        code: ApiErrorCodes.TEMP_WINDOW_DISABLED,
      },
    },
  ])("does not infer forced lifecycle from $label", async ({ response }) => {
    const observer = createLifecycleObserver()
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockResolvedValueOnce(response)

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({ message: response.error })

    expect(observer.onDispatch).not.toHaveBeenCalled()
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("keeps forced temp-window dispatch evidence after a statusless network failure", async () => {
    const observer = createLifecycleObserver()
    forceTempWindowRoute()
    mockSendRuntimeMessage.mockImplementationOnce(async (message) => {
      emitRuntimeMessage({
        action: RuntimeActionIds.ApiTransportRemoteFetchDispatched,
        requestId: message.task.params.requestId,
      })
      return {
        transportLifecycle: {
          upstreamRequestDispatched: true,
          upstreamResponseReceived: false,
        },
        success: false,
        error: "network down",
      }
    })

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            cookieStoreId: "example-container",
          },
          observer,
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({ message: "network down" })

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
  })

  it("counts a direct allowlisted response and its temp-window fallback only once", async () => {
    const observer = createLifecycleObserver()
    forceTempWindowRoute()
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json({ message: "blocked" }, { status: 403 }),
      ),
    )
    mockSendRuntimeMessage.mockResolvedValueOnce({
      transportLifecycle: {
        upstreamRequestDispatched: true,
        upstreamResponseReceived: true,
      },
      success: true,
      status: 200,
      data: { success: true, data: { ok: true }, message: "ok" },
    })

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          observer,
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({ ok: true })

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).toHaveBeenCalledTimes(1)
  })

  it("fetchApiData honors current-tab transport opt-out", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "direct",
        })
      }),
    )

    await expect(
      fetchApiData<{ ok: boolean }>(
        {
          baseUrl: BASE_URL,
          auth: {
            authType: AuthTypeEnum.AccessToken,
            accessToken: "token",
          },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        {
          endpoint: ENDPOINT,
          currentTabTransport: "disabled",
        },
      ),
    ).resolves.toEqual({ ok: true })

    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("fetchApi skips current-tab content fetch for binary response types", async () => {
    server.use(
      http.get("https://example.com/base/api/buffer", () => {
        return new HttpResponse(Uint8Array.from([9, 8, 7]), {
          headers: { "Content-Type": "application/octet-stream" },
        })
      }),
    )

    const result = await fetchApi<ArrayBuffer>(
      {
        baseUrl: BASE_URL,
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
        },
        fetchContext: {
          kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 456,
          origin: "https://example.com",
        },
      },
      { endpoint: "/api/buffer", responseType: "arrayBuffer" },
      true,
    )

    expect(Array.from(new Uint8Array(result))).toEqual([9, 8, 7])
    expect(mockSendTabMessageWithRetry).not.toHaveBeenCalled()
  })

  it("fetchApi returns full JSON envelopes from current-tab content fetch when unwrapping is disabled", async () => {
    const apiEnvelope = {
      success: true,
      data: { nested: "value" },
      message: "content-envelope",
    }
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: apiEnvelope,
    })

    const result = await fetchApi<{ nested: string }>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
        fetchContext: {
          kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
          tabId: 456,
          origin: "https://example.com",
        },
      },
      { endpoint: ENDPOINT },
    )

    expect(result).toEqual(apiEnvelope)
    expect(mockSendTabMessageWithRetry).toHaveBeenCalledTimes(1)
  })

  it("fetchApi returns text responses from current-tab content fetch", async () => {
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: true,
      data: "content text",
    })

    await expect(
      fetchApi<string>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie, cookie: "session=abc123" },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT, responseType: "text" },
        true,
      ),
    ).resolves.toBe("content text")

    expect(mockSendTabMessageWithRetry).toHaveBeenCalledWith(
      456,
      expect.objectContaining({
        responseType: "text",
      }),
    )
  })

  it("fetchApi should unwrap ApiResponse when _normalResponseType is true", async () => {
    const payload = { models: [{ name: "models/gemini-1.5-pro" }] }
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          data: payload,
          message: "ok",
        })
      }),
    )

    const result = await fetchApi<{ models: Array<{ name: string }> }>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: ENDPOINT },
      true,
    )

    expect(result).toEqual(payload)
  })

  it("fetchApi should not unwrap non-ApiResponse JSON payloads that include success/data fields", async () => {
    const pricingLikeResponse = {
      data: [{ model_name: "gpt-4.1", model_ratio: 1 }],
      group_ratio: { default: 1 },
      success: true,
      usable_group: { default: "Default" },
    }
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(pricingLikeResponse)
      }),
    )

    const result = await fetchApi<typeof pricingLikeResponse>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: ENDPOINT },
      true,
    )

    expect(result).toEqual(pricingLikeResponse)
  })

  it("fetchApi returns the full response envelope when unwrapping is disabled", async () => {
    const apiEnvelope = {
      success: true,
      data: { nested: "value" },
      message: "ok",
    }
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(apiEnvelope)
      }),
    )

    const result = await fetchApi<{ nested: string }>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: ENDPOINT },
    )

    expect(result).toEqual(apiEnvelope)
  })

  it("fetchApi returns raw non-JSON responses when unwrapping is disabled", async () => {
    server.use(
      http.get("https://example.com/base/api/text", () => {
        return HttpResponse.text("hello world")
      }),
    )

    await expect(
      fetchApi<string>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: "/api/text", responseType: "text" },
      ),
    ).resolves.toBe("hello world")
  })

  it("fetchApiData rejects non-JSON response types before issuing the request", async () => {
    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT, responseType: "text" },
      ),
    ).rejects.toMatchObject({
      endpoint: ENDPOINT,
      message: "messages:errors.api.onlyJsonSupported",
    })
  })

  it("fetchApiData should throw ApiError when HTTP response is not ok", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({}, { status: 500 })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it("keeps legacy HTTP error classification when an unsuccessful JSON body is malformed", async () => {
    server.use(
      http.get(
        API_URL,
        () =>
          new HttpResponse("{malformed", {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: ApiErrorCodes.HTTP_OTHER,
      message: "请求失败: 502",
    })
  })

  it("fetchApiResponse reports malformed unsuccessful JSON as a decode failure", async () => {
    server.use(
      http.get(
        API_URL,
        () =>
          new HttpResponse("{malformed", {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    )

    await expect(
      fetchApiResponse(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      statusCode: 502,
      code: ApiErrorCodes.JSON_PARSE_ERROR,
    })
  })

  it("fetchApiResponse returns an unsuccessful JSON response without interpreting its body", async () => {
    const body = {
      error: {
        code: "provider_specific",
        message: "Provider-specific detail",
      },
    }
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json(body, {
          status: 400,
          headers: { "X-Request-Id": "request-example" },
        }),
      ),
    )

    await expect(
      fetchApiResponse<typeof body>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      headers: expect.objectContaining({
        "x-request-id": "request-example",
      }),
      body,
    })
  })

  it("fetchApiResponse retains failed current-tab response bodies", async () => {
    const body = { error: { code: "tab_failure", message: "Tab detail" } }
    mockSendTabMessageWithRetry.mockResolvedValueOnce({
      success: false,
      status: 409,
      headers: { "x-request-id": "tab-request-example" },
      data: body,
      error: "derived message must not replace the body",
    })

    await expect(
      fetchApiResponse<typeof body>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie },
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
            tabId: 456,
            origin: "https://example.com",
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({
      ok: false,
      status: 409,
      headers: { "x-request-id": "tab-request-example" },
      body,
    })
  })

  it("fetchApiResponse retains failed forced temp-window response bodies", async () => {
    const body = {
      error: { code: "isolated_failure", message: "Isolated detail" },
    }
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      status: 422,
      headers: { "x-request-id": "temp-request-example" },
      data: body,
      error: "derived message must not replace the body",
    })

    await expect(
      fetchApiResponse<typeof body>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie },
          protectionBypassExecution: backgroundProtectionBypassExecution,
          fetchContext: {
            kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT,
            incognito: true,
          },
        },
        { endpoint: ENDPOINT },
      ),
    ).resolves.toEqual({
      ok: false,
      status: 422,
      headers: { "x-request-id": "temp-request-example" },
      body,
    })
  })

  it("preserves backend JSON error messages for non-2xx responses", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(
          {
            success: false,
            message: "error: invalid user new-api",
          },
          { status: 400 },
        )
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "error: invalid user new-api",
      code: ApiErrorCodes.HTTP_OTHER,
    })
  })

  it("prefers a provider decoder message over the compatibility fallback", async () => {
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json(
          { success: false, message: "Compatibility message" },
          { status: 400 },
        ),
      ),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie },
        },
        {
          endpoint: ENDPOINT,
          errorResponseDecoder: () => ({
            kind: "business",
            message: "Provider message",
          }),
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Provider message",
    })
  })

  it("falls back when the provider decoder has no usable message", async () => {
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json(
          { success: false, message: "Compatibility message" },
          { status: 400 },
        ),
      ),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie },
        },
        {
          endpoint: ENDPOINT,
          errorResponseDecoder: () => ({
            kind: "business",
            message: "   ",
          }),
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: ApiErrorCodes.HTTP_OTHER,
      message: "Compatibility message",
    })
  })

  it("preserves a safe top-level backend code for provider recovery logic", async () => {
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json(
          {
            success: false,
            code: "AUTH_SESSION_LIMIT",
            message: "Active session limit reached",
          },
          { status: 409 },
        ),
      ),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.Cookie },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ApiErrorCodes.HTTP_OTHER,
      upstreamCode: "AUTH_SESSION_LIMIT",
      message: "Active session limit reached",
    })
  })

  it("preserves a generic nested provider message and safe code", async () => {
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json(
          {
            error: {
              code: "invalid_limit",
              message: "Limit must be non-negative",
              metadata: { secret: "must-not-be-exposed" },
            },
          },
          { status: 400 },
        ),
      ),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: ApiErrorCodes.HTTP_OTHER,
      upstreamCode: "invalid_limit",
      message: "Limit must be non-negative",
    })
  })

  it.each([undefined, null, {}, [], "bad code!", "x".repeat(65)])(
    "preserves nested messages without exposing unsafe code %j",
    async (code) => {
      server.use(
        http.get(API_URL, () =>
          HttpResponse.json(
            {
              error: {
                code,
                message: "Private malformed code message",
              },
            },
            { status: 400 },
          ),
        ),
      )

      await expect(
        fetchApiData(
          {
            baseUrl: BASE_URL,
            auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          },
          { endpoint: ENDPOINT },
        ),
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Private malformed code message",
        upstreamCode: undefined,
      })
    },
  )

  it("does not special-case nested OpenRouter errors in shared compatibility APIs", async () => {
    const openRouterApiUrl = "https://openrouter.ai/api/v1/keys"
    server.use(
      http.get(openRouterApiUrl, () =>
        HttpResponse.json(
          {
            error: {
              code: "key_forbidden",
              message: "Private management-key detail",
              metadata: { sensitive: "not-retained" },
            },
          },
          { status: 403 },
        ),
      ),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: "https://openrouter.ai/api/v1",
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: "/keys",
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: ApiErrorCodes.HTTP_403,
      upstreamCode: "key_forbidden",
      message: "请求失败: 403",
    })
  })

  it("classifies 401 HTML responses as CONTENT_TYPE_MISMATCH for JSON requests", async () => {
    server.use(
      http.get(API_URL, () => {
        return new HttpResponse("<html></html>", {
          status: 401,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
    })
  })

  it.each(["application/xhtml+xml", "application/xhtml+xml; charset=utf-8"])(
    "classifies 401 XHTML responses (%s) as CONTENT_TYPE_MISMATCH for JSON requests",
    async (contentType) => {
      server.use(
        http.get(API_URL, () => {
          return new HttpResponse("<html></html>", {
            status: 401,
            headers: { "Content-Type": contentType },
          })
        }),
      )

      await expect(
        fetchApiData(
          {
            baseUrl: BASE_URL,
            auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          },
          {
            endpoint: ENDPOINT,
            tempWindowFallback: { statusCodes: [], codes: [] },
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 401,
        code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
      })
    },
  )

  it("classifies 401 JSON responses as HTTP_401 for JSON requests", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({}, { status: 401 })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 401,
      code: ApiErrorCodes.HTTP_401,
    })
  })

  it("classifies 429 HTML responses without Retry-After as CONTENT_TYPE_MISMATCH for JSON requests", async () => {
    server.use(
      http.get(API_URL, () => {
        return new HttpResponse("<html></html>", {
          status: 429,
          headers: { "Content-Type": "text/html" },
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
    })
  })

  it.each(["application/xhtml+xml", "application/xhtml+xml; charset=utf-8"])(
    "classifies 429 XHTML responses without Retry-After (%s) as CONTENT_TYPE_MISMATCH for JSON requests",
    async (contentType) => {
      server.use(
        http.get(API_URL, () => {
          return new HttpResponse("<html></html>", {
            status: 429,
            headers: { "Content-Type": contentType },
          })
        }),
      )

      await expect(
        fetchApiData(
          {
            baseUrl: BASE_URL,
            auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          },
          {
            endpoint: ENDPOINT,
            tempWindowFallback: { statusCodes: [], codes: [] },
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
      })
    },
  )

  it("classifies 429 responses with Retry-After as HTTP_429 for JSON requests", async () => {
    server.use(
      http.get(API_URL, () => {
        return new HttpResponse("<html></html>", {
          status: 429,
          headers: { "Content-Type": "text/html", "Retry-After": "60" },
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 429,
      code: ApiErrorCodes.HTTP_429,
    })
  })

  it("rejects 200 responses whose content type is not JSON", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.text("plain text", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 200,
      code: ApiErrorCodes.CONTENT_TYPE_MISMATCH,
    })
  })

  it("wraps successful JSON parse failures in ApiError", async () => {
    server.use(
      http.get(API_URL, () => {
        return new HttpResponse("{", {
          headers: { "Content-Type": "application/json" },
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          tempWindowFallback: { statusCodes: [], codes: [] },
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 200,
      endpoint: ENDPOINT,
      code: ApiErrorCodes.JSON_PARSE_ERROR,
    })
  })

  it.each(["application/xhtml+xml", "application/xhtml+xml; charset=utf-8"])(
    "classifies 429 XHTML responses with Retry-After (%s) as HTTP_429 for JSON requests",
    async (contentType) => {
      server.use(
        http.get(API_URL, () => {
          return new HttpResponse("<html></html>", {
            status: 429,
            headers: { "Content-Type": contentType, "Retry-After": "60" },
          })
        }),
      )

      await expect(
        fetchApiData(
          {
            baseUrl: BASE_URL,
            auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          },
          {
            endpoint: ENDPOINT,
            tempWindowFallback: { statusCodes: [], codes: [] },
          },
        ),
      ).rejects.toMatchObject({
        statusCode: 429,
        code: ApiErrorCodes.HTTP_429,
      })
    },
  )

  it("fetchApiData should throw ApiError when success is false with message", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: false,
          data: null,
          message: "bad request",
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({ message: "bad request" } as any)
  })

  it("lets the provider decoder own HTTP 200 business error messages", async () => {
    server.use(
      http.get(API_URL, () =>
        HttpResponse.json({
          success: false,
          data: null,
          message: "Compatibility message",
        }),
      ),
    )

    const request = {
      baseUrl: BASE_URL,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
    }
    const options = {
      endpoint: ENDPOINT,
      errorResponseDecoder: () => ({
        kind: "business" as const,
        message: "Provider message",
      }),
    }

    await expect(fetchApiData(request, options)).rejects.toMatchObject({
      code: ApiErrorCodes.BUSINESS_ERROR,
      message: "Provider message",
    })
    await expect(fetchApi(request, options, true)).rejects.toMatchObject({
      code: ApiErrorCodes.BUSINESS_ERROR,
      message: "Provider message",
    })
  })

  it("keeps HTTP 200 error envelopes available to explicit response consumers", async () => {
    const body = {
      success: false,
      data: null,
      message: "Provider-owned response",
    }
    server.use(http.get(API_URL, () => HttpResponse.json(body)))

    await expect(
      fetchApi(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: ENDPOINT,
          errorResponseDecoder: decodeNewApiResponseError,
        },
      ),
    ).resolves.toEqual(body)
  })

  it("fetchApiData rejects successful JSON envelopes without data", async () => {
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({
          success: true,
          message: "ok",
        })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      endpoint: ENDPOINT,
      message: "messages:errors.api.invalidResponseFormat",
    })
  })

  it("fetchApiData should not invoke temp-window fallback for known backend API 403 errors", async () => {
    const modelsEndpoint = "/v1/models"
    const modelsUrl = "https://example.com/base/v1/models"

    server.use(
      http.get(modelsUrl, () => {
        return HttpResponse.json(
          {
            error: {
              code: "",
              message: "Access denied for test group",
              type: "new_api_error",
            },
          },
          { status: 403 },
        )
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: modelsEndpoint,
          errorResponseDecoder: decodeNewApiResponseError,
        },
      ),
    ).rejects.toMatchObject({
      endpoint: modelsEndpoint,
      statusCode: 403,
      code: ApiErrorCodes.BUSINESS_ERROR,
      message: "Access denied for test group",
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("keeps provider business classification when its message is blank", async () => {
    const modelsEndpoint = "/v1/models"
    const modelsUrl = "https://example.com/base/v1/models"

    server.use(
      http.get(modelsUrl, () =>
        HttpResponse.json(
          {
            error: {
              code: "group_forbidden",
              message: "   ",
              type: "new_api_error",
            },
          },
          { status: 403 },
        ),
      ),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        {
          endpoint: modelsEndpoint,
          errorResponseDecoder: decodeNewApiResponseError,
        },
      ),
    ).rejects.toMatchObject({
      endpoint: modelsEndpoint,
      statusCode: 403,
      code: ApiErrorCodes.BUSINESS_ERROR,
      message: "请求失败: 403",
      upstreamCode: "group_forbidden",
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("fetchApiData should surface VoAPI v2 403 business error messages", async () => {
    const modelsEndpoint = "/v1/models"
    const modelsUrl = "https://example.com/base/v1/models"

    server.use(
      http.get(modelsUrl, () => {
        return HttpResponse.json(
          {
            code: 2,
            data: null,
            msg: "api key expire",
          },
          { status: 403 },
        )
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: modelsEndpoint },
      ),
    ).rejects.toMatchObject({
      endpoint: modelsEndpoint,
      statusCode: 403,
      code: ApiErrorCodes.BUSINESS_ERROR,
      message: "api key expire",
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("fetchApiData should keep unknown structured 403 errors eligible for temp-window fallback", async () => {
    mockTempWindowFallbackDisabledResponse()
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(
          {
            error: {
              code: "gateway_denied",
              message: "Gateway denied the request",
              type: "gateway_error",
            },
          },
          { status: 403 },
        )
      }),
    )

    await expectTempWindowDisabledFallback()
  })

  it("fetchApiData should keep primitive JSON 403 errors eligible for temp-window fallback", async () => {
    mockTempWindowFallbackDisabledResponse()
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json("gateway denied", { status: 403 })
      }),
    )

    await expectTempWindowDisabledFallback()
  })

  it("fetchApiData should keep structured 403 errors without messages eligible for temp-window fallback", async () => {
    mockTempWindowFallbackDisabledResponse()
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json(
          {
            error: {
              code: "gateway_denied",
              type: "gateway_error",
            },
          },
          { status: 403 },
        )
      }),
    )

    await expectTempWindowDisabledFallback()
  })

  it("fetchApiData should tag eligible errors when temp-window fallback is disabled", async () => {
    mockSendRuntimeMessage.mockResolvedValueOnce({
      success: false,
      error: "messages:background.tempWindowPolicyContextInvalid",
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
    })
    server.use(
      http.get(API_URL, () => {
        return HttpResponse.json({}, { status: 403 })
      }),
    )

    await expect(
      fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
          protectionBypassExecution: backgroundProtectionBypassExecution,
        },
        { endpoint: ENDPOINT },
      ),
    ).rejects.toMatchObject({
      code: TEMP_WINDOW_HEALTH_STATUS_CODES.DISABLED,
      originalCode: "HTTP_403",
    })
  })

  it.each([
    ["/api/log", true],
    ["/api/log/", true],
    ["/api/log/usage", true],
    ["/api/login", false],
    ["/api/logout", false],
    ["/api/logs", false],
    ["https://example.com/api/log", true],
    ["https://example.com/api/log/usage", true],
    ["https://example.com/api/login", false],
  ])(
    "fetchApiData should only rate-limit /api/log endpoints (endpoint=%s)",
    async (endpoint, shouldRateLimit) => {
      mockLogRequestRateLimiter.mockClear()

      server.use(
        http.get(/^https:\/\/example\.com\/base\//, () => {
          return HttpResponse.json({
            success: true,
            data: { ok: true },
            message: "ok",
          })
        }),
      )

      await fetchApiData(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint },
      )

      expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
        "https://example.com",
        expect.any(Function),
        undefined,
      )

      if (shouldRateLimit) {
        expect(mockLogRequestRateLimiter).toHaveBeenCalledTimes(1)
        expect(mockLogRequestRateLimiter).toHaveBeenCalledWith(
          "https://example.com",
        )
      } else {
        expect(mockLogRequestRateLimiter).not.toHaveBeenCalled()
      }
    },
  )

  it("allows callers with their own limiter to bypass the generic site API limiter", async () => {
    server.use(
      http.get("https://example.com/base/api/test", () => {
        return HttpResponse.json({
          success: true,
          data: { ok: true },
          message: "ok",
        })
      }),
    )

    await fetchApiData(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        bypassSiteRequestLimit: true,
      },
      { endpoint: ENDPOINT },
    )

    expect(mockWithSiteApiRequestLimit).not.toHaveBeenCalled()
  })

  it("fetchApi supports text responses", async () => {
    server.use(
      http.get("https://example.com/base/api/text", () => {
        return HttpResponse.text("hello world")
      }),
    )

    await expect(
      fetchApi<string>(
        {
          baseUrl: BASE_URL,
          auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
        },
        { endpoint: "/api/text", responseType: "text" },
        true,
      ),
    ).resolves.toBe("hello world")
  })

  it("fetchApi supports arrayBuffer responses", async () => {
    server.use(
      http.get("https://example.com/base/api/buffer", () => {
        return new HttpResponse(Uint8Array.from([1, 2, 3]), {
          headers: { "Content-Type": "application/octet-stream" },
        })
      }),
    )

    const result = await fetchApi<ArrayBuffer>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: "/api/buffer", responseType: "arrayBuffer" },
      true,
    )

    expect(Array.from(new Uint8Array(result))).toEqual([1, 2, 3])
  })

  it("fetchApi supports blob responses", async () => {
    server.use(
      http.get("https://example.com/base/api/blob", () => {
        return new HttpResponse(Uint8Array.from([4, 5, 6]), {
          headers: { "Content-Type": "application/octet-stream" },
        })
      }),
    )

    const result = await fetchApi<Blob>(
      {
        baseUrl: BASE_URL,
        auth: { authType: AuthTypeEnum.AccessToken, accessToken: "token" },
      },
      { endpoint: "/api/blob", responseType: "blob" },
      true,
    )

    expect(result).toBeInstanceOf(Blob)
    expect(Array.from(new Uint8Array(await result.arrayBuffer()))).toEqual([
      4, 5, 6,
    ])
  })

  it("isHttpUrl and extractDataFromApiResponseBody guard invalid input", () => {
    expect(isHttpUrl("https://example.com")).toBe(true)
    expect(isHttpUrl("http://example.com")).toBe(true)
    expect(isHttpUrl("ftp://example.com")).toBe(false)
    expect(isHttpUrl("not-a-url")).toBe(false)

    expect(() =>
      extractDataFromApiResponseBody(null, "/api/invalid"),
    ).toThrowError(
      expect.objectContaining({ code: ApiErrorCodes.JSON_PARSE_ERROR }),
    )

    let businessError: unknown
    try {
      extractDataFromApiResponseBody(
        { success: false, data: null, message: "" },
        "/api/invalid",
      )
    } catch (error) {
      businessError = error
    }
    expect(businessError).toMatchObject({
      code: ApiErrorCodes.BUSINESS_ERROR,
    })
  })
})
