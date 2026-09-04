import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import {
  SUB2API_AUTH_PERSISTENCE_STATUSES,
  type Sub2ApiAuthSessionRequest,
} from "~/services/apiService/sub2api/authSession"
import { recoverSub2ApiBrowserAuth as resyncSub2ApiAuthToken } from "~/services/apiService/sub2api/browserAuth"
import {
  DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT,
  DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT,
  DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT,
  fetchDenxioDailyCheckInStatus,
  performDenxioDailyCheckIn,
} from "~/services/apiService/sub2api/denxioCheckIn"
import {
  fetchApiResponse,
  notifyApiTransportObserver,
} from "~/services/apiTransport/request"
import type { ApiTransportResponse } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"

const { getLatestAuth, persistAuthUpdate } = vi.hoisted(() => ({
  getLatestAuth: vi.fn(),
  persistAuthUpdate: vi.fn(),
}))

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
  notifyApiTransportObserver: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api/browserAuth", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/apiService/sub2api/browserAuth")
    >()
  return {
    ...actual,
    recoverSub2ApiBrowserAuth: vi.fn(),
  }
})

const response = (
  status: number,
  body: unknown,
): ApiTransportResponse<unknown> => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { "content-type": "application/json" },
  body,
})

const statusBody = (checkedInToday = false, enabled = true) => ({
  code: 0,
  message: "success",
  data: {
    normal_done: checkedInToday,
    config: { normal_checkin_enabled: enabled },
  },
})

const beginBody = {
  code: 0,
  message: "success",
  data: { token: "one-time-challenge", wait_seconds: 3 },
}

const claimBody = {
  code: 0,
  message: "success",
  data: { record: { amount: 0.5 } },
}

const createRequest = (): Sub2ApiAuthSessionRequest => ({
  baseUrl: "https://checkin.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "42",
    accessToken: "example-access-token",
  },
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  sub2apiAuthSession: { getLatestAuth, persistAuthUpdate },
})

describe("Denxio daily check-in authenticated transport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
    vi.mocked(resyncSub2ApiAuthToken).mockReset()
    getLatestAuth.mockResolvedValue(null)
    persistAuthUpdate.mockResolvedValue({
      status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED,
    })
  })

  it("uses a passive authenticated GET for status detection", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(200, statusBody()))

    await expect(
      fetchDenxioDailyCheckInStatus(createRequest()),
    ).resolves.toEqual({ enabled: true, checkedInToday: false })

    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "example-access-token" }),
      }),
      {
        endpoint: expect.stringMatching(
          new RegExp(`^${DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT}\\?timezone=`),
        ),
        options: { method: "GET", cache: "no-store" },
      },
    )
  })

  it("falls back to UTC when the runtime timezone is unavailable", async () => {
    const dateTimeFormat = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(() => {
        throw new Error("timezone unavailable")
      })
    vi.mocked(fetchApiResponse).mockResolvedValue(response(200, statusBody()))

    try {
      await expect(
        fetchDenxioDailyCheckInStatus(createRequest()),
      ).resolves.toEqual({ enabled: true, checkedInToday: false })
      expect(fetchApiResponse).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          endpoint: `${DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT}?timezone=UTC`,
        }),
      )
    } finally {
      dateTimeFormat.mockRestore()
    }
  })

  it("does not recover a passive status 401 through browser auth", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(401, { code: 401, message: "unauthorized" }),
    )

    await expect(
      fetchDenxioDailyCheckInStatus(createRequest()),
    ).rejects.toMatchObject({ statusCode: 401 })

    expect(fetchApiResponse).toHaveBeenCalledOnce()
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect(persistAuthUpdate).not.toHaveBeenCalled()
  })

  it("runs begin, waits for the challenge, and claims with the same timezone", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(200, beginBody))
      .mockResolvedValueOnce(response(200, claimBody))
    const wait = vi.fn(async () => {})
    const beforeRecoveredMutation = vi.fn(async () => true)
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
      onPreHandlerUnauthorized: vi.fn(),
    }

    await expect(
      performDenxioDailyCheckIn(
        { ...createRequest(), observer },
        {
          wait,
          beforeRecoveredMutation,
        },
      ),
    ).resolves.toEqual({ kind: "applied", rewardAmount: 0.5 })

    expect(wait).toHaveBeenCalledWith(3_000)
    expect(beforeRecoveredMutation).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    const [, beginOptions] = vi.mocked(fetchApiResponse).mock.calls[0]!
    const [, claimOptions] = vi.mocked(fetchApiResponse).mock.calls[1]!
    expect(beginOptions.endpoint).toMatch(
      new RegExp(`^${DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT}\\?timezone=`),
    )
    expect(beginOptions.options).toMatchObject({ method: "POST" })
    expect(claimOptions.endpoint).toBe(DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT)
    expect(claimOptions.options).toMatchObject({ method: "POST" })

    const beginPayload = JSON.parse(String(beginOptions.options?.body))
    const claimPayload = JSON.parse(String(claimOptions.options?.body))
    expect(beginPayload.timezone).toBeTypeOf("string")
    expect(claimPayload).toEqual({
      token: "one-time-challenge",
      timezone: beginPayload.timezone,
    })
    expect(notifyApiTransportObserver).toHaveBeenCalledOnce()
    expect(notifyApiTransportObserver).toHaveBeenCalledWith(
      observer,
      "onPreHandlerUnauthorized",
    )
  })

  it("uses the default short challenge delay when no wait override is supplied", async () => {
    vi.useFakeTimers()
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(200, beginBody))
      .mockResolvedValueOnce(response(200, claimBody))

    try {
      const result = performDenxioDailyCheckIn(createRequest())
      await vi.advanceTimersByTimeAsync(3_000)
      await expect(result).resolves.toEqual({
        kind: "applied",
        rewardAmount: 0.5,
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("persists recovered auth before status recheck and one recovered begin", async () => {
    const order: string[] = []
    vi.mocked(resyncSub2ApiAuthToken).mockImplementation(async () => {
      order.push("resync")
      return {
        accessToken: "recovered-access-token",
        userId: "42",
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      }
    })
    persistAuthUpdate.mockImplementation(async () => {
      order.push("persist")
      return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED }
    })
    vi.mocked(fetchApiResponse).mockImplementation(async (request, options) => {
      const method = options.options?.method ?? "GET"
      const token = request.auth.accessToken
      const endpoint = options.endpoint.split("?")[0]
      order.push(`${method}:${endpoint}:${token}`)
      if (
        endpoint === DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT &&
        token === "example-access-token"
      ) {
        return response(401, { code: 401, message: "unauthorized" })
      }
      if (endpoint === DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT) {
        return response(200, statusBody())
      }
      if (endpoint === DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT) {
        return response(200, beginBody)
      }
      return response(200, claimBody)
    })

    await expect(
      performDenxioDailyCheckIn(createRequest(), { wait: async () => {} }),
    ).resolves.toEqual({ kind: "applied", rewardAmount: 0.5 })

    expect(order).toEqual([
      `POST:${DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT}:example-access-token`,
      "resync",
      "persist",
      `GET:${DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT}:recovered-access-token`,
      `POST:${DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT}:recovered-access-token`,
      `POST:${DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT}:recovered-access-token`,
    ])
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://checkin.example.invalid",
        expectedUserId: "42",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      }),
    )
  })

  it("rechecks status and retries only claim after claim-stage auth recovery", async () => {
    const order: string[] = []
    vi.mocked(resyncSub2ApiAuthToken).mockImplementation(async () => {
      order.push("resync")
      return {
        accessToken: "recovered-access-token",
        userId: "42",
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      }
    })
    persistAuthUpdate.mockImplementation(async () => {
      order.push("persist")
      return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED }
    })
    vi.mocked(fetchApiResponse).mockImplementation(async (request, options) => {
      const method = options.options?.method ?? "GET"
      const token = request.auth.accessToken
      const endpoint = options.endpoint.split("?")[0]
      order.push(`${method}:${endpoint}:${token}`)
      if (
        endpoint === DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT &&
        token === "example-access-token"
      ) {
        return response(401, { code: 401, message: "unauthorized" })
      }
      if (endpoint === DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT) {
        return response(200, statusBody())
      }
      if (endpoint === DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT) {
        return response(200, beginBody)
      }
      return response(200, claimBody)
    })

    await expect(
      performDenxioDailyCheckIn(createRequest(), { wait: async () => {} }),
    ).resolves.toEqual({ kind: "applied", rewardAmount: 0.5 })

    expect(order).toEqual([
      `POST:${DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT}:example-access-token`,
      `POST:${DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT}:example-access-token`,
      "resync",
      "persist",
      `GET:${DENXIO_DAILY_CHECK_IN_STATUS_ENDPOINT}:recovered-access-token`,
      `POST:${DENXIO_DAILY_CHECK_IN_CLAIM_ENDPOINT}:recovered-access-token`,
    ])
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.filter(([, options]) =>
          options.endpoint.startsWith(DENXIO_DAILY_CHECK_IN_BEGIN_ENDPOINT),
        ),
    ).toHaveLength(1)
  })

  it.each([
    [statusBody(true), "already_checked"],
    [statusBody(false, false), "disabled"],
  ] as const)(
    "does not recover begin when the fresh status resolves to %s",
    async (freshStatus, expectedKind) => {
      vi.mocked(resyncSub2ApiAuthToken).mockResolvedValue({
        accessToken: "recovered-access-token",
        userId: "42",
        source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
      })
      vi.mocked(fetchApiResponse)
        .mockResolvedValueOnce(
          response(401, { code: 401, message: "unauthorized" }),
        )
        .mockResolvedValueOnce(response(200, freshStatus))

      await expect(
        performDenxioDailyCheckIn(createRequest(), { wait: async () => {} }),
      ).resolves.toEqual({ kind: expectedKind })
      expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    },
  )

  it("keeps a failed recovered status read out of mutation uncertainty", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValue({
      accessToken: "recovered-access-token",
      userId: "42",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(
        response(401, { code: 401, message: "unauthorized" }),
      )
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))

    await expect(
      performDenxioDailyCheckIn(createRequest(), { wait: async () => {} }),
    ).resolves.toEqual({ kind: "recovery_status_unavailable" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

  it("revalidates account intent before a recovered begin", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValue({
      accessToken: "recovered-access-token",
      userId: "42",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(
        response(401, { code: 401, message: "unauthorized" }),
      )
      .mockResolvedValueOnce(response(200, statusBody()))

    await expect(
      performDenxioDailyCheckIn(createRequest(), {
        wait: async () => {},
        beforeRecoveredMutation: async () => false,
      }),
    ).resolves.toEqual({ kind: "recovery_precondition_failed" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

  it("stops after begin when the saved account is no longer eligible", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(200, beginBody))

    await expect(
      performDenxioDailyCheckIn(createRequest(), {
        wait: async () => {},
        beforeRecoveredMutation: async () => false,
      }),
    ).resolves.toEqual({ kind: "recovery_precondition_failed" })

    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })

  it("does not replay a claim after a transport response is lost", async () => {
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(response(200, beginBody))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))

    await expect(
      performDenxioDailyCheckIn(createRequest(), { wait: async () => {} }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })
})
