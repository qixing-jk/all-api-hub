import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  AUTO_CHECKIN_METHOD_IDS,
  CHECK_IN_METHOD_DETECTION_OUTCOMES,
  CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES,
  CHECK_IN_METHOD_STATUS_OUTCOMES,
  CHECK_IN_METHOD_TODAY_STATUSES,
  CHECK_IN_METHOD_UNKNOWN_REASON_CODES,
  CHECK_IN_PROVIDER_READINESS_REASONS,
} from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { SUB2API_REDEEM_CHECKIN_ERROR_REASONS } from "~/services/apiService/sub2api/type"
import { autoCheckinMethodRegistry } from "~/services/checkin/autoCheckin/providers"
import type { AutoCheckinProvider } from "~/services/checkin/autoCheckin/providers/contracts"
import { sub2ApiProvider } from "~/services/checkin/autoCheckin/providers/sub2api"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { SiteAccount } from "~/types"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { buildCheckInConfig } from "~~/tests/test-utils/factories"

// Contract pinned to jiangmuran/sub2api_pro@3f858570 and Wei-Shaw/sub2api#510.
// All hosts and credentials are placeholders. Transport-layer parsing is covered
// separately in tests/services/apiService/sub2api/redeemCheckIn.test.ts; these
// provider tests drive the safety chain (status-first, bounded reconciliation,
// error classification, persistence failure, identity-mismatch seam) by
// controlling the transport fakes and the auth-session persistence guard.

const {
  mockFetchStatus,
  mockSubmitCheckIn,
  mockGetReason,
  mockIsPersistenceError,
} = vi.hoisted(() => ({
  mockFetchStatus: vi.fn(),
  mockSubmitCheckIn: vi.fn(),
  mockGetReason: vi.fn(),
  mockIsPersistenceError: vi.fn(),
}))

vi.mock("~/services/apiService/sub2api/redeemCheckIn", () => ({
  fetchSub2ApiProCheckInStatus: mockFetchStatus,
  submitSub2ApiProCheckIn: mockSubmitCheckIn,
  getSub2ApiRedeemCheckInErrorReason: mockGetReason,
}))

vi.mock("~/services/apiService/sub2api", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/apiService/sub2api")>()
  return {
    ...actual,
    isSub2ApiAuthPersistenceError: mockIsPersistenceError,
  }
})

const account = {
  id: "account-1",
  site_type: SITE_TYPES.SUB2API,
  site_url: "https://sub2api.example.invalid",
  account_info: {
    id: "7",
    access_token: "placeholder-jwt",
  },
  checkIn: buildCheckInConfig({ automaticExecutionEnabled: true }),
} as unknown as SiteAccount

const DEFAULT_PROVIDER_CONTEXT = {
  tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Background,
  protectionBypassExecution: userCommandExecution(
    PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
  ),
} as const

const checkInForTest = (
  acct: Parameters<typeof sub2ApiProvider.checkIn>[0] = account,
  context: Parameters<
    typeof sub2ApiProvider.checkIn
  >[1] = DEFAULT_PROVIDER_CONTEXT,
) => sub2ApiProvider.checkIn(acct, context)

const validStatus = (
  overrides: Partial<{
    enabled: boolean
    checked_in_today: boolean
    reward_min: number
    reward_max: number
    reward_amount: number
  }> = {},
) => ({
  enabled: true,
  checked_in_today: false,
  reward_min: 1,
  reward_max: 5,
  ...overrides,
})

const validResult = () => ({
  message: "Checked in",
  reward_amount: 2,
  new_balance: 42,
  checked_in_at: "2026-01-01T00:00:00Z",
})

/** Stubs the POST-stage reason extractor to a controlled reason. */
const stubReason = (reason: string | undefined) => {
  mockGetReason.mockReturnValue(reason as never)
}

describe("sub2ApiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsPersistenceError.mockReturnValue(false)
    mockGetReason.mockReturnValue(undefined)
  })

  it("registers the Sub2API Pro auto-check-in provider", () => {
    expect(
      autoCheckinMethodRegistry.resolveById(
        AUTO_CHECKIN_METHOD_IDS.Sub2ApiProDailyCheckIn,
      )?.provider,
    ).toBe(sub2ApiProvider as AutoCheckinProvider)
  })

  describe("getReadiness", () => {
    it("is ready when the account has an access token", () => {
      expect(sub2ApiProvider.getReadiness(account)).toEqual({ ready: true })
    })

    it("is not ready when the access token is missing", () => {
      expect(
        sub2ApiProvider.getReadiness({
          ...account,
          account_info: { ...account.account_info, access_token: "" },
        } as SiteAccount),
      ).toEqual({
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.CredentialsMissing,
      })
    })

    it("is not ready for a non-Sub2API site type", () => {
      expect(
        sub2ApiProvider.getReadiness({
          ...account,
          site_type: SITE_TYPES.NEW_API,
        } as SiteAccount),
      ).toEqual({
        ready: false,
        reason: CHECK_IN_PROVIDER_READINESS_REASONS.AccountDataMissing,
      })
    })

    it("leaves automatic-execution intent to the Module", () => {
      // Readiness is orthogonal to execution intent; the Module gates execution.
      expect(
        sub2ApiProvider.getReadiness({
          ...account,
          checkIn: buildCheckInConfig({ automaticExecutionEnabled: false }),
        } as SiteAccount),
      ).toEqual({ ready: true })
    })
  })

  describe("detect", () => {
    it("returns matched with not-checked status from a successful GET", async () => {
      mockFetchStatus.mockResolvedValueOnce(
        validStatus({ checked_in_today: false }),
      )
      await expect(
        sub2ApiProvider.detect!({ account, observedAt: 230 }),
      ).resolves.toMatchObject({
        detection: {
          outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched,
          evidence: { source: CHECK_IN_METHOD_STATUS_EVIDENCE_SOURCES.Probe },
        },
        status: {
          outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
          today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
        },
      })
    })

    it("returns matched with checked status when already checked in today", async () => {
      mockFetchStatus.mockResolvedValueOnce(
        validStatus({ checked_in_today: true }),
      )
      await expect(
        sub2ApiProvider.detect!({ account, observedAt: 231 }),
      ).resolves.toMatchObject({
        detection: { outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Matched },
        status: { today: CHECK_IN_METHOD_TODAY_STATUSES.Checked },
      })
    })

    it("never sends POST during detection", async () => {
      mockFetchStatus.mockResolvedValueOnce(validStatus())
      await sub2ApiProvider.detect!({ account, observedAt: 232 })
      expect(mockSubmitCheckIn).not.toHaveBeenCalled()
    })

    it("maps a 404 to authoritative unsupported", async () => {
      const error = Object.assign(new Error("not found"), {
        statusCode: 404,
      })
      mockFetchStatus.mockRejectedValueOnce(error)
      await expect(
        sub2ApiProvider.detect!({ account, observedAt: 233 }),
      ).resolves.toMatchObject({
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
      })
    })

    it("maps a 405 to authoritative unsupported", async () => {
      const error = Object.assign(new Error("method not allowed"), {
        statusCode: 405,
      })
      mockFetchStatus.mockRejectedValueOnce(error)
      await expect(
        sub2ApiProvider.detect!({ account, observedAt: 234 }),
      ).resolves.toMatchObject({
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unsupported,
      })
    })

    it("does not map a 403 to unsupported (403 is a controlled unknown, not missing endpoint)", async () => {
      // 403 from the status endpoint means the endpoint exists but access is
      // denied; detection must not claim the method is unsupported.
      const error = Object.assign(new Error("forbidden"), {
        statusCode: 403,
      })
      mockFetchStatus.mockRejectedValueOnce(error)
      await expect(
        sub2ApiProvider.detect!({ account, observedAt: 235 }),
      ).resolves.toMatchObject({
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
        reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.PermissionDenied,
      })
    })

    it("maps an unparseable response to unknown with invalid_response", async () => {
      mockFetchStatus.mockRejectedValueOnce(new Error("parse fail"))
      await expect(
        sub2ApiProvider.detect!({ account, observedAt: 236 }),
      ).resolves.toMatchObject({
        outcome: CHECK_IN_METHOD_DETECTION_OUTCOMES.Unknown,
        reason: CHECK_IN_METHOD_UNKNOWN_REASON_CODES.InvalidResponse,
        attemptedAt: 236,
      })
    })

    it("propagates the abort signal to the status request", async () => {
      mockFetchStatus.mockImplementationOnce(
        (request: { abortSignal?: AbortSignal }) => {
          expect(request.abortSignal?.aborted).toBe(false)
          return new Promise<never>(() => undefined)
        },
      )
      const controller = new AbortController()
      sub2ApiProvider.detect!({
        account,
        observedAt: 237,
        signal: controller.signal,
      })
      await vi.waitFor(() => {
        expect(mockFetchStatus).toHaveBeenCalled()
      })
      controller.abort()
      expect(mockFetchStatus.mock.calls[0]?.[0].abortSignal).toBe(
        controller.signal,
      )
    })
  })

  describe("getStatus", () => {
    it("returns known/not_checked for a not-checked status", async () => {
      mockFetchStatus.mockResolvedValueOnce(
        validStatus({ checked_in_today: false }),
      )
      await expect(
        sub2ApiProvider.getStatus!({ account, observedAt: 300 }),
      ).resolves.toMatchObject({
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        today: CHECK_IN_METHOD_TODAY_STATUSES.NotChecked,
      })
    })

    it("returns known/checked for an already-checked status", async () => {
      mockFetchStatus.mockResolvedValueOnce(
        validStatus({ checked_in_today: true }),
      )
      await expect(
        sub2ApiProvider.getStatus!({ account, observedAt: 301 }),
      ).resolves.toMatchObject({
        outcome: CHECK_IN_METHOD_STATUS_OUTCOMES.Known,
        today: CHECK_IN_METHOD_TODAY_STATUSES.Checked,
      })
    })

    it("returns undefined when account is missing", async () => {
      await expect(
        sub2ApiProvider.getStatus!({ observedAt: 302 }),
      ).resolves.toBeUndefined()
    })
  })

  describe("checkIn", () => {
    it("returns success with result data on a valid POST", async () => {
      mockSubmitCheckIn.mockResolvedValueOnce(validResult())
      const result = await checkInForTest()
      expect(result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      })
      expect(result.data).toEqual(validResult())
      // No reconciliation GET needed on a clean success.
      expect(mockFetchStatus).not.toHaveBeenCalled()
    })

    it("classifies already-done as already_checked without repost or reconciliation", async () => {
      stubReason(SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinAlreadyDone)
      mockSubmitCheckIn.mockRejectedValueOnce(new Error("already done"))
      const result = await checkInForTest()
      expect(result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
        messageKey: "autoCheckin:providerFallback.alreadyCheckedToday",
      })
      expect(mockSubmitCheckIn).toHaveBeenCalledTimes(1)
      expect(mockFetchStatus).not.toHaveBeenCalled()
    })

    it("classifies disabled as skipped without reconciliation", async () => {
      stubReason(SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinDisabled)
      mockSubmitCheckIn.mockRejectedValueOnce(new Error("disabled"))
      const result = await checkInForTest()
      expect(result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
      expect(mockFetchStatus).not.toHaveBeenCalled()
    })

    it("classifies role-forbidden as skipped without reconciliation", async () => {
      stubReason(SUB2API_REDEEM_CHECKIN_ERROR_REASONS.DailyCheckinRoleForbidden)
      mockSubmitCheckIn.mockRejectedValueOnce(new Error("role forbidden"))
      const result = await checkInForTest()
      expect(result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.SKIPPED,
        messageKey: "autoCheckin:providerFallback.endpointNotSupported",
      })
      expect(mockFetchStatus).not.toHaveBeenCalled()
    })

    it("reconciles uncertain POST as success when status confirms checked", async () => {
      stubReason(undefined)
      mockSubmitCheckIn.mockRejectedValueOnce(new Error("timeout"))
      mockFetchStatus.mockResolvedValueOnce(
        validStatus({ checked_in_today: true }),
      )
      const result = await checkInForTest()
      expect(result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.SUCCESS,
        messageKey: "autoCheckin:providerFallback.checkinSuccessful",
      })
      // At most one POST, one bounded GET — no same-cycle repost.
      expect(mockSubmitCheckIn).toHaveBeenCalledTimes(1)
      expect(mockFetchStatus).toHaveBeenCalledTimes(1)
    })

    it("reconciles uncertain POST as failed when status confirms not-checked", async () => {
      stubReason(undefined)
      mockSubmitCheckIn.mockRejectedValueOnce(new Error("network"))
      mockFetchStatus.mockResolvedValueOnce(
        validStatus({ checked_in_today: false }),
      )
      const result = await checkInForTest()
      expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.checkinFailed",
      )
      // No same-cycle repost after not-checked reconciliation.
      expect(mockSubmitCheckIn).toHaveBeenCalledTimes(1)
      expect(mockFetchStatus).toHaveBeenCalledTimes(1)
    })

    it("reconciles uncertain POST as failed when reconciliation itself fails", async () => {
      stubReason(undefined)
      mockSubmitCheckIn.mockRejectedValueOnce(new Error("5xx"))
      mockFetchStatus.mockRejectedValueOnce(new Error("reconcile fail"))
      const result = await checkInForTest()
      expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
      // No ordinary retry for unresolved uncertain; unknownError fallback.
      expect(result.messageKey).toBe(
        "autoCheckin:providerFallback.unknownError",
      )
      expect(mockSubmitCheckIn).toHaveBeenCalledTimes(1)
    })

    it("does not treat unrecognized errors as already-checked or disabled", async () => {
      // A backend 500 with no pinned reason is uncertain, not already-done.
      stubReason(undefined)
      mockSubmitCheckIn.mockRejectedValueOnce(
        Object.assign(new Error("backend unavailable"), { statusCode: 500 }),
      )
      mockFetchStatus.mockResolvedValueOnce(
        validStatus({ checked_in_today: false }),
      )
      const result = await checkInForTest()
      expect(result.status).toBe(CHECKIN_RESULT_STATUS.FAILED)
      expect(mockFetchStatus).toHaveBeenCalledTimes(1)
    })

    it("stops at rotated-credential persistence failure before reaching the business handler", async () => {
      // The auth-session seam reports a persistence failure; execution must
      // stop without reconciliation so the next run re-attempts from GET.
      mockIsPersistenceError.mockReturnValue(true)
      stubReason(undefined)
      mockSubmitCheckIn.mockRejectedValueOnce(new Error("persistence failed"))
      const result = await checkInForTest()
      expect(result).toMatchObject({
        status: CHECKIN_RESULT_STATUS.FAILED,
        messageKey: "autoCheckin:providerFallback.checkinFailed",
      })
      expect(mockFetchStatus).not.toHaveBeenCalled()
      expect(mockSubmitCheckIn).toHaveBeenCalledTimes(1)
    })

    it("propagates temp-window source through the check-in request", async () => {
      mockSubmitCheckIn.mockResolvedValueOnce(validResult())
      await checkInForTest(account, {
        tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
        ),
      })
      expect(mockSubmitCheckIn).toHaveBeenCalledWith(
        expect.objectContaining({
          tempWindowRequestSource: TEMP_WINDOW_REQUEST_SOURCES.Popup,
        }),
      )
    })

    it("does not alias-fallback to /api/v1/check-in", async () => {
      // The provider only calls the pinned redeem endpoints. The transport
      // fakes record exactly which functions were invoked; no alias endpoint
      // is wired, so any fallback would surface as an unmocked call error.
      mockSubmitCheckIn.mockResolvedValueOnce(validResult())
      mockFetchStatus.mockResolvedValueOnce(validStatus())
      await checkInForTest()
      // Only submit (POST) was called; status (GET) is not invoked on success.
      expect(mockSubmitCheckIn).toHaveBeenCalledTimes(1)
      expect(mockFetchStatus).not.toHaveBeenCalled()
    })
  })
})
