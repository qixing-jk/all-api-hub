import { describe, expect, it, vi } from "vitest"

import {
  countAutoCheckinResultReasonCategories,
  countAutoCheckinResultReasons,
  countAutoCheckinResults,
  countAutoCheckinResultsNeedingAttention,
  createNeedsAttentionResultFilter,
  EMPTY_AUTO_CHECKIN_RESULT_FILTER,
  filterAutoCheckinResults,
  getAutoCheckinResultMessage,
  isAutoCheckinResultNeedingAttention,
  isInvalidAccessTokenMessage,
  isNoTabWithIdMessage,
  resolveAutoCheckinReasonScope,
  resolveAutoCheckinTroubleshootingHintKey,
  translateAutoCheckinMessageKey,
  type AutoCheckinReasonFilterableStatus,
  type AutoCheckinResultFilter,
} from "~/features/AutoCheckin/utils/autoCheckin"
import {
  AUTO_CHECKIN_SKIP_CATEGORY,
  type AutoCheckinSkipCategory,
} from "~/features/AutoCheckin/utils/skipCategories"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
  type CheckinAccountResult,
  type CheckinResultStatus,
} from "~/types/autoCheckin"

describe("autoCheckin utils", () => {
  it("counts already-checked outcomes separately from successful check-ins", () => {
    expect(
      countAutoCheckinResults([
        {
          accountId: "success",
          accountName: "Success",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1,
        },
        {
          accountId: "already-checked",
          accountName: "Already checked",
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          timestamp: 2,
        },
        {
          accountId: "failed",
          accountName: "Failed",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 3,
        },
        {
          accountId: "skipped",
          accountName: "Skipped",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          timestamp: 4,
        },
        {
          accountId: "uncertain",
          accountName: "Uncertain",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reconciliation: "unknown",
          timestamp: 5,
        },
      ]),
    ).toEqual({
      total: 5,
      success: 1,
      alreadyChecked: 1,
      failed: 1,
      uncertain: 1,
      skipped: 1,
    })
  })

  it("filters already-checked outcomes independently", () => {
    const result = {
      accountId: "already-checked",
      accountName: "Already checked",
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      timestamp: 1,
    } satisfies CheckinAccountResult

    expect(
      filterAutoCheckinResults(
        [result],
        {
          statuses: [CHECKIN_RESULT_STATUS.ALREADY_CHECKED],
          reason: { appliesTo: [], categories: [], reasons: [] },
        },
        "",
        vi.fn() as any,
      ),
    ).toEqual([result])
    expect(
      filterAutoCheckinResults(
        [result],
        {
          statuses: [CHECKIN_RESULT_STATUS.SUCCESS],
          reason: { appliesTo: [], categories: [], reasons: [] },
        },
        "",
        vi.fn() as any,
      ),
    ).toEqual([])
  })

  describe("translateAutoCheckinMessageKey", () => {
    it.each([
      "autoCheckin:providerFallback.alreadyCheckedToday",
      "autoCheckin:providerFallback.checkinSuccessful",
      "autoCheckin:providerFallback.checkinFailed",
      "autoCheckin:providerFallback.endpointNotSupported",
      "autoCheckin:providerFallback.nativePageIdentityMismatch",
      "autoCheckin:providerFallback.nativePageIdentityMissing",
      "autoCheckin:providerFallback.nativePageStatusUnconfirmed",
      "autoCheckin:providerFallback.nativePageTargetNotFound",
      "autoCheckin:providerFallback.nativePageTriggerFailed",
      "autoCheckin:providerFallback.sessionBusy",
      "autoCheckin:providerFallback.unknownError",
      "autoCheckin:providerFallback.turnstileManualRequired",
      "autoCheckin:providerFallback.turnstileIncognitoAccessRequired",
      "autoCheckin:providerWong.checkinDisabled",
      "autoCheckin:skipReasons.account_data_missing",
      "autoCheckin:skipReasons.account_disabled",
      "autoCheckin:skipReasons.authentication_required",
      "autoCheckin:skipReasons.credentials_missing",
      "autoCheckin:skipReasons.checkin_page_unavailable",
      "autoCheckin:skipReasons.checkin_unconfirmed",
      "autoCheckin:skipReasons.detection_disabled",
      "autoCheckin:skipReasons.execution_context_invalid",
      "autoCheckin:skipReasons.manual_verification_required",
      "autoCheckin:skipReasons.method_disabled",
      "autoCheckin:skipReasons.method_not_matched",
      "autoCheckin:skipReasons.method_unavailable",
      "autoCheckin:skipReasons.method_unsupported",
      "autoCheckin:skipReasons.network_error",
      "autoCheckin:skipReasons.no_selected_method",
      "autoCheckin:skipReasons.permission_denied",
      "autoCheckin:skipReasons.session_busy",
      "autoCheckin:skipReasons.source_unavailable",
      "autoCheckin:skipReasons.timeout",
      "autoCheckin:skipReasons.upstream_error",
      "autoCheckin:skipReasons.auto_checkin_disabled",
      "autoCheckin:skipReasons.already_checked_today",
      "autoCheckin:skipReasons.status_unavailable",
      "autoCheckin:skipReasons.no_provider",
      "autoCheckin:skipReasons.account_unavailable",
    ])("translates the known key %s", (messageKey) => {
      const t = vi.fn(
        (key: string, params?: Record<string, unknown>) =>
          `${key}:${String(params?.count ?? "")}`,
      )

      const result = translateAutoCheckinMessageKey(t as any, messageKey, {
        count: 2,
      })

      expect(result).toBe(`${messageKey}:2`)
      expect(t).toHaveBeenCalledWith(messageKey, { count: 2 })
    })

    it("returns unknown backend messages unchanged", () => {
      const t = vi.fn()

      expect(
        translateAutoCheckinMessageKey(
          t as any,
          "backend failure: upstream temporarily unavailable",
        ),
      ).toBe("backend failure: upstream temporarily unavailable")
      expect(t).not.toHaveBeenCalled()
    })
  })

  it("prefers controlled result reasons over backend copy", () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(
      getAutoCheckinResultMessage(t as any, {
        accountId: "account-1",
        accountName: "Account",
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: "authentication_required",
        rawMessage: "deployment-controlled copy",
        timestamp: 1,
      }),
    ).toBe("translated:autoCheckin:skipReasons.authentication_required")
  })

  it("keeps provider copy when a reason-coded failure has its own message key", () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(
      getAutoCheckinResultMessage(t as any, {
        accountId: "account-1",
        accountName: "Account",
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode: "manual_verification_required",
        messageKey: "autoCheckin:providerFallback.turnstileManualRequired",
        timestamp: 1,
      }),
    ).toBe("translated:autoCheckin:providerFallback.turnstileManualRequired")
  })

  it("uses the localized unknown fallback when a result has no message", () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(
      getAutoCheckinResultMessage(t as any, {
        accountId: "account-1",
        accountName: "Account",
        status: CHECKIN_RESULT_STATUS.FAILED,
        timestamp: 1,
      }),
    ).toBe("translated:autoCheckin:providerFallback.unknownError")
  })

  it("uses a localized pending-confirmation message for uncertain results", () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(
      getAutoCheckinResultMessage(t as any, {
        accountId: "account-1",
        accountName: "Account",
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reconciliation: "unknown",
        timestamp: 1,
      }),
    ).toBe("translated:autoCheckin:providerFallback.resultPendingConfirmation")
  })

  describe("isInvalidAccessTokenMessage", () => {
    it("returns false for blank messages", () => {
      expect(isInvalidAccessTokenMessage("")).toBe(false)
    })

    it("detects the strict chinese invalid-token snippet", () => {
      expect(isInvalidAccessTokenMessage("Access Token 无效，请重新登录")).toBe(
        true,
      )
    })

    it("detects english invalid or expired access-token hints", () => {
      expect(
        isInvalidAccessTokenMessage(
          "Your access token is invalid for this API",
        ),
      ).toBe(true)
      expect(
        isInvalidAccessTokenMessage(
          "The ACCESS TOKEN has expired, please retry",
        ),
      ).toBe(true)
    })

    it("requires an invalidity hint when only the access-token keyword appears", () => {
      expect(
        isInvalidAccessTokenMessage("access token accepted but quota exceeded"),
      ).toBe(false)
    })
  })

  describe("filterAutoCheckinResults", () => {
    const buildFilter = (
      statuses: CheckinResultStatus[],
      categories: AutoCheckinSkipCategory[] = [],
      reasons: AutoCheckinSkipReason[] = [],
      appliesTo: AutoCheckinReasonFilterableStatus[] = resolveAutoCheckinReasonScope(
        statuses,
      ),
    ): AutoCheckinResultFilter => ({
      statuses,
      reason: { appliesTo, categories, reasons },
    })

    it("matches trimmed keywords against the localized result message", () => {
      const t = vi.fn((key: string) =>
        key === "autoCheckin:skipReasons.status_unavailable"
          ? "暂时无法确认当前签到状态"
          : key,
      )

      expect(
        filterAutoCheckinResults(
          [
            {
              accountId: "account-1",
              accountName: "Example Account",
              status: CHECKIN_RESULT_STATUS.SKIPPED,
              reasonCode: "status_unavailable",
              timestamp: 1,
            },
          ],
          buildFilter([CHECKIN_RESULT_STATUS.SKIPPED]),
          "  无法确认  ",
          t as any,
        ),
      ).toHaveLength(1)
    })

    it("keeps only results that actually need attention in the preset", () => {
      const results: CheckinAccountResult[] = [
        {
          accountId: "failed",
          accountName: "Failed",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 3,
        },
        {
          accountId: "failed-network",
          accountName: "Failed network",
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
          timestamp: 3,
        },
        {
          accountId: "skipped-action",
          accountName: "Skipped action",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
          timestamp: 2,
        },
        {
          accountId: "skipped-waiting",
          accountName: "Skipped waiting",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
          timestamp: 2,
        },
        {
          accountId: "skipped-disabled",
          accountName: "Skipped disabled",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
          timestamp: 2,
        },
        {
          accountId: "skipped-unsupported",
          accountName: "Skipped unsupported",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
          timestamp: 2,
        },
        {
          accountId: "skipped-routine",
          accountName: "Skipped routine",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
          timestamp: 2,
        },
        {
          accountId: "skipped-legacy",
          accountName: "Skipped legacy",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          timestamp: 2,
        },
        {
          accountId: "success",
          accountName: "Success",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1,
        },
        {
          accountId: "uncertain",
          accountName: "Uncertain",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reconciliation: "unknown",
          timestamp: 4,
        },
      ]

      expect(
        filterAutoCheckinResults(
          results,
          createNeedsAttentionResultFilter(),
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["failed", "failed-network", "skipped-action", "uncertain"])

      expect(
        results
          .filter((result) => isAutoCheckinResultNeedingAttention(result))
          .map((result) => result.accountId),
      ).toEqual(["failed", "failed-network", "skipped-action", "uncertain"])
      expect(countAutoCheckinResultsNeedingAttention(results)).toBe(4)

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter([CHECKIN_RESULT_STATUS.FAILED]),
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["failed", "failed-network"])

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter([CHECKIN_RESULT_STATUS.UNCERTAIN]),
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["uncertain"])
    })

    it("narrows skipped results by their semantic reason category", () => {
      const results: CheckinAccountResult[] = [
        {
          accountId: "skipped-action",
          accountName: "Skipped action",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
          timestamp: 2,
        },
        {
          accountId: "skipped-waiting",
          accountName: "Skipped waiting",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
          timestamp: 2,
        },
        {
          accountId: "skipped-routine",
          accountName: "Skipped routine",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
          timestamp: 2,
        },
        {
          accountId: "failed",
          accountName: "Failed",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 3,
        },
      ]

      expect(countAutoCheckinResultReasonCategories(results)).toEqual({
        [AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED]: 1,
        [AUTO_CHECKIN_SKIP_CATEGORY.WAITING]: 1,
        [AUTO_CHECKIN_SKIP_CATEGORY.ACCOUNT_DISABLED]: 0,
        [AUTO_CHECKIN_SKIP_CATEGORY.DISABLED]: 0,
        [AUTO_CHECKIN_SKIP_CATEGORY.UNSUPPORTED]: 0,
        [AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED]: 1,
        [AUTO_CHECKIN_SKIP_CATEGORY.UNCLASSIFIED]: 1,
      })

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.SKIPPED],
            [AUTO_CHECKIN_SKIP_CATEGORY.WAITING],
          ),
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["skipped-waiting"])

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.SKIPPED],
            [
              AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
              AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED,
            ],
          ),
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["skipped-waiting", "skipped-routine"])

      // The selection narrows every status in its scope: the unclassified
      // failure drops out, while a status outside the scope stays untouched.
      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.SKIPPED, CHECKIN_RESULT_STATUS.FAILED],
            [AUTO_CHECKIN_SKIP_CATEGORY.WAITING],
          ),
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["skipped-waiting"])

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.SKIPPED, CHECKIN_RESULT_STATUS.FAILED],
            [AUTO_CHECKIN_SKIP_CATEGORY.WAITING],
            [],
            [CHECKIN_RESULT_STATUS.SKIPPED],
          ),
          "",
          vi.fn((key: string) => key) as any,
        ).map((result) => result.accountId),
      ).toEqual(["skipped-waiting", "failed"])
    })

    it("resolves the reason scope from the selected statuses", () => {
      expect(resolveAutoCheckinReasonScope([])).toEqual([
        CHECKIN_RESULT_STATUS.SKIPPED,
        CHECKIN_RESULT_STATUS.FAILED,
        CHECKIN_RESULT_STATUS.UNCERTAIN,
      ])
      expect(
        resolveAutoCheckinReasonScope([CHECKIN_RESULT_STATUS.SUCCESS]),
      ).toEqual([])
      expect(
        resolveAutoCheckinReasonScope([
          CHECKIN_RESULT_STATUS.FAILED,
          CHECKIN_RESULT_STATUS.SUCCESS,
        ]),
      ).toEqual([CHECKIN_RESULT_STATUS.FAILED])
    })

    it("narrows failed and uncertain results by their own reasons", () => {
      const results: CheckinAccountResult[] = [
        {
          accountId: "failed-network",
          accountName: "Failed network",
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
          timestamp: 5,
        },
        {
          accountId: "failed-auth",
          accountName: "Failed auth",
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
          timestamp: 4,
        },
        {
          accountId: "failed-unclassified",
          accountName: "Failed unclassified",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 3,
        },
        {
          accountId: "uncertain-timeout",
          accountName: "Uncertain timeout",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reconciliation: "unknown",
          reasonCode: AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
          timestamp: 2,
        },
        {
          accountId: "skipped-network",
          accountName: "Skipped network",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
          timestamp: 1,
        },
      ]
      const noop = vi.fn((key: string) => key) as any

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.FAILED],
            [AUTO_CHECKIN_SKIP_CATEGORY.WAITING],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["failed-network"])

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.FAILED, CHECKIN_RESULT_STATUS.UNCERTAIN],
            [],
            [
              AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
              AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
            ],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["failed-network", "uncertain-timeout"])

      // Reasonless failures stay reachable instead of vanishing from the
      // reason dimension.
      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.FAILED],
            [AUTO_CHECKIN_SKIP_CATEGORY.UNCLASSIFIED],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["failed-unclassified"])

      // Statuses outside the scope keep their own status bucketing, while
      // unclassified rows of a narrowed status drop out.
      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.FAILED, CHECKIN_RESULT_STATUS.SKIPPED],
            [AUTO_CHECKIN_SKIP_CATEGORY.WAITING],
            [],
            [CHECKIN_RESULT_STATUS.FAILED],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["failed-network", "skipped-network"])
    })

    it("derives reasons only from the persisted reason code", () => {
      const results: CheckinAccountResult[] = [
        {
          accountId: "failed-manual-verification",
          accountName: "Failed manual verification",
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
          timestamp: 3,
        },
        {
          accountId: "failed-upstream",
          accountName: "Failed upstream",
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
          timestamp: 2,
        },
        {
          accountId: "failed-unknown",
          accountName: "Failed unknown",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 1,
        },
      ]
      const noop = vi.fn((key: string) => key) as any

      expect(countAutoCheckinResultReasons(results)).toMatchObject({
        [AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED]: 1,
        [AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR]: 1,
      })
      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.FAILED],
            [],
            [AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["failed-manual-verification"])
      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.FAILED],
            [AUTO_CHECKIN_SKIP_CATEGORY.WAITING],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["failed-upstream"])
      // Rows without a persisted reason stay unclassified.
      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.FAILED],
            [AUTO_CHECKIN_SKIP_CATEGORY.UNCLASSIFIED],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["failed-unknown"])
    })

    it("keeps legacy skips routine while reasonless failures stay unclassified", () => {
      const counts = countAutoCheckinResultReasonCategories([
        {
          accountId: "skipped-legacy",
          accountName: "Skipped legacy",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          timestamp: 3,
        },
        {
          accountId: "failed-unknown",
          accountName: "Failed unknown",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 2,
        },
        {
          accountId: "uncertain-unknown",
          accountName: "Uncertain unknown",
          status: CHECKIN_RESULT_STATUS.UNCERTAIN,
          reconciliation: "unknown",
          timestamp: 1,
        },
        {
          accountId: "success",
          accountName: "Success",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 0,
        },
      ])

      expect(counts[AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED]).toBe(1)
      expect(counts[AUTO_CHECKIN_SKIP_CATEGORY.UNCLASSIFIED]).toBe(2)
      // Statuses without a reason vocabulary never join the reason dimension.
      expect(
        Object.values(counts).reduce((total, count) => total + count, 0),
      ).toBe(3)
    })

    it("narrows skipped results by their precise skip reason", () => {
      const results: CheckinAccountResult[] = [
        {
          accountId: "skipped-credentials-a",
          accountName: "Credentials A",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
          timestamp: 4,
        },
        {
          accountId: "skipped-credentials-b",
          accountName: "Credentials B",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
          timestamp: 3,
        },
        {
          accountId: "skipped-method",
          accountName: "Method",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED,
          timestamp: 2,
        },
        {
          accountId: "skipped-timeout",
          accountName: "Timeout",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
          timestamp: 2,
        },
        {
          accountId: "skipped-legacy",
          accountName: "Legacy",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          timestamp: 2,
        },
        {
          accountId: "failed-timeout",
          accountName: "Failed timeout",
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
          timestamp: 1,
        },
      ]
      const noop = vi.fn((key: string) => key) as any

      expect(countAutoCheckinResultReasons(results)).toEqual({
        [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED]: 0,
        [AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED]: 0,
        [AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED]: 0,
        [AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED]: 0,
        [AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY]: 0,
        [AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE]: 0,
        [AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER]: 0,
        [AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD]: 0,
        [AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE]: 0,
        [AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED]: 1,
        [AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED]: 0,
        [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING]: 0,
        [AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED]: 0,
        [AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING]: 2,
        [AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED]: 0,
        [AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID]: 0,
        [AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED]: 0,
        [AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE]: 0,
        [AUTO_CHECKIN_SKIP_REASON.SESSION_BUSY]: 0,
        [AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR]: 0,
        [AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR]: 0,
        [AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE]: 0,
        [AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED]: 0,
        // The failed row carries the same persisted reason vocabulary.
        [AUTO_CHECKIN_SKIP_REASON.TIMEOUT]: 2,
        [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE]: 0,
      })

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.SKIPPED],
            [],
            [AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["skipped-credentials-a", "skipped-credentials-b"])

      // Sub-types and their parent category combine as one reason selection.
      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.SKIPPED],
            [AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED],
            [AUTO_CHECKIN_SKIP_REASON.TIMEOUT],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual([
        "skipped-credentials-a",
        "skipped-credentials-b",
        "skipped-method",
        "skipped-timeout",
      ])

      // The failure shares the scope, so its own reason decides membership;
      // unclassified skips keep the routine fallback.
      expect(
        filterAutoCheckinResults(
          results,
          buildFilter(
            [CHECKIN_RESULT_STATUS.SKIPPED, CHECKIN_RESULT_STATUS.FAILED],
            [],
            [AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING],
          ),
          "",
          noop,
        ).map((result) => result.accountId),
      ).toEqual(["skipped-credentials-a", "skipped-credentials-b"])
    })

    it("combines selected result statuses while an empty selection shows all", () => {
      const results: CheckinAccountResult[] = [
        {
          accountId: "success",
          accountName: "Success",
          status: CHECKIN_RESULT_STATUS.SUCCESS,
          timestamp: 1,
        },
        {
          accountId: "already-checked",
          accountName: "Already checked",
          status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          timestamp: 2,
        },
        {
          accountId: "failed",
          accountName: "Failed",
          status: CHECKIN_RESULT_STATUS.FAILED,
          timestamp: 3,
        },
      ]

      expect(
        filterAutoCheckinResults(
          results,
          buildFilter([
            CHECKIN_RESULT_STATUS.SUCCESS,
            CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
          ]),
          "",
          vi.fn() as any,
        ).map((result) => result.accountId),
      ).toEqual(["success", "already-checked"])
      expect(
        filterAutoCheckinResults(
          results,
          EMPTY_AUTO_CHECKIN_RESULT_FILTER,
          "",
          vi.fn() as any,
        ),
      ).toEqual(results)
    })
    it("ignores persisted reason codes this build does not know", () => {
      const results: CheckinAccountResult[] = [
        {
          accountId: "legacy",
          accountName: "Legacy",
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          reasonCode: "legacy:unknown-reason" as AutoCheckinSkipReason,
          timestamp: 1,
        },
      ]

      const counts = countAutoCheckinResultReasons(results)

      expect(Object.hasOwn(counts, "legacy:unknown-reason")).toBe(false)
      expect(Object.values(counts).every(Number.isFinite)).toBe(true)
    })
  })

  describe("isNoTabWithIdMessage", () => {
    it("returns false for blank messages", () => {
      expect(isNoTabWithIdMessage("")).toBe(false)
    })

    it.each([
      "No tab with id: 123",
      "no tab with id 42",
      "RuntimeError: No Tab With Id: 7",
    ])("detects the known closed-tab error shape: %s", (message) => {
      expect(isNoTabWithIdMessage(message)).toBe(true)
    })

    it("does not match unrelated tab errors", () => {
      expect(isNoTabWithIdMessage("tab closed unexpectedly")).toBe(false)
      expect(isNoTabWithIdMessage("no window with id: 3")).toBe(false)
    })
  })

  describe("resolveAutoCheckinTroubleshootingHintKey", () => {
    it("returns the site-type hint for skipped no-provider results", () => {
      expect(
        resolveAutoCheckinTroubleshootingHintKey({
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          messageKey: "autoCheckin:skipReasons.no_provider",
          message: "账号所属站点类型暂不支持签到",
        }),
      ).toBe("execution.hints.siteTypeCheckinUnsupported")
    })

    it("returns the site-type hint for unsupported endpoint failures", () => {
      expect(
        resolveAutoCheckinTroubleshootingHintKey({
          status: CHECKIN_RESULT_STATUS.FAILED,
          messageKey: "autoCheckin:providerFallback.endpointNotSupported",
          message: "不支持该签到接口",
        }),
      ).toBe("execution.hints.siteTypeCheckinUnsupported")
    })

    it("still matches access-token hints for failed raw messages", () => {
      expect(
        resolveAutoCheckinTroubleshootingHintKey({
          status: CHECKIN_RESULT_STATUS.FAILED,
          message: "access token invalid",
        }),
      ).toBe("execution.hints.invalidAccessToken")
    })

    it.each([
      "Turnstile token not available",
      "Cloudflare Turnstile token is not available yet",
      "PoW challenge and nonce are required",
      "POW verification failed: challenge and nonce missing",
      "Turnstile校验失败，请刷新重试!",
      "Turnstile 验证失败，请刷新重试",
      "请打开网站后再签到",
      "请先打开站点完成验证后再签到",
    ])(
      "returns the manual verification hint for protected check-in failures: %s",
      (message) => {
        expect(
          resolveAutoCheckinTroubleshootingHintKey({
            status: CHECKIN_RESULT_STATUS.FAILED,
            message,
          }),
        ).toBe("execution.hints.manualVerificationRequired")
      },
    )

    it.each([
      "Turnstile configuration was rejected by the backend",
      "PoW verification failed",
      "请打开网站查看公告",
      "请稍后再签到",
    ])(
      "does not overmatch unrelated protected-flow messages: %s",
      (message) => {
        expect(
          resolveAutoCheckinTroubleshootingHintKey({
            status: CHECKIN_RESULT_STATUS.FAILED,
            message,
          }),
        ).toBeNull()
      },
    )

    it("does not return a raw-message hint for skipped rows without a known message key", () => {
      expect(
        resolveAutoCheckinTroubleshootingHintKey({
          status: CHECKIN_RESULT_STATUS.SKIPPED,
          message: "签到跳过",
        }),
      ).toBeNull()
    })
  })
})
