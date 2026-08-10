import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { veloeraProvider } from "~/services/checkin/autoCheckin/providers/veloera"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"

vi.mock("~/services/apiTransport/request", () => ({
  fetchApi: vi.fn(),
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
  checkIn: {
    automaticExecutionEnabled: true,
    methodKnowledge: { methods: {} },
    selection: { mode: "automatic" as const },
  },
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
  })

  describe("canCheckIn", () => {
    it("returns true for valid account", () => {
      expect(veloeraProvider.canCheckIn(mockAccount)).toBe(true)
    })

    it("leaves automatic-execution intent to the Module", () => {
      const account = {
        ...mockAccount,
        checkIn: {
          automaticExecutionEnabled: false,
          methodKnowledge: { methods: {} },
          selection: { mode: "automatic" as const },
        },
      }
      expect(veloeraProvider.canCheckIn(account)).toBe(true)
    })

    it("returns false when no access token", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }
      expect(veloeraProvider.canCheckIn(account)).toBe(false)
    })

    it("allows cookie-auth accounts without an access token", () => {
      const account = {
        ...mockAccount,
        authType: AuthTypeEnum.Cookie,
        account_info: { ...mockAccount.account_info, access_token: "" },
      }

      expect(veloeraProvider.canCheckIn(account)).toBe(true)
    })
  })

  describe("checkIn", () => {
    it("propagates the popup source when the backend omits a message", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
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
      const { fetchApi } = await import("~/services/apiTransport/request")
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
      const { fetchApi } = await import("~/services/apiTransport/request")
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        data: null,
        message: "已签到",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("returns the fallback failure key when the backend fails without a message", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
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

    it("maps 404-style error messages to endpoint-not-supported", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      vi.mocked(fetchApi).mockRejectedValueOnce(new Error("404 Not found"))

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
    })

    it("handles errors gracefully", async () => {
      const { fetchApi } = await import("~/services/apiTransport/request")
      vi.mocked(fetchApi).mockRejectedValueOnce(new Error("Network error"))

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
    })
  })
})
