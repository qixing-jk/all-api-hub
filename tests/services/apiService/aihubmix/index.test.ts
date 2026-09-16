import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchAccountData,
  fetchAccountQuota,
  fetchCheckInStatus,
  fetchSupportCheckIn,
  fetchTodayIncome,
  fetchTodayUsage,
  fetchUserInfo,
  getOrCreateAccessToken,
  refreshAccountData,
  validateAccountConnection,
} from "~/services/apiService/aihubmix"
import { createDeferredAbortDeadline } from "~/services/apiTransport/abortableTask"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { INVITE_LINK_FAILURE_REASONS } from "~/services/inviteLinks/errors"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
  AuthTypeEnum,
} from "~/types"
import { server } from "~~/tests/msw/server"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { runMockSiteRequestTask } from "~~/tests/test-utils/siteRequestLease"

const { mockWithSiteApiRequestLimit } = vi.hoisted(() => ({
  mockWithSiteApiRequestLimit: vi.fn(),
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

const baseRequest = {
  baseUrl: "https://aihubmix.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "7",
    accessToken: "system-access-token",
  },
}

const baseAccountRequest = {
  ...baseRequest,
  checkIn: buildCheckInConfig(),
}

describe("apiService AIHubMix", () => {
  beforeEach(() => {
    server.resetHandlers()
    server.use(
      http.get("https://aihubmix.com/call/mdl_info", () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    )
    mockWithSiteApiRequestLimit.mockClear()
    mockWithSiteApiRequestLimit.mockImplementation(
      async (_key: string, task: () => any, _signal?: AbortSignal) =>
        await runMockSiteRequestTask(task),
    )
  })

  it("returns no built-in daily/check-in metrics", async () => {
    await expect(fetchSupportCheckIn(baseRequest)).resolves.toBe(false)
    await expect(fetchCheckInStatus(baseRequest)).resolves.toBeUndefined()
    await expect(fetchTodayUsage(baseRequest)).resolves.toEqual({
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    })
    await expect(fetchTodayIncome(baseRequest)).resolves.toEqual({
      today_income: 0,
      todayStatsAvailability: {
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
    })
  })

  it("returns independent availability snapshots", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: { username: "example-user", quota: 100 },
        }),
      ),
    )

    const first = await fetchAccountData(baseAccountRequest)
    first.todayStatsAvailability!.consumption.status =
      ACCOUNT_TODAY_METRIC_STATUSES.Complete

    const second = await fetchAccountData(baseAccountRequest)

    expect(second.todayStatsAvailability!.consumption).toEqual({
      status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
      reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
    })
    expect(second.todayStatsAvailability).not.toBe(first.todayStatsAvailability)
    expect(second.todayStatsAvailability!.consumption).not.toBe(
      first.todayStatsAvailability!.consumption,
    )
  })

  it("builds the vendor invite URL from the saved-account user response", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("system-access-token")
        expect(request.headers.get("Cookie")).toBeNull()

        return HttpResponse.json({
          success: true,
          data: {
            username: "invite-user",
            aff_code: "  invite-code  ",
          },
        })
      }),
    )

    const apiService = (await import(
      "~/services/apiService/aihubmix"
    )) as Record<string, unknown>
    const fetchInviteLink = apiService.fetchInviteLink as
      | ((request: typeof baseRequest) => Promise<string>)
      | undefined

    expect(fetchInviteLink).toEqual(expect.any(Function))
    await expect(fetchInviteLink!(baseRequest)).resolves.toBe(
      "https://aihubmix.com/?aff=invite-code",
    )
  })

  it("disables caching when fetching the invite link", async () => {
    let requestCache: RequestCache | undefined
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        requestCache = request.cache

        return HttpResponse.json({
          success: true,
          data: { aff_code: "invite-code" },
        })
      }),
    )

    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await fetchInviteLink(baseRequest)

    expect(requestCache).toBe("no-store")
  })

  it("admits the raw invite-link request through the site limiter once", async () => {
    const abortController = new AbortController()
    const startDeadline = vi.fn()
    const requestScheduling = { priority: "foreground" } as const
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          data: { aff_code: "invite-code" },
        }),
      ),
    )
    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await fetchInviteLink({
      ...baseRequest,
      abortSignal: abortController.signal,
      requestScheduling,
      abortDeadline: {
        signal: abortController.signal,
        start: startDeadline,
        dispose: vi.fn(),
      },
    })

    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledTimes(1)
    expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
      "https://aihubmix.com",
      expect.any(Function),
      abortController.signal,
      requestScheduling,
    )
    expect(startDeadline).toHaveBeenCalledTimes(1)
  })

  it("does not start the native deadline for a pre-aborted dispatch", async () => {
    const abortController = new AbortController()
    const startDeadline = vi.fn()
    abortController.abort(new DOMException("Cancelled", "AbortError"))
    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await expect(
      fetchInviteLink({
        ...baseRequest,
        abortSignal: abortController.signal,
        abortDeadline: {
          signal: abortController.signal,
          start: startDeadline,
          dispose: vi.fn(),
        },
      }),
    ).rejects.toBe(abortController.signal.reason)

    expect(startDeadline).not.toHaveBeenCalled()
  })

  it("aborts the native invite-link request when only its shared deadline expires", async () => {
    vi.useFakeTimers()
    const abortDeadline = createDeferredAbortDeadline(1_000)
    let receivedSignal: AbortSignal | null | undefined
    let settleFetch: (() => void) | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, options) => {
        receivedSignal = options?.signal
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
      const { fetchInviteLink } = await import("~/services/apiService/aihubmix")
      const request = fetchInviteLink({ ...baseRequest, abortDeadline })
      void request.catch(() => undefined)

      await vi.advanceTimersByTimeAsync(0)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(mockWithSiteApiRequestLimit).toHaveBeenCalledWith(
        "https://aihubmix.com",
        expect.any(Function),
        abortDeadline.signal,
        undefined,
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

  it("starts the native invite-link timeout after site-limiter dispatch", async () => {
    vi.useFakeTimers()
    const abortController = new AbortController()
    let dispatchRequest: (() => void) | undefined
    let completeFetch: (() => void) | undefined
    let underlyingCompletion: Promise<unknown> | undefined
    let underlyingCompleted = false
    let receivedSignal: AbortSignal | null | undefined
    let requestError: unknown
    let requestSettled: Promise<void> | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, options) => {
        receivedSignal = options?.signal

        return new Promise<Response>((resolve) => {
          completeFetch = () =>
            resolve(
              new Response(
                JSON.stringify({
                  success: true,
                  data: { aff_code: "late-code" },
                  message: "ok",
                }),
                { headers: { "content-type": "application/json" } },
              ),
            )
        })
      })

    mockWithSiteApiRequestLimit.mockImplementation(
      async (_key: string, task: () => any) =>
        await new Promise<unknown>((resolve, reject) => {
          dispatchRequest = () => {
            dispatchRequest = undefined
            const dispatched = task()
            underlyingCompletion = dispatched?.completion
            void underlyingCompletion?.then(() => {
              underlyingCompleted = true
            })
            void (dispatched?.result ?? dispatched).then(resolve, reject)
          }
        }),
    )

    try {
      const { fetchInviteLink } = await import("~/services/apiService/aihubmix")
      requestSettled = fetchInviteLink({
        ...baseRequest,
        abortSignal: abortController.signal,
        requestTimeoutMs: 1_000,
      }).then(
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
      dispatchRequest?.()
      abortController.abort()
      completeFetch?.()
      await underlyingCompletion
      await requestSettled
      fetchSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("forwards invite-link cancellation to the native request", async () => {
    const abortController = new AbortController()
    let receivedSignal: AbortSignal | null | undefined
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce((_input, options) => {
        receivedSignal = options?.signal

        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          )
        })
      })

    try {
      const apiService = (await import(
        "~/services/apiService/aihubmix"
      )) as Record<string, unknown>
      const fetchInviteLink = apiService.fetchInviteLink as
        | ((
            request: typeof baseRequest & { abortSignal: AbortSignal },
          ) => Promise<string>)
        | undefined
      const inviteLinkPromise = fetchInviteLink!({
        ...baseRequest,
        abortSignal: abortController.signal,
      })

      await vi.waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(1)
      })
      abortController.abort()

      await expect(inviteLinkPromise).rejects.toMatchObject({
        name: "AbortError",
      })
      expect(receivedSignal).toBe(abortController.signal)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it.each([
    {
      caseName: "null data",
      response: { success: true, data: null },
    },
    {
      caseName: "missing data",
      response: { success: true },
    },
    {
      caseName: "array data",
      response: { success: true, data: [] },
    },
    {
      caseName: "non-string code",
      response: { success: true, data: { aff_code: 42 } },
    },
    {
      caseName: "blank code",
      response: { success: true, data: { aff_code: "   " } },
    },
  ])(
    "rejects malformed AIHubMix invitation payloads: $caseName",
    async ({ response }) => {
      server.use(
        http.get("https://aihubmix.com/api/user/self", () =>
          HttpResponse.json(response),
        ),
      )

      const apiService = (await import(
        "~/services/apiService/aihubmix"
      )) as Record<string, unknown>
      const fetchInviteLink = apiService.fetchInviteLink as
        | ((request: typeof baseRequest) => Promise<string>)
        | undefined

      expect(fetchInviteLink).toEqual(expect.any(Function))
      await expect(fetchInviteLink!(baseRequest)).rejects.toMatchObject({
        reason: INVITE_LINK_FAILURE_REASONS.InviteDataMissing,
      })
    },
  )

  it("classifies malformed AIHubMix envelopes as invalid responses", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(null),
      ),
    )

    const { fetchInviteLink } = await import("~/services/apiService/aihubmix")

    await expect(fetchInviteLink(baseRequest)).rejects.toMatchObject({
      code: API_ERROR_CODES.JSON_PARSE_ERROR,
    })
  })

  it("fetches cookie-authenticated user info from /call/usr/self", async () => {
    let capturedCookieAuth = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", ({ request }) => {
        capturedCookieAuth = request.credentials === "include"
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
            quota: 900000,
            used_quota: 12345,
          },
        })
      }),
    )

    const userInfo = await fetchUserInfo({
      baseUrl: "https://aihubmix.com",
      auth: { authType: AuthTypeEnum.Cookie },
    })

    expect(capturedCookieAuth).toBe(true)
    expect(userInfo).toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
  })

  it("uses AIHubMix's documented message for cookie-session failures", async () => {
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "AIHubMix rejected the account session",
            data: null,
          },
          { status: 401 },
        ),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "AIHubMix rejected the account session",
    })
  })

  it("falls back to the shared msg heuristic for an unrecognized AIHubMix error", async () => {
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          { success: false, msg: "legacy guessed message", data: null },
          { status: 400 },
        ),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "legacy guessed message",
    })
  })

  it("uses username as the stable cookie-authenticated account identity when AIHubMix omits id", async () => {
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
          },
        }),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
  })

  it("fetches cookie user info from the main web origin for console.aihubmix.com", async () => {
    let mainOriginUserInfoCalled = false
    let consoleOriginUserInfoCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () => {
        mainOriginUserInfoCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        })
      }),
      http.get("https://console.aihubmix.com/call/usr/self", () => {
        consoleOriginUserInfoCalled = true
        return HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        )
      }),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://console.aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(consoleOriginUserInfoCalled).toBe(false)
  })

  it("fetches access-token user info from /api/user/self with raw Authorization", async () => {
    let capturedAuthorization: string | null = null
    let mainOriginUserInfoCalled = false
    server.use(
      http.get("https://aihubmix.com/api/user/self", ({ request }) => {
        mainOriginUserInfoCalled = true
        capturedAuthorization = request.headers.get("authorization")
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
            quota: 900000,
          },
        })
      }),
      http.get("https://console.aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong auth endpoint",
            data: null,
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      fetchUserInfo({
        baseUrl: "https://console.aihubmix.com",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "system-access-token",
        },
      }),
    ).resolves.toMatchObject({
      id: "aihubmix-user",
      username: "aihubmix-user",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(capturedAuthorization).toBe("system-access-token")
  })

  it("uses existing access_token from /call/usr/self before fetching the console token", async () => {
    let consoleTokenCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "existing-access-token",
          },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/tkn", () => {
        consoleTokenCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: "created-access-token",
        })
      }),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "existing-access-token",
    })
    expect(consoleTokenCalled).toBe(false)
  })

  it("fetches the console access token when /call/usr/self has no usable token", async () => {
    let consoleTokenRequestUrl: string | null = null
    let capturedCookieAuth = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        }),
      ),
      http.get("https://aihubmix.com/call/usr/tkn", ({ request }) => {
        consoleTokenRequestUrl = request.url
        capturedCookieAuth = request.credentials === "include"
        return HttpResponse.json({
          success: true,
          message: "",
          data: "created-access-token",
        })
      }),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "created-access-token",
    })
    expect(capturedCookieAuth).toBe(true)
    expect(consoleTokenRequestUrl).toContain(
      "https://aihubmix.com/call/usr/tkn",
    )
    expect(consoleTokenRequestUrl).toContain("_t=")
  })

  it("fetches the console access token from the main API origin for console.aihubmix.com", async () => {
    let mainOriginUserInfoCalled = false
    let mainOriginTokenCalled = false
    server.use(
      http.get("https://aihubmix.com/call/usr/self", () => {
        mainOriginUserInfoCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            display_name: "aihubmix-user",
            access_token: "",
          },
        })
      }),
      http.get("https://aihubmix.com/call/usr/tkn", () => {
        mainOriginTokenCalled = true
        return HttpResponse.json({
          success: true,
          message: "",
          data: "main-origin-access-token",
        })
      }),
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "api user self requires access token",
            data: null,
          },
          { status: 401 },
        ),
      ),
      http.get("https://console.aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://console.aihubmix.com/call/usr/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: null,
          },
          { status: 500 },
        ),
      ),
      http.get("https://console.aihubmix.com/call/usr/tkn", () =>
        HttpResponse.json(
          {
            success: false,
            message: "wrong origin",
            data: "",
          },
          { status: 500 },
        ),
      ),
    )

    await expect(
      getOrCreateAccessToken({
        baseUrl: "https://console.aihubmix.com",
        auth: { authType: AuthTypeEnum.Cookie },
      }),
    ).resolves.toEqual({
      username: "aihubmix-user",
      access_token: "main-origin-access-token",
    })
    expect(mainOriginUserInfoCalled).toBe(true)
    expect(mainOriginTokenCalled).toBe(true)
  })

  it("keeps cumulative used quota out of today statistics", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: "900000",
            used_quota: "12345",
          },
        }),
      ),
    )

    const accountData = await fetchAccountData({
      ...baseRequest,
      siteType: SITE_TYPES.AIHUBMIX,
      checkIn: baseAccountRequest.checkIn,
    })

    expect(accountData).toMatchObject({
      quota: 900000,
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      today_income: 0,
      todayStatsAvailability: {
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        requests: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
        },
        tokens: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      },
      checkIn: baseAccountRequest.checkIn,
    })
  })

  it("fetches raw account quota and validates connection health", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: "900000",
          },
        }),
      ),
    )

    await expect(fetchAccountQuota(baseRequest)).resolves.toBe(900000)
    await expect(validateAccountConnection(baseRequest)).resolves.toBe(true)
  })

  it("maps refresh and connection failures to shared health/failure shapes", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json(
          {
            success: false,
            message: "bad access token",
            data: null,
          },
          { status: 401 },
        ),
      ),
    )

    await expect(refreshAccountData(baseAccountRequest)).resolves.toMatchObject(
      {
        success: false,
        healthStatus: {
          message: "account:healthStatus.httpError",
        },
      },
    )
    await expect(validateAccountConnection(baseRequest)).resolves.toBe(false)
  })

  it("reports healthy refresh data when the account read succeeds", async () => {
    server.use(
      http.get("https://aihubmix.com/api/user/self", () =>
        HttpResponse.json({
          success: true,
          message: "",
          data: {
            id: 7,
            username: "aihubmix-user",
            quota: 500000,
            used_quota: 1000,
          },
        }),
      ),
    )

    await expect(refreshAccountData(baseAccountRequest)).resolves.toMatchObject(
      {
        success: true,
        data: {
          quota: 500000,
          today_quota_consumption: 0,
        },
        healthStatus: {
          status: "healthy",
          message: "account:healthStatus.normal",
        },
      },
    )
  })
})
