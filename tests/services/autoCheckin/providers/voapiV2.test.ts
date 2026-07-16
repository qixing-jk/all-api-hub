import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  resolveAutoCheckinProvider,
  type AutoCheckinProvider,
} from "~/services/checkin/autoCheckin/providers"
import { voApiV2Provider } from "~/services/checkin/autoCheckin/providers/voapiV2"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { server } from "~~/tests/msw/server"

const {
  mockResyncVoApiV2AuthToken,
  mockUpdateAccount,
  mockSubmitVoApiV2CheckIn,
  mockFetchVoApiV2CheckInStats,
} = vi.hoisted(() => ({
  mockResyncVoApiV2AuthToken: vi.fn(),
  mockUpdateAccount: vi.fn(),
  mockSubmitVoApiV2CheckIn: vi.fn(),
  mockFetchVoApiV2CheckInStats: vi.fn(),
}))

vi.mock("~/services/apiService/voapiV2", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiService/voapiV2")>()

  return {
    ...actual,
    submitVoApiV2CheckIn: (
      ...args: Parameters<typeof actual.submitVoApiV2CheckIn>
    ) => {
      mockSubmitVoApiV2CheckIn(...args)
      return actual.submitVoApiV2CheckIn(...args)
    },
    fetchVoApiV2CheckInStats: (
      ...args: Parameters<typeof actual.fetchVoApiV2CheckInStats>
    ) => {
      mockFetchVoApiV2CheckInStats(...args)
      return actual.fetchVoApiV2CheckInStats(...args)
    },
  }
})

vi.mock("~/services/apiService/voapiV2/tokenResync", () => ({
  resyncVoApiV2AuthToken: mockResyncVoApiV2AuthToken,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    updateAccount: mockUpdateAccount,
  },
}))

const account = {
  id: "account-1",
  site_type: SITE_TYPES.VO_API_V2,
  site_url: "https://example.invalid",
  account_info: {
    id: "7",
    access_token: "jwt-dashboard",
  },
  checkIn: {
    enableDetection: true,
  },
} as unknown as SiteAccount

describe("voApiV2Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResyncVoApiV2AuthToken.mockResolvedValue(null)
    mockUpdateAccount.mockResolvedValue(true)
  })

  it("registers the VoAPI v2 auto-check-in provider", () => {
    expect(resolveAutoCheckinProvider(account)).toBe(
      voApiV2Provider as AutoCheckinProvider,
    )
  })

  it("propagates the popup source through VoAPI v2 check-in and stats requests", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", ({ request }) => {
        expect(request.headers.get("authorization")).toBe("jwt-dashboard")
        return HttpResponse.json({
          code: 0,
          data: { amount: "0.1", bonusAmount: "0" },
        })
      }),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: true } }),
      ),
    )

    await expect(
      voApiV2Provider.checkIn(account, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.SUCCESS })
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    )
    expect(mockFetchVoApiV2CheckInStats).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    )
  })

  it("treats repeated same-day sign-in as already checked", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({ code: 1, data: null, msg: "Signed in today" }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: true } }),
      ),
    )

    await expect(voApiV2Provider.checkIn(account)).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    })
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      }),
    )
  })

  it("does not run without the saved dashboard JWT", () => {
    expect(
      voApiV2Provider.canCheckIn({
        ...account,
        account_info: { ...account.account_info, access_token: "" },
      } as SiteAccount),
    ).toBe(false)
  })

  it("does not run when automatic check-in is disabled", () => {
    expect(
      voApiV2Provider.canCheckIn({
        ...account,
        checkIn: {
          enableDetection: true,
          autoCheckInEnabled: false,
        },
      } as SiteAccount),
    ).toBe(false)
  })

  it("returns a failed result for unusable VoAPI v2 accounts", async () => {
    await expect(
      voApiV2Provider.checkIn({
        ...account,
        account_info: { ...account.account_info, access_token: "" },
      } as SiteAccount),
    ).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
    })
  })

  it("reports failure when submit succeeds but final stats are not checked in", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({
          code: 0,
          data: { amount: "0.1", bonusAmount: "0" },
        }),
      ),
      http.get("https://example.invalid/api/check_in/stats", () =>
        HttpResponse.json({ code: 0, data: { todaySigned: false } }),
      ),
    )

    await expect(voApiV2Provider.checkIn(account)).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
    })
  })

  it("returns a provider error result when an expired JWT cannot be resynced", async () => {
    mockResyncVoApiV2AuthToken.mockResolvedValueOnce(null)
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json({
          code: 2,
          data: null,
          msg: "Auth expire",
        }),
      ),
    )

    await expect(voApiV2Provider.checkIn(account)).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
    })
    expect(mockResyncVoApiV2AuthToken).toHaveBeenCalledWith(
      "https://example.invalid",
      TEMP_WINDOW_REQUEST_SOURCES.Background,
    )
  })

  it("reports generic backend failures without dashboard JWT re-sync", async () => {
    server.use(
      http.post("https://example.invalid/api/check_in", () =>
        HttpResponse.json(
          { code: 500, data: null, msg: "Backend unavailable" },
          { status: 500 },
        ),
      ),
    )

    await expect(voApiV2Provider.checkIn(account)).resolves.toMatchObject({
      status: CHECKIN_RESULT_STATUS.FAILED,
    })
    expect(mockResyncVoApiV2AuthToken).not.toHaveBeenCalled()
  })

  it("re-syncs an expired dashboard JWT before retrying API check-in", async () => {
    const postAuthorizations: (string | null)[] = []
    const statsAuthorizations: (string | null)[] = []
    mockResyncVoApiV2AuthToken.mockResolvedValueOnce({
      accessToken: "resynced-dashboard-token",
      userId: "8",
      username: "resynced-owner",
      source: "existing_tab",
    })

    server.use(
      http.post("https://example.invalid/api/check_in", ({ request }) => {
        const authorization = request.headers.get("authorization")
        postAuthorizations.push(authorization)
        if (authorization === "jwt-dashboard") {
          return HttpResponse.json({
            code: 2,
            data: null,
            msg: "Auth expire",
          })
        }

        return HttpResponse.json({
          code: 0,
          data: { amount: "0.1", bonusAmount: "0" },
        })
      }),
      http.get("https://example.invalid/api/check_in/stats", ({ request }) => {
        statsAuthorizations.push(request.headers.get("authorization"))
        return HttpResponse.json({ code: 0, data: { todaySigned: true } })
      }),
    )

    await expect(
      voApiV2Provider.checkIn(account, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    ).resolves.toMatchObject({ status: CHECKIN_RESULT_STATUS.SUCCESS })

    expect(postAuthorizations).toEqual([
      "jwt-dashboard",
      "resynced-dashboard-token",
    ])
    expect(statsAuthorizations).toEqual(["resynced-dashboard-token"])
    expect(mockResyncVoApiV2AuthToken).toHaveBeenCalledWith(
      "https://example.invalid",
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )
    expect(mockSubmitVoApiV2CheckIn).toHaveBeenCalledTimes(2)
    for (const [request] of mockSubmitVoApiV2CheckIn.mock.calls) {
      expect(request).toMatchObject({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      })
    }
    expect(mockFetchVoApiV2CheckInStats).toHaveBeenCalledWith(
      expect.objectContaining({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      }),
    )
    expect(mockUpdateAccount).toHaveBeenCalledWith(
      "account-1",
      expect.objectContaining({
        account_info: expect.objectContaining({
          access_token: "resynced-dashboard-token",
          id: "8",
          username: "resynced-owner",
        }),
      }),
      expect.any(Object),
    )
  })
})
