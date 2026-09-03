import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { wongGongyiProvider } from "~/services/checkin/autoCheckin/providers/wong"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    envelope: vi.fn(),
  },
}))

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "WONG公益站",
  site_url: "https://wong.example.com",
  site_type: SITE_TYPES.WONG_GONGYI,
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
    access_token: "token",
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
  account: Parameters<typeof wongGongyiProvider.checkIn>[0],
  context: Parameters<
    typeof wongGongyiProvider.checkIn
  >[1] = DEFAULT_PROVIDER_CONTEXT,
) => wongGongyiProvider.checkIn(account, context)

describe("wongGongyiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getReadiness", () => {
    it("returns ready for a valid account", () => {
      expect(wongGongyiProvider.getReadiness(mockAccount)).toEqual({
        ready: true,
      })
    })

    it("leaves automatic-execution intent to the Module", () => {
      const account = {
        ...mockAccount,
        checkIn: buildCheckInConfig(),
      }
      expect(wongGongyiProvider.getReadiness(account)).toEqual({ ready: true })
    })

    it("explains when saved credentials are missing", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(wongGongyiProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "credentials_missing",
      })
    })

    it("treats missing authType as access-token auth", () => {
      const account = {
        ...mockAccount,
        authType: undefined as any,
      }
      expect(wongGongyiProvider.getReadiness(account)).toEqual({ ready: true })
    })

    it("requires an access token when authType is missing", () => {
      const account = {
        ...mockAccount,
        authType: undefined as any,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(wongGongyiProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "credentials_missing",
      })
    })
  })

  it("uses a strict GET status envelope and never probes with POST", async () => {
    const { newApiFamilyRequests } = await import(
      "~/services/apiService/newApiFamily/request"
    )
    vi.mocked(newApiFamilyRequests.envelope)
      .mockResolvedValueOnce({
        success: true,
        message: "",
        data: { enabled: false, checked_in: false },
      })
      .mockResolvedValueOnce({ success: true, message: "", data: {} })
      .mockResolvedValueOnce({
        success: false,
        message: "backend rejected the request",
        data: { enabled: true, checked_in: false },
      })

    await expect(
      wongGongyiProvider.detect!({ account: mockAccount, observedAt: 220 }),
    ).resolves.toMatchObject({
      detection: { outcome: "matched" },
      status: { availability: "disabled", today: "not_checked" },
    })
    await expect(
      wongGongyiProvider.detect!({ account: mockAccount, observedAt: 221 }),
    ).resolves.toEqual({
      outcome: "unknown",
      reason: "invalid_response",
      attemptedAt: 221,
    })
    await expect(
      wongGongyiProvider.detect!({ account: mockAccount, observedAt: 222 }),
    ).resolves.toEqual({
      outcome: "unknown",
      reason: "invalid_response",
      attemptedAt: 222,
    })
    expect(
      vi.mocked(newApiFamilyRequests.envelope).mock.calls[0]?.[1],
    ).toMatchObject({
      endpoint: "/api/user/checkin",
      options: { method: "GET" },
    })
  })

  describe("checkIn", () => {
    it("propagates the popup source when POST indicates checked_in true", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(newApiFamilyRequests.envelope)

      mockedFetchApi.mockResolvedValueOnce({
        success: false,
        message: "",
        data: { enabled: true, checked_in: true },
      })

      const result = await checkInForTest(mockAccount, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      })
      expect(result.status).toBe("already_checked")
      expect(mockedFetchApi.mock.calls[0]?.[0]).toMatchObject({
        accountId: "test-id",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
      })
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.alreadyCheckedToday",
      )
    })

    it("returns already_checked when POST success=true but message indicates already checked", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(newApiFamilyRequests.envelope)

      mockedFetchApi.mockResolvedValueOnce({
        success: true,
        message: "今天已经签到过啦",
        data: undefined,
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("already_checked")
      expect(mockedFetchApi.mock.calls[0]?.[0]).toMatchObject({
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
      })
    })

    it("returns failed when POST indicates enabled false", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(newApiFamilyRequests.envelope)

      mockedFetchApi.mockResolvedValueOnce({
        success: true,
        message: "",
        data: { enabled: false, checked_in: false },
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe("autoCheckin:providerWong.checkinDisabled")
    })

    it("returns success when POST succeeds and user was not checked in", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(newApiFamilyRequests.envelope)

      mockedFetchApi.mockResolvedValueOnce({
        success: true,
        message: "",
        data: { enabled: true, checked_in: false },
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("success")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.checkinSuccessful",
      )
    })

    it("does not let ambiguous copy override an explicit unchecked status", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(newApiFamilyRequests.envelope).mockResolvedValueOnce({
        success: true,
        message: "User was not already checked in",
        data: { enabled: true, checked_in: false },
      })

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "success",
        rawMessage: "User was not already checked in",
      })
    })

    it("returns failed when POST returns success=false without already-checked signal", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(newApiFamilyRequests.envelope)

      mockedFetchApi.mockResolvedValueOnce({
        success: false,
        message: "",
        data: { enabled: true, checked_in: false },
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.checkinFailed",
      )
    })

    it("returns already_checked when POST returns already checked message", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(newApiFamilyRequests.envelope)

      mockedFetchApi.mockResolvedValueOnce({
        success: false,
        message: "今天已经签到过啦",
        data: null,
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("handles network errors gracefully", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(newApiFamilyRequests.envelope)

      mockedFetchApi.mockRejectedValueOnce(new TypeError("Failed to fetch"))

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
      expect(result).toMatchObject({
        reasonCode: "network_error",
        messageKey: "autoCheckin:skipReasons.network_error",
      })
      expect(result.rawMessage).toBeUndefined()
    })

    it("marks a lost response after POST dispatch as uncertain", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mutationLifecycle = createAutoCheckinMutationLifecycle()
      vi.mocked(newApiFamilyRequests.envelope).mockImplementationOnce(
        async (request) => {
          request.observer?.onDispatch()
          throw new TypeError("Failed to fetch")
        },
      )

      await expect(
        checkInForTest(mockAccount, {
          ...DEFAULT_PROVIDER_CONTEXT,
          mutationLifecycle,
        }),
      ).resolves.toMatchObject({
        status: "uncertain",
        reasonCode: "network_error",
      })
    })

    it("returns endpointNotSupported when API returns 404", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(newApiFamilyRequests.envelope)

      mockedFetchApi.mockRejectedValueOnce({
        statusCode: 404,
        message: "Not Found",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.endpointNotSupported",
      )
    })
  })
})
