import { beforeEach, describe, expect, it, vi } from "vitest"

import { fetchSub2ApiAuthIdentity } from "~/services/apiService/sub2api/auth/authIdentity"
import {
  SUB2API_AUTH_PERSISTENCE_STATUSES,
  type Sub2ApiAuthSession,
  type Sub2ApiStoredAuthSnapshot,
} from "~/services/apiService/sub2api/auth/authSession"
import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import { parseClawhudDailyCheckInStatusResponse } from "~/services/apiService/sub2api/checkin/clawhudCheckIn"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import { parseFreeApiDailyCheckInStatusResponse } from "~/services/apiService/sub2api/checkin/freeApiCheckIn"
import { parseGeniusProgrammerDailyCheckInStatusResponse } from "~/services/apiService/sub2api/checkin/geniusProgrammerCheckIn"
import {
  SUB2API_CHECK_IN_RECOVERY_REASONS,
  Sub2ApiCheckInRecoveryBlockedError,
} from "~/services/apiService/sub2api/checkin/unauthorizedRecovery"
import {
  fetchXingchiDailyCheckInStatus,
  parseXingchiDailyCheckInMutationResponse,
  parseXingchiDailyCheckInStatusResponse,
  performXingchiDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/xingchiCheckIn"
import {
  createXingchiDailyCheckInStatusEndpoint,
  resolveXingchiCheckInTimezone,
} from "~/services/apiService/sub2api/checkin/xingchiCheckInProtocol"
import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))
vi.mock(
  "~/services/apiService/sub2api/auth/browserAuth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/browserAuth")
    >()),
    recoverSub2ApiBrowserAuth: vi.fn(),
  }),
)
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi.fn(),
  }),
)
vi.mock("~/services/apiService/sub2api/auth/authIdentity", () => ({
  fetchSub2ApiAuthIdentity: vi.fn(),
}))

const response = (data: unknown): ApiTransportResponse<unknown> => ({
  ok: true,
  status: 200,
  headers: {},
  body: { code: 0, message: "success", data },
})
const status = { enabled: true, claimed_today: true }
const request: ApiServiceRequest = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://xingchiapi.com",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}

describe("Xingchi check-in contract", () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([true, false])("reads the native day flag: %s", (claimedToday) => {
    expect(
      parseXingchiDailyCheckInStatusResponse(
        response({ enabled: true, claimed_today: claimedToday }),
      ),
    ).toEqual({ enabled: true, checkedInToday: claimedToday })
  })

  it("preserves deployment disablement", () => {
    expect(
      parseXingchiDailyCheckInStatusResponse(
        response({ enabled: false, claimed_today: false }),
      ),
    ).toEqual({ enabled: false, checkedInToday: false })
  })

  it.each([
    {},
    { claimed_today: false },
    { enabled: true, claimed_today: "false" },
    { enabled: "true", claimed_today: false },
    { ...status, checked_in_today: false },
    { ...status, today_checked_in: true },
  ])("rejects incomplete or mixed status fields: %j", (data) => {
    expect(() =>
      parseXingchiDailyCheckInStatusResponse(response(data)),
    ).toThrow(
      expect.objectContaining({ code: API_ERROR_CODES.JSON_PARSE_ERROR }),
    )
  })

  it.each([
    { enabled: true, checked_in_today: false, min_amount: 1, max_amount: 999 },
    { enabled: true, today_checked_in: true, recent_records: [] },
  ])("identifies another protocol served on the shared path", (data) => {
    expect(() =>
      parseXingchiDailyCheckInStatusResponse(response(data)),
    ).toThrow(ForeignCheckInContractError)
  })

  it.each([
    parseFreeApiDailyCheckInStatusResponse,
    parseClawhudDailyCheckInStatusResponse,
    parseGeniusProgrammerDailyCheckInStatusResponse,
  ])("prevents a sibling from claiming Xingchi's state", (parse) => {
    expect(() => parse(response(status))).toThrow(ForeignCheckInContractError)
    for (const field of ["checked_in_today", "today_checked_in"]) {
      expect(() => parse(response({ ...status, [field]: false }))).toThrow()
    }
  })

  it.each([0, 300, "300.1234567890123456789"])(
    "requires a confirmed status and preserves granted amount %s",
    (amount) => {
      expect(
        parseXingchiDailyCheckInMutationResponse(response({ amount, status })),
      ).toEqual({ rewardAmount: amount })
    },
  )

  it.each([
    { amount: 300 },
    { amount: 300, status: { enabled: true, claimed_today: false } },
    { amount: -1, status },
    { amount: Infinity, status },
    { amount: "300 USD", status },
    { amount: null, status },
  ])("does not report success for unconfirmed mutation %j", (data) => {
    expect(() =>
      parseXingchiDailyCheckInMutationResponse(response(data)),
    ).toThrow()
  })

  it("preserves the native duplicate reason for reconciliation", () => {
    expect(() =>
      parseXingchiDailyCheckInMutationResponse({
        ...response(null),
        ok: false,
        status: 409,
        body: {
          code: "CONFLICT",
          message: "Already claimed",
          reason: "CHECKIN_ALREADY_CLAIMED",
        },
      }),
    ).toThrow(
      expect.objectContaining({ upstreamCode: "CHECKIN_ALREADY_CLAIMED" }),
    )
  })

  it("reads with the same timezone as the dashboard interceptor", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(status))
    await fetchXingchiDailyCheckInStatus(request)
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        endpoint: createXingchiDailyCheckInStatusEndpoint(
          resolveXingchiCheckInTimezone(),
        ),
        options: { method: "GET", cache: "no-store" },
      },
    )
  })

  it("does not recover missing credentials during discovery", async () => {
    await expect(
      fetchXingchiDailyCheckInStatus({
        ...request,
        auth: {
          ...request.auth!,
          accessToken: "",
          refreshToken: "example-refresh",
        },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(fetchApiResponse).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
  })

  it("renews an expired credential only for an authorized status read", async () => {
    let stored: Sub2ApiStoredAuthSnapshot = {
      accessToken: "example-token",
      origin: request.baseUrl,
      userId: "42",
      sub2apiAuth: {
        refreshToken: "fixture-refresh",
        tokenExpiresAt: Date.now() - 1,
      },
    }
    const persistAuthUpdate = vi.fn<Sub2ApiAuthSession["persistAuthUpdate"]>(
      async (_id, update) => {
        stored = {
          ...stored,
          accessToken: update.accessToken,
          sub2apiAuth: {
            refreshToken: update.refreshToken!,
            tokenExpiresAt: update.tokenExpiresAt,
          },
        }
        return { status: SUB2API_AUTH_PERSISTENCE_STATUSES.PERSISTED }
      },
    )
    const expiredRequest = {
      ...request,
      accountId: "xingchi-fixture",
      auth: {
        ...request.auth,
        refreshToken: "fixture-refresh",
        tokenExpiresAt: Date.now() - 1,
      },
      sub2apiAuthSession: {
        getLatestAuth: async () => stored,
        persistAuthUpdate,
      },
    }
    vi.mocked(fetchSub2ApiAuthIdentity).mockResolvedValue({
      data: { id: 42 },
      identity: { userId: 42, username: "Fixture", balanceUsd: 0 },
    })
    vi.mocked(refreshSub2ApiTokens).mockResolvedValue({
      accessToken: "renewed-fixture",
      refreshToken: "renewed-refresh",
      tokenExpiresAt: Date.now() + 3_600_000,
    })
    vi.mocked(fetchApiResponse).mockResolvedValue(response(status))

    await fetchXingchiDailyCheckInStatus(expiredRequest)
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    vi.mocked(fetchApiResponse).mockClear()

    await fetchXingchiDailyCheckInStatus(expiredRequest, {
      allowAuthenticationRecovery: true,
    })
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(persistAuthUpdate).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "renewed-fixture" }),
      }),
      expect.objectContaining({
        options: { method: "GET", cache: "no-store" },
      }),
    )
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ amount: 300, status }),
    )
    await performXingchiDailyCheckIn(expiredRequest)
    expect(fetchApiResponse).toHaveBeenLastCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "renewed-fixture" }),
      }),
      expect.objectContaining({
        options: { method: "POST", cache: "no-store", redirect: "error" },
      }),
    )
    expect(fetchApiResponse).toHaveBeenCalledTimes(2)
    expect(refreshSub2ApiTokens).toHaveBeenCalledOnce()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("does not renew or replay an unauthorized POST", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue({
      ...response(null),
      ok: false,
      status: 401,
      body: { code: "UNAUTHORIZED", message: "expired" },
    })
    await expect(
      performXingchiDailyCheckIn({
        ...request,
        auth: {
          ...request.auth,
          refreshToken: "fixture-refresh",
          tokenExpiresAt: Date.now() - 1,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    expect(fetchApiResponse).toHaveBeenCalledOnce()
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("submits once only after the last admission check permits the claim", async () => {
    const beforeRecoveredMutation = vi.fn(async () => {
      expect(fetchApiResponse).not.toHaveBeenCalled()
      return true
    })
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ amount: 300, status }),
    )

    await expect(
      performXingchiDailyCheckIn(request, { beforeRecoveredMutation }),
    ).resolves.toEqual({ rewardAmount: 300 })

    expect(beforeRecoveredMutation).toHaveBeenCalledOnce()
    expect(fetchApiResponse).toHaveBeenCalledOnce()
  })

  it("does not submit when the last admission check revokes the claim", async () => {
    const beforeRecoveredMutation = vi.fn().mockResolvedValue(false)

    await expect(
      performXingchiDailyCheckIn(request, { beforeRecoveredMutation }),
    ).rejects.toEqual(
      new Sub2ApiCheckInRecoveryBlockedError(
        SUB2API_CHECK_IN_RECOVERY_REASONS.PreconditionFailed,
      ),
    )

    expect(beforeRecoveredMutation).toHaveBeenCalledOnce()
    expect(fetchApiResponse).not.toHaveBeenCalled()
    expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
  })

  it("preserves a failed admission check without submitting", async () => {
    const error = new Error("Account was removed")
    const beforeRecoveredMutation = vi.fn().mockRejectedValue(error)

    await expect(
      performXingchiDailyCheckIn(request, { beforeRecoveredMutation }),
    ).rejects.toBe(error)

    expect(beforeRecoveredMutation).toHaveBeenCalledOnce()
    expect(fetchApiResponse).not.toHaveBeenCalled()
  })

  it("submits without a body and never replays a lost response", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(performXingchiDailyCheckIn(request)).rejects.toThrow(
      "Failed to fetch",
    )
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {
        endpoint: "/api/v1/user/checkin",
        options: { method: "POST", cache: "no-store", redirect: "error" },
      },
    )
  })
  it.each(["2026-11-28", "2026-02-30", "unknown", undefined])(
    "retains only a valid native day: %s",
    (today) => {
      const status = parseXingchiDailyCheckInStatusResponse(
        response({ enabled: true, claimed_today: false, today }),
      )
      expect(status.day).toBe(today === "2026-11-28" ? today : undefined)
    },
  )
})
