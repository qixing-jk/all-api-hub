import { beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_BROWSER_SESSION_SOURCES } from "~/services/accountBrowserSession/types"
import {
  fetchSub2ApiProDailyCheckInStatus,
  performSub2ApiProDailyCheckIn,
} from "~/services/apiService/sub2api"
import {
  SUB2API_AUTH_PERSISTENCE_STATUSES,
  type Sub2ApiAuthSessionRequest,
} from "~/services/apiService/sub2api/authSession"
import {
  recoverSub2ApiBrowserAuth as resyncSub2ApiAuthToken,
  Sub2ApiAuthIdentityMismatchError,
} from "~/services/apiService/sub2api/browserAuth"
import { fetchApiResponse } from "~/services/apiTransport/request"
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
}))

vi.mock("~/services/apiService/sub2api/browserAuth", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/apiService/sub2api/browserAuth")
    >()
  return {
    ...actual,
    findSub2ApiBrowserAuth: vi.fn(),
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

const statusBody = (checkedInToday = false) => ({
  code: 0,
  message: "success",
  data: {
    enabled: true,
    checked_in_today: checkedInToday,
    reward_min: 1,
    reward_max: 3,
  },
})

const mutationBody = {
  code: 0,
  message: "success",
  data: {
    message: "Daily check-in successful",
    reward_amount: 2,
    new_balance: 10,
    checked_in_at: "2026-08-24T00:00:00Z",
  },
}

const createRequest = (): Sub2ApiAuthSessionRequest => ({
  baseUrl: "https://checkin.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "42",
    accessToken: "expired-access-token",
  },
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  sub2apiAuthSession: { getLatestAuth, persistAuthUpdate },
})

describe("Sub2API Pro daily check-in authenticated transport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
    vi.mocked(resyncSub2ApiAuthToken).mockReset()
    getLatestAuth.mockResolvedValue(null)
    persistAuthUpdate.mockResolvedValue({
      status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED,
    })
  })

  it("does not recover a GET-stage 401 into a mutation", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(401, { code: 401, message: "unauthorized" }),
    )

    await expect(
      fetchSub2ApiProDailyCheckInStatus(createRequest()),
    ).rejects.toMatchObject({ statusCode: 401 })

    expect(fetchApiResponse).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        endpoint: "/api/v1/redeem/checkin/status",
        options: { method: "GET", cache: "no-store" },
      }),
    )
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
    expect(persistAuthUpdate).not.toHaveBeenCalled()
  })

  it("keeps passive status GET free of proactive credential refresh", async () => {
    const refreshFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          message: "success",
          data: {
            access_token: "rotated-access-token",
            refresh_token: "rotated-refresh-token",
            expires_in: 3600,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    const request = createRequest()
    request.auth.refreshToken = "single-use-refresh-token"
    request.auth.tokenExpiresAt = Date.now()
    vi.mocked(fetchApiResponse).mockResolvedValue(response(200, statusBody()))

    await expect(fetchSub2ApiProDailyCheckInStatus(request)).resolves.toEqual({
      enabled: true,
      checkedInToday: false,
    })

    expect(fetchApiResponse).toHaveBeenCalledOnce()
    expect(refreshFetch).not.toHaveBeenCalled()
    expect(persistAuthUpdate).not.toHaveBeenCalled()
    expect(resyncSub2ApiAuthToken).not.toHaveBeenCalled()
  })

  it("persists recovered identity before GET recheck and one recovered POST", async () => {
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
      order.push(`${method}:${token}`)
      if (method === "POST" && token === "expired-access-token") {
        return response(401, { code: 401, message: "unauthorized" })
      }
      if (method === "GET") return response(200, statusBody(false))
      return response(200, mutationBody)
    })

    await expect(
      performSub2ApiProDailyCheckIn(createRequest()),
    ).resolves.toMatchObject({ kind: "applied" })

    expect(order).toEqual([
      "POST:expired-access-token",
      "resync",
      "persist",
      "GET:recovered-access-token",
      "POST:recovered-access-token",
    ])
    expect(
      vi
        .mocked(fetchApiResponse)
        .mock.calls.map(([, options]) => [
          options.options?.method,
          options.endpoint,
        ]),
    ).toEqual([
      ["POST", "/api/v1/redeem/checkin"],
      ["GET", "/api/v1/redeem/checkin/status"],
      ["POST", "/api/v1/redeem/checkin"],
    ])
    expect(resyncSub2ApiAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://checkin.example.invalid",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        expectedUserId: "42",
      }),
    )
    expect(persistAuthUpdate).toHaveBeenCalledWith(
      "account-1",
      expect.objectContaining({
        accessToken: "recovered-access-token",
        userId: "42",
        expectedOrigin: "https://checkin.example.invalid",
        expectedUserId: "42",
      }),
    )
  })

  it("stops before recheck or recovered POST when credential persistence fails", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValue({
      accessToken: "recovered-access-token",
      userId: "42",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    persistAuthUpdate.mockResolvedValue({
      status: SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED,
    })
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(401, { code: 401, message: "unauthorized" }),
    )

    await expect(
      performSub2ApiProDailyCheckIn(createRequest()),
    ).rejects.toMatchObject({
      result: { status: SUB2API_AUTH_PERSISTENCE_STATUSES.WRITE_FAILED },
    })
    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })

  it("stops after an identity mismatch without a recovered POST", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockRejectedValue(
      new Sub2ApiAuthIdentityMismatchError(),
    )
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(401, { code: 401, message: "unauthorized" }),
    )

    await expect(
      performSub2ApiProDailyCheckIn(createRequest()),
    ).rejects.toMatchObject({
      result: { status: SUB2API_AUTH_PERSISTENCE_STATUSES.IDENTITY_MISMATCH },
    })
    expect(fetchApiResponse).toHaveBeenCalledOnce()
    expect(persistAuthUpdate).not.toHaveBeenCalled()
  })

  it("clears pre-handler dispatch evidence when auth recovery fails", async () => {
    const observer = {
      dispatched: false,
      responseReceived: false,
      onDispatch() {
        this.dispatched = true
      },
      onResponse() {
        this.responseReceived = true
      },
      onPreHandlerUnauthorized() {
        this.dispatched = false
        this.responseReceived = false
      },
    }
    vi.mocked(resyncSub2ApiAuthToken).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(401, { code: 401, message: "unauthorized" }),
    )

    await expect(
      performSub2ApiProDailyCheckIn({ ...createRequest(), observer }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(observer.dispatched).toBe(false)
    expect(observer.responseReceived).toBe(false)
    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })

  it("keeps observer failures isolated from the authentication result", async () => {
    const observerError = new Error("observer failed")
    const observer = {
      onDispatch: vi.fn(),
      onResponse: vi.fn(),
      onPreHandlerUnauthorized: vi.fn(() => {
        throw observerError
      }),
    }
    const authenticationError = new TypeError("Failed to fetch")
    vi.mocked(resyncSub2ApiAuthToken).mockRejectedValue(authenticationError)
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response(401, { code: 401, message: "unauthorized" }),
    )

    await expect(
      performSub2ApiProDailyCheckIn({ ...createRequest(), observer }),
    ).rejects.toBe(authenticationError)
    expect(observer.onPreHandlerUnauthorized).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })

  it("does not send a recovered POST when the recheck is already checked", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValue({
      accessToken: "recovered-access-token",
      userId: "42",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(
        response(401, { code: 401, message: "unauthorized" }),
      )
      .mockResolvedValueOnce(response(200, statusBody(true)))

    await expect(
      performSub2ApiProDailyCheckIn(createRequest()),
    ).resolves.toEqual({ kind: "already_checked" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

  it("does not send a recovered POST when the recheck is disabled", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValue({
      accessToken: "recovered-access-token",
      userId: "42",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(
        response(401, { code: 401, message: "unauthorized" }),
      )
      .mockResolvedValueOnce(
        response(200, {
          ...statusBody(false),
          data: { ...statusBody(false).data, enabled: false },
        }),
      )

    await expect(
      performSub2ApiProDailyCheckIn(createRequest()),
    ).resolves.toEqual({ kind: "disabled" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

  it("revalidates selection before a recovered POST", async () => {
    vi.mocked(resyncSub2ApiAuthToken).mockResolvedValue({
      accessToken: "recovered-access-token",
      userId: "42",
      source: ACCOUNT_BROWSER_SESSION_SOURCES.EXISTING_TAB,
    })
    vi.mocked(fetchApiResponse)
      .mockResolvedValueOnce(
        response(401, { code: 401, message: "unauthorized" }),
      )
      .mockResolvedValueOnce(response(200, statusBody(false)))

    await expect(
      performSub2ApiProDailyCheckIn(createRequest(), {
        beforeRecoveredMutation: async () => false,
      }),
    ).resolves.toEqual({ kind: "recovery_precondition_failed" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })

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
      performSub2ApiProDailyCheckIn(createRequest()),
    ).resolves.toEqual({ kind: "recovery_status_unavailable" })
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
  })
})
