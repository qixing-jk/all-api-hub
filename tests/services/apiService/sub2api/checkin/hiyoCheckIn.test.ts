import { beforeEach, describe, expect, it, vi } from "vitest"

import { recoverSub2ApiBrowserAuth } from "~/services/apiService/sub2api/auth/browserAuth"
import { refreshSub2ApiTokens } from "~/services/apiService/sub2api/auth/tokenRefresh"
import {
  fetchHiyoDailyCheckInStatus,
  performHiyoDailyCheckIn,
} from "~/services/apiService/sub2api/checkin/hiyoCheckIn"
import { fetchApiResponse } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
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

const request: ApiServiceRequest = {
  baseUrl: "https://free.hiyo.top",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example-token",
    userId: "42",
  },
}
const statusData = {
  enabled: true,
  daily_claimed: false,
  daily_available: true,
  can_claim: true,
  tokens_met: true,
  amount_min: 0.3,
  amount_max: 0.7,
  bonus_available: 0,
  next_reset_at: "2026-10-11T00:00:00+08:00",
}
const response = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: {},
  body: { code: 0, message: "success", data },
})

describe("Hiyo daily check-in protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fetchApiResponse).mockReset()
  })

  it("discovers daily eligibility through the native read-only timezone route", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(statusData))
    await expect(fetchHiyoDailyCheckInStatus(request)).resolves.toEqual({
      enabled: true,
      checkedInToday: false,
    })
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ auth: request.auth }),
      {
        endpoint: `/api/v1/checkin?timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
        options: { method: "GET", cache: "no-store" },
      },
    )
  })

  it.each([
    [
      {
        daily_claimed: true,
        daily_available: false,
        can_claim: true,
        bonus_available: 2,
      },
      true,
      true,
    ],
    [
      { daily_available: false, can_claim: true, bonus_available: 2 },
      false,
      false,
    ],
    [{ tokens_met: false }, false, false],
    [{ can_claim: false }, false, false],
    [{ enabled: false }, false, false],
  ])(
    "separates daily completion and eligibility from extra rewards (%j)",
    async (fields, enabled, checkedInToday) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        response({ ...statusData, ...fields }),
      )
      await expect(fetchHiyoDailyCheckInStatus(request)).resolves.toEqual({
        enabled,
        checkedInToday,
      })
    },
  )

  it("posts the native empty JSON body once and reads the awarded USD amount", async () => {
    vi.mocked(fetchApiResponse).mockResolvedValue(
      response({
        type: "daily",
        amount: 0.4275,
        balance: 3.9763,
        status: {
          ...statusData,
          daily_claimed: true,
          daily_available: false,
          can_claim: false,
        },
      }),
    )
    await expect(performHiyoDailyCheckIn(request)).resolves.toEqual({
      rewardAmount: 0.4275,
    })
    expect(fetchApiResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ auth: request.auth }),
      {
        endpoint: "/api/v1/checkin",
        options: { method: "POST", cache: "no-store", body: "{}" },
      },
    )
  })

  it.each([undefined, "saved-refresh"])(
    "never recovers missing credentials during discovery (refresh=%s)",
    async (refreshToken) => {
      await expect(
        fetchHiyoDailyCheckInStatus({
          ...request,
          auth: { ...request.auth, accessToken: "", refreshToken },
        }),
      ).rejects.toMatchObject({ statusCode: 401 })
      expect(fetchApiResponse).not.toHaveBeenCalled()
      expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
      expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
    },
  )

  it.each([401, 403, 404, 405, 409, 429, 500])(
    "preserves HTTP %s without recovering or replaying",
    async (status) => {
      vi.mocked(fetchApiResponse).mockResolvedValue({
        ok: false,
        status,
        headers: {},
        body: { code: status, message: "error" },
      })
      await expect(fetchHiyoDailyCheckInStatus(request)).rejects.toMatchObject({
        statusCode: status,
      })
      await expect(performHiyoDailyCheckIn(request)).rejects.toMatchObject({
        statusCode: status,
      })
      expect(fetchApiResponse).toHaveBeenCalledTimes(2)
      expect(refreshSub2ApiTokens).not.toHaveBeenCalled()
      expect(recoverSub2ApiBrowserAuth).not.toHaveBeenCalled()
    },
  )

  it.each([
    null,
    {},
    { enabled: true, checked_in_today: false },
    { ...statusData, daily_claimed: "false" },
    { ...statusData, daily_available: undefined },
    { ...statusData, can_claim: undefined },
    { ...statusData, tokens_met: undefined },
  ])("rejects a malformed or sibling status (%j)", async (data) => {
    vi.mocked(fetchApiResponse).mockResolvedValue(response(data))
    await expect(fetchHiyoDailyCheckInStatus(request)).rejects.toThrow()
  })

  it.each([
    "<html>SPA</html>",
    {},
    { code: "0", message: "success", data: statusData },
    { code: 1, message: "disabled", data: statusData },
  ])(
    "does not infer support from an invalid success envelope (%j)",
    async (body) => {
      vi.mocked(fetchApiResponse).mockResolvedValue({ ...response(null), body })
      await expect(fetchHiyoDailyCheckInStatus(request)).rejects.toThrow()
    },
  )

  it.each([
    { type: "bonus" },
    { amount: "0.5" },
    { amount: -1 },
    { amount: Infinity },
    { amount: undefined },
    { status: statusData },
    { status: null },
  ])(
    "never invents a daily reward from an invalid claim (%j)",
    async (fields) => {
      vi.mocked(fetchApiResponse).mockResolvedValue(
        response({
          type: "daily",
          amount: 0.4275,
          status: { ...statusData, daily_claimed: true },
          ...fields,
        }),
      )
      await expect(performHiyoDailyCheckIn(request)).rejects.toThrow()
      expect(fetchApiResponse).toHaveBeenCalledTimes(1)
    },
  )
})
