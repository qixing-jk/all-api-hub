import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  fetchApi,
  fetchApiData,
} from "~/services/apiService/newApiFamily/request"
import { ApiError } from "~/services/apiTransport/errors"
import { veloeraProvider } from "~/services/checkin/autoCheckin/providers/veloera"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const { mockFetchVeloeraCheckInSupport } = vi.hoisted(() => ({
  mockFetchVeloeraCheckInSupport: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  fetchApi: vi.fn(),
  fetchApiData: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/variants/veloeraCheckIn", () => ({
  fetchSupportCheckIn: mockFetchVeloeraCheckInSupport,
}))

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "Test",
  site_url: "https://test.com",
  site_type: SITE_TYPES.VELOERA,
  authType: AuthTypeEnum.AccessToken,
  exchange_rate: 7.0,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  excludeFromTodayIncome: false,
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
  health: { status: SiteHealthStatus.Healthy },
  account_info: {
    id: "123",
    access_token: "test-token",
    username: "test",
    quota: 1000,
    today_prompt_tokens: 0,
    today_completion_tokens: 0,
    today_quota_consumption: 0,
    today_requests_count: 0,
    today_income: 0,
  },
  last_sync_time: Date.now(),
  created_at: Date.now(),
  updated_at: Date.now(),
  user_updated_at: Date.now(),
}

const DEFAULT_PROVIDER_CONTEXT = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
} as const

const checkInForTest = (
  account: Parameters<typeof veloeraProvider.checkIn>[0],
  context: Parameters<
    typeof veloeraProvider.checkIn
  >[1] = DEFAULT_PROVIDER_CONTEXT,
) => veloeraProvider.checkIn(account, context)

describe("veloeraProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchVeloeraCheckInSupport.mockReset()
    mockFetchVeloeraCheckInSupport.mockResolvedValue(undefined)
  })

  describe("getReadiness", () => {
    it("returns ready for a valid account", () => {
      expect(veloeraProvider.getReadiness(mockAccount)).toEqual({ ready: true })
    })

    it("leaves automatic-execution intent to the Module", () => {
      const account = {
        ...mockAccount,
        checkIn: buildCheckInConfig(),
      }
      expect(veloeraProvider.getReadiness(account)).toEqual({ ready: true })
    })

    it("explains when saved credentials are missing", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(veloeraProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "credentials_missing",
      })
    })

    it("defaults legacy accounts without auth type to access-token readiness", () => {
      const account = {
        ...mockAccount,
        authType: undefined,
        account_info: { ...mockAccount.account_info, access_token: "" },
      } as unknown as SiteAccount

      expect(veloeraProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "credentials_missing",
      })
    })

    it("allows cookie-auth accounts without an access token", () => {
      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.Cookie,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }

      expect(veloeraProvider.getReadiness(account)).toEqual({ ready: true })
    })
  })

  it("uses only the safe GET reader and rejects malformed status", async () => {
    vi.mocked(fetchApiData)
      .mockResolvedValueOnce({ can_check_in: true })
      .mockResolvedValueOnce({})

    await expect(
      veloeraProvider.detect!({ account: mockAccount, observedAt: 210 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: { outcome: "known", today: "not_checked" },
    })
    await expect(
      veloeraProvider.detect!({ account: mockAccount, observedAt: 211 }),
    ).resolves.toEqual({
      outcome: "unknown",
      reason: "invalid_response",
      attemptedAt: 211,
    })
    expect(vi.mocked(fetchApiData).mock.calls[0]?.[1]).toMatchObject({
      endpoint: "/api/user/check_in_status",
    })
    expect(fetchApi).not.toHaveBeenCalled()
  })

  it("uses the public Veloera capability flag before the per-user status", async () => {
    mockFetchVeloeraCheckInSupport.mockResolvedValueOnce(false)

    await expect(
      veloeraProvider.detect!({ account: mockAccount, observedAt: 212 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: { outcome: "known", availability: "disabled" },
    })
    expect(fetchApiData).not.toHaveBeenCalled()
  })

  it("propagates the discovery abort signal to the public support probe", async () => {
    const controller = new AbortController()
    mockFetchVeloeraCheckInSupport.mockResolvedValueOnce(false)

    await veloeraProvider.detect!({
      account: mockAccount,
      observedAt: 213,
      signal: controller.signal,
    })

    expect(mockFetchVeloeraCheckInSupport).toHaveBeenCalledWith(
      expect.any(Object),
      controller.signal,
    )
  })

  describe("checkIn", () => {
    it("propagates the popup source when the backend omits a message", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        data: { quota_awarded: 2 },
        message: "",
      })

      const result = await checkInForTest(mockAccount, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      })

      expect(result).toEqual({
        status: "success",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
        data: { quota_awarded: 2 },
      })
      expect(vi.mocked(fetchApi).mock.calls[0]?.[0]).toMatchObject({
        accountId: "test-id",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      })
    })

    it("returns success on successful check-in", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        data: null,
        message: "Success",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("success")
      expect(vi.mocked(fetchApi).mock.calls[0]?.[0]).toMatchObject({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      })
    })

    it("returns already_checked when already checked in", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        data: null,
        message: "已签到",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("returns the fallback failure key when the backend fails without a message", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        data: { code: 500 },
        message: "",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: {
          success: false,
          data: { code: 500 },
          message: "",
        },
      })
    })

    it("uses status readback to recognize an already completed check-in", async () => {
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: false,
        data: null,
        message: "No action was performed",
      })
      mockFetchVeloeraCheckInSupport.mockResolvedValueOnce(true)
      vi.mocked(fetchApiData).mockResolvedValueOnce({ can_check_in: false })

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "already_checked",
        rawMessage: "No action was performed",
      })
    })

    it("does not infer endpoint support from unrelated error text", async () => {
      vi.mocked(fetchApi).mockRejectedValueOnce(
        new Error("Quota bucket 404 is unavailable"),
      )

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: "Quota bucket 404 is unavailable",
        messageKey: undefined,
      })
    })

    it("maps a structured 404 response to endpoint-not-supported", async () => {
      vi.mocked(fetchApi).mockRejectedValueOnce(
        new ApiError("Not found", 404, "/api/user/check_in"),
      )

      await expect(checkInForTest(mockAccount)).resolves.toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
    })

    it("handles errors gracefully", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockRejectedValueOnce(new Error("Network error"))

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
    })
  })
})
