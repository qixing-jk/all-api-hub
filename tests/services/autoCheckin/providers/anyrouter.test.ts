import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { anyrouterProvider } from "~/services/checkin/autoCheckin/providers/anyrouter"
import type { AnyrouterCheckInParams } from "~/services/checkin/autoCheckin/providers/contracts"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  fetchApi: vi.fn(),
}))

const mockAccount: SiteAccount = {
  id: "test-id",
  site_name: "AnyRouter",
  site_url: "https://anyrouter.top",
  site_type: SITE_TYPES.ANYROUTER,
  authType: AuthTypeEnum.Cookie,
  exchange_rate: 7.0,
  notes: "",
  tagIds: [],
  disabled: false,
  excludeFromTotalBalance: false,
  excludeFromTodayIncome: false,
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
  health: { status: SiteHealthStatus.Healthy },
  account_info: {
    id: "12345",
    access_token: "",
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
  account: Parameters<typeof anyrouterProvider.checkIn>[0],
  context: Parameters<
    typeof anyrouterProvider.checkIn
  >[1] = DEFAULT_PROVIDER_CONTEXT,
) => anyrouterProvider.checkIn(account, context)

describe("anyrouterProvider", () => {
  describe("getReadiness", () => {
    it("returns ready for a valid account", () => {
      expect(anyrouterProvider.getReadiness(mockAccount)).toEqual({
        ready: true,
      })
    })

    it("leaves automatic-execution intent to the Module", () => {
      const account = {
        ...mockAccount,
        checkIn: buildCheckInConfig(),
      }
      expect(anyrouterProvider.getReadiness(account)).toEqual({ ready: true })
    })

    it("explains when account data is missing", () => {
      const account = {
        ...mockAccount,
        account_info: { ...mockAccount.account_info, id: "" },
      }
      expect(anyrouterProvider.getReadiness(account)).toEqual({
        ready: false,
        reason: "account_data_missing",
      })
    })
  })

  describe("checkIn", () => {
    it("propagates the popup source on a successful check-in", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 1,
        success: true,
        message: "签到成功，获得 $25 额度",
      })

      const protectionBypassExecution = userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      )
      const result = await checkInForTest(mockAccount, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution,
      })
      expect(result.status).toBe("success")
      expect(mockedFetchApi.mock.calls[0]?.[0]).toMatchObject({
        accountId: "test-id",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        forceTempWindow: true,
        protectionBypassExecution,
      })
    })

    it("passes lightweight AnyRouter account context to fetchApi", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 1,
        success: true,
        message: "Success",
      })

      const account: AnyrouterCheckInParams = {
        id: "stored-account-id",
        site_url: "https://anyrouter.top",
        cookieAuthSessionCookie: "session=stored-cookie",
        account_info: {
          id: 12345,
        },
      }

      const result = await checkInForTest(account)

      const latestRequest =
        mockedFetchApi.mock.calls[mockedFetchApi.mock.calls.length - 1]?.[0]
      expect(result.status).toBe("success")
      expect(latestRequest).toMatchObject({
        baseUrl: "https://anyrouter.top",
        accountId: "stored-account-id",
        cookieAuthSessionCookie: "session=stored-cookie",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
        forceTempWindow: true,
        auth: {
          authType: AuthTypeEnum.Cookie,
          userId: 12345,
        },
      })
    })

    it("returns success for English success messages", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 1,
        success: true,
        message: "Success! bonus quota granted",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "success",
        rawMessage: "Success! bonus quota granted",
        messageKey: undefined,
        data: {
          code: 1,
          ret: 1,
          success: true,
          message: "Success! bonus quota granted",
        },
      })
    })

    it("returns success when success is true and optional result fields are omitted", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockResolvedValueOnce({
        success: true,
        message: "",
      })

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "success",
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      })
    })

    it("does not treat an empty message as already checked", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: true,
        message: "",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("success")
    })

    it("returns already_checked when response is success and message indicates a prior check-in", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: true,
        message: "already checked today",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "already_checked",
        rawMessage: "already checked today",
        messageKey: undefined,
      })
    })

    it("returns the fallback failure key when the backend fails without a message", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: false,
        message: "",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        rawMessage: undefined,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
        data: {
          code: 1,
          ret: 0,
          success: false,
          message: "",
        },
      })
    })

    it.each([
      ["ret", { ret: 1, message: "queued" }],
      ["code", { code: 0, message: "queued" }],
    ])("accepts %s as an independent success signal", async (_, response) => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce(response)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("success")
      expect(result.rawMessage).toBe("queued")
    })

    it("does not infer already checked from a zero ret value", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: true,
        message: "No action was performed",
      })

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "success",
        rawMessage: "No action was performed",
      })
    })

    it("recognizes an explicit already-checked message on a negative response", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: false,
        message: "已签到",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("recognizes the msg field used by compatible deployments", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockResolvedValueOnce({
        ret: 0,
        msg: "already checked today",
      })

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "already_checked",
        rawMessage: "already checked today",
      })
    })

    it("returns failed when response indicates failure", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: false,
        message: "error",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
    })

    it("maps 404 errors to endpoint-not-supported", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockRejectedValueOnce({
        statusCode: 404,
        message: "Not found",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
    })

    it("returns already_checked when request throws and error message indicates already checked", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockRejectedValueOnce(new Error("已签到"))

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("does not treat an empty thrown message as already checked", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      vi.mocked(fetchApi).mockRejectedValueOnce(new Error(""))

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "failed",
      })
    })

    it("handles errors gracefully", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        fetchApi as unknown as (...args: any[]) => Promise<any>,
      )
      mockedFetchApi.mockRejectedValueOnce(new Error("Network error"))

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
    })

    it("returns uncertain when the response is lost after dispatch", async () => {
      const { fetchApi } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mutationLifecycle = createAutoCheckinMutationLifecycle()
      vi.mocked(fetchApi).mockImplementationOnce(async (request) => {
        request.observer?.onDispatch()
        throw new TypeError("Failed to fetch")
      })

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
  })
})
