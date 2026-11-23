import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import { parseClawhudDailyCheckInStatusResponse } from "~/services/apiService/sub2api/checkin/clawhudCheckIn"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import { parseFreeApiDailyCheckInStatusResponse } from "~/services/apiService/sub2api/checkin/freeApiCheckIn"
import { parseGeniusProgrammerDailyCheckInStatusResponse } from "~/services/apiService/sub2api/checkin/geniusProgrammerCheckIn"
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
vi.mock("~/services/apiService/sub2api/auth/browserAuth", () => ({
  recoverSub2ApiBrowserAuth: vi.fn(),
}))
vi.mock("~/services/apiService/sub2api/auth/tokenRefresh", () => ({
  refreshSub2ApiTokens: vi.fn(),
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
        options: { method: "POST", cache: "no-store" },
      },
    )
  })
})
