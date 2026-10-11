import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import { ForeignCheckInContractError } from "~/services/apiService/sub2api/checkin/foreignCheckInContract"
import {
  fetchGeniusProgrammerDailyCheckInStatus,
  GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS,
  parseGeniusProgrammerDailyCheckInMutationResponse,
  parseGeniusProgrammerDailyCheckInStatusResponse,
  performGeniusProgrammerDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/geniusProgrammerCheckIn"
import { ApiError } from "~/services/apiTransport/errors"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type {
  ApiServiceRequest,
  ApiTransportResponse,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock(
  "~/services/apiService/sub2api/auth/browserAuth",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/browserAuth")
    >()),
    recoverSub2ApiBrowserAuth: vi.fn().mockResolvedValue(null),
  }),
)
vi.mock(
  "~/services/apiService/sub2api/auth/tokenRefresh",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/apiService/sub2api/auth/tokenRefresh")
    >()),
    refreshSub2ApiTokens: vi
      .fn()
      .mockRejectedValue(new Error("refresh unavailable")),
  }),
)

vi.mock("~/services/apiTransport/request", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/services/apiTransport/request")>()),
  fetchApiResponse: vi.fn(),
}))

const response = (
  data: unknown,
  status = 200,
): ApiTransportResponse<unknown> => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {},
  body: { code: 0, message: "success", data },
})
const request: ApiServiceRequest = {
  baseUrl: "https://codexcli.club",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}

describe("Genius Programmer check-in protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("retains only authoritative status, discarding personal history", () => {
    expect(
      parseGeniusProgrammerDailyCheckInStatusResponse(
        response({
          enabled: true,
          today_checked_in: true,
          recent_records: [{ user: { email: "private@example.invalid" } }],
        }),
      ),
    ).toEqual({ enabled: true, checkedInToday: true })
  })

  it.each([
    null,
    [],
    {},
    { enabled: true, checked_in_today: false },
    { enabled: "true", today_checked_in: false },
    { enabled: true, today_checked_in: 0 },
  ])("rejects invalid or sibling status DTO %j", (data) => {
    expect(() =>
      parseGeniusProgrammerDailyCheckInStatusResponse(response(data)),
    ).toThrow()
  })

  it("classifies a success envelope of a sibling contract as foreign, not malformed", () => {
    // clawhud (https://api.clawhud.com) serves this same path with
    // checked_in_today; discovery must treat it as "not served here" instead
    // of an unknown probe that poisons the unique-match decision.
    expect(() =>
      parseGeniusProgrammerDailyCheckInStatusResponse(
        response({
          enabled: true,
          checked_in_today: false,
          today: "2026-10-11",
          timezone: "Asia/Taipei",
          min_amount: 1,
          max_amount: 10,
        }),
      ),
    ).toThrow(ForeignCheckInContractError)
  })

  it.each([
    {},
    { enabled: true },
    { enabled: true, checked_in_today: 0 },
    { enabled: "true", checked_in_today: false },
    { enabled: true, today_checked_in: undefined, checked_in_today: false },
  ])("keeps incomplete or malformed status inconclusive: %j", (data) => {
    expect(() =>
      parseGeniusProgrammerDailyCheckInStatusResponse(response(data)),
    ).toThrow(expect.objectContaining({ code: "JSON_PARSE_ERROR" }))
  })

  it("keeps a malformed contract on this path as an invalid response", () => {
    let thrown: unknown
    try {
      parseGeniusProgrammerDailyCheckInStatusResponse(
        response({ enabled: "true", today_checked_in: false }),
      )
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).not.toBeInstanceOf(ForeignCheckInContractError)
  })

  it.each([401, 403, 404, 405, 429, 500])(
    "preserves HTTP %s even with a malformed envelope",
    (status) => {
      expect(() =>
        parseGeniusProgrammerDailyCheckInStatusResponse({
          ...response(null, status),
          body: "not JSON",
        }),
      ).toThrow(expect.objectContaining({ statusCode: status }))
    },
  )

  it.each([
    null,
    {},
    { code: "0", message: "success" },
    { code: NaN, message: "success" },
    {
      code: 1,
      message: "failed",
      data: { enabled: true, today_checked_in: false },
    },
  ])("rejects malformed or failed envelopes %j", (body) => {
    expect(() =>
      parseGeniusProgrammerDailyCheckInStatusResponse({
        ...response(null),
        body,
      }),
    ).toThrow()
  })

  it.each([true, false])(
    "maps new_reward=%s without retaining the user record",
    (newReward) => {
      expect(
        parseGeniusProgrammerDailyCheckInMutationResponse(
          response({
            new_reward: newReward,
            reward_amount: 0.05,
            record: { user: { id: 42 } },
          }),
        ),
      ).toEqual(
        newReward
          ? {
              kind: GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.Applied,
              data: { rewardAmount: 0.05 },
            }
          : {
              kind: GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
            },
      )
    },
  )

  it("recognizes an already-checked response without reward details", () => {
    expect(
      parseGeniusProgrammerDailyCheckInMutationResponse(
        response({ new_reward: false }),
      ),
    ).toEqual({
      kind: GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
    })
  })

  it.each([
    {},
    { new_reward: 1, reward_amount: 0.05 },
    { new_reward: true },
    { new_reward: true, reward_amount: "0.05" },
    { new_reward: true, reward_amount: -1 },
    { new_reward: true, reward_amount: Infinity },
  ])("does not claim success for malformed mutation %j", (data) => {
    expect(() =>
      parseGeniusProgrammerDailyCheckInMutationResponse(response(data)),
    ).toThrow()
  })

  it("sends an authenticated uncached GET with the browser timezone", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ enabled: true, today_checked_in: false }),
    )
    await expect(
      fetchGeniusProgrammerDailyCheckInStatus(request),
    ).resolves.toEqual({
      enabled: true,
      checkedInToday: false,
    })
    expect(fetchApiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ accessToken: "example-token" }),
      }),
      {
        endpoint: `/api/v1/user/checkin/status?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
        options: { method: "GET", cache: "no-store" },
      },
    )
  })

  it("falls back to UTC if the browser cannot resolve its timezone", async () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("unavailable")
    })
    try {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        response({ enabled: false, today_checked_in: false }),
      )
      await fetchGeniusProgrammerDailyCheckInStatus(request)
      expect(fetchApiResponse).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          endpoint: "/api/v1/user/checkin/status?timezone=UTC",
        }),
      )
    } finally {
      spy.mockRestore()
    }
  })

  it.each([undefined, "example-refresh-token"])(
    "does not recover missing credentials during status discovery (refresh=%s)",
    async (refreshToken) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(response(null, 401))
      await expect(
        fetchGeniusProgrammerDailyCheckInStatus({
          ...request,
          auth: { ...request.auth!, accessToken: "", refreshToken },
        }),
      ).rejects.toMatchObject({ statusCode: 401 })
      expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
      expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
      expect(fetchApiResponse).not.toHaveBeenCalled()
    },
  )

  it("submits a single POST without a request body", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({ new_reward: false, reward_amount: 0.05 }),
    )
    await expect(performGeniusProgrammerDailyCheckIn(request)).resolves.toEqual(
      {
        kind: GENIUS_PROGRAMMER_DAILY_CHECK_IN_RESULT_KINDS.AlreadyChecked,
      },
    )
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    expect(fetchApiResponse).toHaveBeenCalledWith(expect.anything(), {
      endpoint: "/api/v1/user/checkin",
      options: { method: "POST", cache: "no-store" },
    })
  })

  it.each([
    fetchGeniusProgrammerDailyCheckInStatus,
    performGeniusProgrammerDailyCheckIn,
  ])("does not replay after an unauthorized response", async (operation) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(null, 401))
    await expect(operation(request)).rejects.toMatchObject({
      statusCode: 401,
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })

  it("does not replay a write whose response was lost", async () => {
    vi.mocked(fetchApiResponse).mockRejectedValue(
      new TypeError("Failed to fetch"),
    )
    await expect(
      performGeniusProgrammerDailyCheckIn(request),
    ).rejects.toMatchObject({
      message: "Failed to fetch",
    })
    expect(fetchApiResponse).toHaveBeenCalledTimes(1)
  })
})
