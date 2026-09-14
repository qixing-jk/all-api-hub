import { http, HttpResponse } from "msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  deleteApiToken,
  fetchAccountQuota,
  fetchAccountTokens,
} from "~/services/apiService/aihubmix"
import { createDeferredAbortDeadline } from "~/services/apiTransport/abortableTask"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { createSiteRequestLeaseLimiter } from "~/services/apiTransport/siteRequestLimiter"
import {
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  type ApiTransportRequest,
} from "~/services/apiTransport/type"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_EXECUTION_VERSION,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
} from "~/services/protectionBypass/contracts"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { runMockSiteRequestTask } from "~~/tests/test-utils/siteRequestLease"

const { leaseRequest, currentTabFetch, tempWindowFetch } = vi.hoisted(() => ({
  leaseRequest: vi.fn(),
  currentTabFetch: vi.fn(),
  tempWindowFetch: vi.fn(),
}))

vi.mock(
  "~/services/apiTransport/siteRequestLimiter",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiTransport/siteRequestLimiter")
    >()),
    withSiteApiRequestLease: leaseRequest,
  }),
)

vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  sendTabMessageWithRetry: currentTabFetch,
}))

vi.mock("~/utils/browser/tempWindowFetch", () => ({
  executeWithTempWindowFallback: tempWindowFetch,
}))

const request: ApiTransportRequest = {
  baseUrl: "https://console.aihubmix.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "7",
    accessToken: "  saved-access-token  ",
    cookie: "session=unrelated-browser-session",
  },
  cookieAuthSessionCookie: "session=unrelated-browser-session",
  fetchContext: {
    kind: API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB,
    origin: "https://aihubmix.com",
    tabId: 12,
    incognito: true,
    cookieStoreId: "firefox-container-2",
  },
  forceTempWindow: true,
  protectionBypassExecution: {
    version: PROTECTION_BYPASS_EXECUTION_VERSION,
    kind: "automatic",
    feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
    trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    surface: PROTECTION_BYPASS_SURFACES.Background,
  },
}

/** Uses the real admission/lease implementation without rate-refill delays. */
function useSerialSiteLimiter() {
  leaseRequest.mockImplementation(
    createSiteRequestLeaseLimiter({
      maxConcurrentPerSite: 1,
      requestsPerMinute: 60_000,
      burst: 100,
    }),
  )
}

describe("AIHubMix saved-account transport", () => {
  beforeEach(() => {
    leaseRequest.mockReset()
    leaseRequest.mockImplementation(
      async (
        _key: string,
        task: Parameters<typeof runMockSiteRequestTask>[0],
      ) => await runMockSiteRequestTask(task),
    )
    currentTabFetch.mockReset()
    tempWindowFetch.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it("preserves the canonical origin and exact token headers for reads and writes", async () => {
    const observed: Array<{
      url: string
      method: string
      headers: Record<string, string>
      credentials: RequestCredentials
    }> = []
    server.use(
      http.all("https://aihubmix.com/api/token/*", ({ request: incoming }) => {
        observed.push({
          url: incoming.url,
          method: incoming.method,
          headers: Object.fromEntries(incoming.headers.entries()),
          credentials: incoming.credentials,
        })
        return HttpResponse.json({ success: true, data: [] })
      }),
    )

    await expect(fetchAccountTokens(request)).resolves.toEqual([])
    await deleteApiToken(request, 9)

    expect(observed).toEqual([
      {
        url: "https://aihubmix.com/api/token/",
        method: "GET",
        headers: { authorization: "saved-access-token" },
        credentials: "omit",
      },
      {
        url: "https://aihubmix.com/api/token/9",
        method: "DELETE",
        headers: {
          authorization: "saved-access-token",
          "content-type": "application/json",
        },
        credentials: "omit",
      },
    ])
    expect(currentTabFetch).not.toHaveBeenCalled()
    expect(tempWindowFetch).not.toHaveBeenCalled()
  })

  it.each([
    { name: "bare body", body: { quota: 12 } },
    { name: "data-only envelope", body: { data: { quota: 12 } } },
    {
      name: "message-free envelope",
      body: { success: true, data: { quota: 12 } },
    },
  ])(
    "keeps AIHubMix parsing for a $name regardless of content type",
    async ({ body }) => {
      server.use(
        http.get(
          "https://aihubmix.com/api/user/self",
          () =>
            new HttpResponse(JSON.stringify(body), {
              headers: { "Content-Type": "text/plain" },
            }),
        ),
      )

      await expect(fetchAccountQuota(request)).resolves.toBe(12)
    },
  )

  it.each([
    {
      name: "HTTP error with provider message",
      response: () =>
        Response.json(
          { success: false, message: "Access denied" },
          { status: 403 },
        ),
      expected: { statusCode: 403, code: undefined, message: "Access denied" },
    },
    {
      name: "undecodable HTTP error",
      response: () => new Response("<html>Bad gateway</html>", { status: 502 }),
      expected: {
        statusCode: 502,
        code: undefined,
        message: "messages:errors.api.requestFailed",
      },
    },
    {
      name: "undecodable successful body",
      response: () => new Response("invalid JSON"),
      expected: {
        statusCode: undefined,
        code: API_ERROR_CODES.JSON_PARSE_ERROR,
      },
    },
    {
      name: "business failure",
      response: () =>
        Response.json({ success: false, message: "Token unavailable" }),
      expected: {
        statusCode: undefined,
        code: API_ERROR_CODES.BUSINESS_ERROR,
        message: "Token unavailable",
      },
    },
  ])(
    "preserves $name without browser fallback or replay",
    async ({ response, expected }) => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(response())

      await expect(deleteApiToken(request, 9)).rejects.toMatchObject({
        ...expected,
        endpoint: "/api/token/9",
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(currentTabFetch).not.toHaveBeenCalled()
      expect(tempWindowFetch).not.toHaveBeenCalled()
    },
  )

  it("keeps mutation dispatch evidence on network loss without retrying", async () => {
    const failure = new TypeError("Network unavailable")
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(failure)
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }

    await expect(deleteApiToken({ ...request, observer }, 9)).rejects.toBe(
      failure,
    )

    expect(observer.onDispatch).toHaveBeenCalledTimes(1)
    expect(observer.onResponse).not.toHaveBeenCalled()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(currentTabFetch).not.toHaveBeenCalled()
    expect(tempWindowFetch).not.toHaveBeenCalled()
  })

  it("retains a timed-out read's slot until its response body actually finishes", async () => {
    vi.useFakeTimers()
    useSerialSiteLimiter()
    const body = createDeferred<unknown>()
    const response = new Response()
    vi.spyOn(response, "json").mockReturnValueOnce(body.promise)
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(Response.json({ data: [] }))
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const first = fetchAccountTokens({
      ...request,
      requestTimeoutMs: 1_000,
      observer,
    })
    const firstFailure = first.catch((error: unknown) => error)
    const second = fetchAccountTokens({
      ...request,
      baseUrl: "https://aihubmix.com",
    })

    try {
      await vi.advanceTimersByTimeAsync(0)
      expect(observer.onDispatch).toHaveBeenCalledTimes(1)
      expect(observer.onResponse).toHaveBeenCalledTimes(1)
      expect(response.json).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(5_000)
      expect(await firstFailure).toMatchObject({ name: "TimeoutError" })
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      body.resolve({ data: [] })
      await expect(second).resolves.toEqual([])
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    } finally {
      body.resolve({ data: [] })
      await Promise.allSettled([first, second])
    }
  })

  it("starts a queued account deadline only when its request is dispatched", async () => {
    vi.useFakeTimers()
    useSerialSiteLimiter()
    const firstResponse = createDeferred<Response>()
    const secondResponse = createDeferred<Response>()
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(firstResponse.promise)
      .mockReturnValueOnce(secondResponse.promise)
    const first = fetchAccountTokens(request)
    const abortDeadline = createDeferredAbortDeadline(1_000)
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const second = fetchAccountTokens({ ...request, abortDeadline, observer })
    const secondFailure = second.catch((error: unknown) => error)

    try {
      await vi.advanceTimersByTimeAsync(5_000)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(abortDeadline.signal.aborted).toBe(false)
      expect(observer.onDispatch).not.toHaveBeenCalled()

      firstResponse.resolve(Response.json({ data: [] }))
      await first
      await vi.advanceTimersByTimeAsync(0)
      expect(observer.onDispatch).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(999)
      expect(abortDeadline.signal.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      expect(await secondFailure).toMatchObject({ name: "TimeoutError" })
      expect(fetchSpy.mock.calls[1]?.[1]?.signal?.aborted).toBe(true)
    } finally {
      abortDeadline.dispose()
      firstResponse.resolve(Response.json({ data: [] }))
      secondResponse.resolve(Response.json({ data: [] }))
      await Promise.allSettled([first, second])
    }
  })

  it("removes a cancelled mutation from the queue before any network dispatch", async () => {
    vi.useFakeTimers()
    useSerialSiteLimiter()
    const firstResponse = createDeferred<Response>()
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValueOnce(firstResponse.promise)
    const first = fetchAccountTokens(request)
    const controller = new AbortController()
    const observer = { onDispatch: vi.fn(), onResponse: vi.fn() }
    const queued = deleteApiToken(
      { ...request, abortSignal: controller.signal, observer },
      9,
    )
    const queuedFailure = queued.catch((error: unknown) => error)

    try {
      await vi.advanceTimersByTimeAsync(0)
      controller.abort()
      expect(await queuedFailure).toBe(controller.signal.reason)
      firstResponse.resolve(Response.json({ data: [] }))
      await first
      await vi.advanceTimersByTimeAsync(0)

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(observer.onDispatch).not.toHaveBeenCalled()
      expect(observer.onResponse).not.toHaveBeenCalled()
    } finally {
      firstResponse.resolve(Response.json({ data: [] }))
      controller.abort()
      await Promise.allSettled([first, queued])
    }
  })
})
