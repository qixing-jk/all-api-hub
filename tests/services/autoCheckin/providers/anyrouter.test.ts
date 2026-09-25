import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { decodeNewApiResponseError } from "~/services/apiService/newApiFamily/responseError"
import { mapCompatibilityResponse } from "~/services/apiTransport/compatibilityResponse"
import { anyrouterProvider } from "~/services/checkin/autoCheckin/providers/anyrouter"
import type { AnyrouterCheckInParams } from "~/services/checkin/autoCheckin/providers/contracts"
import { canAutomaticallyRetryCheckinResult } from "~/services/checkin/autoCheckin/resultPolicy"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
} from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { createAutoCheckinMutationLifecycle } from "~~/tests/test-utils/autoCheckin"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

vi.mock("~/services/apiService/newApiFamily/request", () => ({
  newApiFamilyRequests: {
    envelope: vi.fn(),
  },
}))

const mockEnvelope = newApiFamilyRequests.envelope as unknown as Mock

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
    beforeEach(() => {
      mockEnvelope.mockReset()
    })

    it("propagates the popup source on a successful check-in", async () => {
      mockEnvelope.mockResolvedValueOnce({
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
      expect(mockEnvelope.mock.calls[0]?.[0]).toMatchObject({
        accountId: "test-id",
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        forceTempWindow: true,
        protectionBypassExecution,
      })
    })

    it("passes lightweight AnyRouter account context to the provider request", async () => {
      mockEnvelope.mockResolvedValueOnce({
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
        mockEnvelope.mock.calls[mockEnvelope.mock.calls.length - 1]?.[0]
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
      mockEnvelope.mockResolvedValueOnce({
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
      mockEnvelope.mockResolvedValueOnce({
        success: true,
        message: "",
      })

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "success",
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      })
    })

    it("does not treat an empty message as already checked", async () => {
      mockEnvelope.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: true,
        message: "",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("success")
    })

    it("returns already_checked when response is success and message indicates a prior check-in", async () => {
      mockEnvelope.mockResolvedValueOnce({
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
      mockEnvelope.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: false,
        message: "",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        reasonCode: "upstream_rejected",
        retryable: true,
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
      mockEnvelope.mockResolvedValueOnce(response)

      const result = await checkInForTest(mockAccount)

      expect(result.status).toBe("success")
      expect(result.rawMessage).toBe("queued")
    })

    it("does not infer already checked from a zero ret value", async () => {
      mockEnvelope.mockResolvedValueOnce({
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
      mockEnvelope.mockResolvedValueOnce({
        code: 1,
        ret: 0,
        success: false,
        message: "已签到",
      })

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("recognizes the msg field used by compatible deployments", async () => {
      mockEnvelope.mockResolvedValueOnce({
        ret: 0,
        msg: "already checked today",
      })

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "already_checked",
        rawMessage: "already checked today",
      })
    })

    it("returns failed when response indicates failure", async () => {
      const { newApiFamilyRequests } = await import(
        "~/services/apiService/newApiFamily/request"
      )
      const mockedFetchApi = vi.mocked(
        newApiFamilyRequests.envelope as unknown as (
          ...args: any[]
        ) => Promise<any>,
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
      mockEnvelope.mockRejectedValueOnce({
        statusCode: 404,
        message: "Not found",
      })

      const result = await checkInForTest(mockAccount)

      expect(result).toEqual({
        status: "failed",
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
        reasonCode: "no_provider",
        retryable: false,
      })
    })

    it("returns already_checked when request throws and error message indicates already checked", async () => {
      mockEnvelope.mockRejectedValueOnce(new Error("已签到"))

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("already_checked")
    })

    it("does not treat an empty thrown message as already checked", async () => {
      mockEnvelope.mockRejectedValueOnce(new Error(""))

      await expect(checkInForTest(mockAccount)).resolves.toMatchObject({
        status: "failed",
      })
    })

    it("handles errors gracefully", async () => {
      mockEnvelope.mockRejectedValueOnce(new Error("Network error"))

      const result = await checkInForTest(mockAccount)
      expect(result.status).toBe("failed")
    })

    it("returns uncertain when the response is lost after dispatch", async () => {
      const mutationLifecycle = createAutoCheckinMutationLifecycle()
      mockEnvelope.mockImplementationOnce(async (request: any) => {
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

    describe("a refused check-in POST", () => {
      // The real transport error for one refused POST, built by the same
      // compatibility layer the request module uses, so the wording, status, and
      // attribution below are the ones production sees.
      const transportFailure = (response: {
        ok: boolean
        status: number
        contentType: string
        body: unknown
      }) => {
        try {
          mapCompatibilityResponse(
            {
              ok: response.ok,
              status: response.status,
              headers: { "content-type": response.contentType },
              body: response.body,
            },
            {
              endpoint: "/api/user/sign_in",
              responseType: "json",
              onlyData: false,
              decodeApplicationError: false,
              errorResponseDecoder: decodeNewApiResponseError,
            },
          )
        } catch (error) {
          return error
        }
        throw new Error("expected the transport to reject this response")
      }

      const rejectDispatched = async (error: unknown) => {
        const mutationLifecycle = createAutoCheckinMutationLifecycle()
        mockEnvelope.mockImplementationOnce(async (request: any) => {
          request.observer?.onDispatch()
          throw error
        })

        return await checkInForTest(mockAccount, {
          ...DEFAULT_PROVIDER_CONTEXT,
          mutationLifecycle,
        })
      }

      it.each([
        {
          name: "an HTML interceptor page",
          response: {
            ok: false,
            status: 403,
            contentType: "text/html; charset=utf-8",
            body: "<html><body>403 Forbidden - permission denied</body></html>",
          },
          expectedReasonCode: "upstream_error",
        },
        {
          name: "a proxy JSON refusal",
          response: {
            ok: false,
            status: 403,
            contentType: "application/json",
            body: {
              error: "Forbidden",
              detail: "permission denied by proxy",
            },
          },
          expectedReasonCode: "upstream_error",
        },
      ])(
        "keeps $name eligible for a same-day retry",
        async ({ response, expectedReasonCode }) => {
          // Nothing in these bodies is the site's own answer, so neither may
          // decide a permission dead end. Content type does not separate them:
          // the proxy answered in JSON too.
          const result = await rejectDispatched(transportFailure(response))

          expect(result).toMatchObject({
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reasonCode: expectedReasonCode,
          })
          expect(
            canAutomaticallyRetryCheckinResult(
              result,
              AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
            ),
          ).toBe(true)
        },
      )

      it("treats the site's own envelope refusal as a dead end", async () => {
        const result = await rejectDispatched(
          transportFailure({
            ok: false,
            status: 403,
            contentType: "application/json",
            body: { success: false, message: "无权限", data: null },
          }),
        )

        expect(result).toMatchObject({
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
          rawMessage: "无权限",
        })
        expect(
          canAutomaticallyRetryCheckinResult(
            result,
            AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
          ),
        ).toBe(false)
      })

      it("names a JSON request that came back as a page", async () => {
        const result = await rejectDispatched(
          transportFailure({
            ok: true,
            status: 200,
            contentType: "text/html",
            body: "<html><body>Just a moment...</body></html>",
          }),
        )

        expect(result).toMatchObject({
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
          rawMessage: "messages:errors.api.nonJsonContent",
        })
        expect(
          canAutomaticallyRetryCheckinResult(
            result,
            AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn,
          ),
        ).toBe(true)
      })
    })
  })
})
