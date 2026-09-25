import { describe, expect, it } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { NON_REPEAT_SAFE_CHECKIN_METHOD_IDS } from "~/services/checkin/autoCheckin/providers/registry"
import {
  canAutomaticallyRetryCheckinResult,
  isRetryableCheckinResult,
} from "~/services/checkin/autoCheckin/resultPolicy"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type AutoCheckinSkipReason,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import type { CheckInMethodId } from "~/types/checkIn"

describe("isRetryableCheckinResult", () => {
  it.each([
    {
      result: {
        accountId: "example-account",
        accountName: "Example Account",
        status: CHECKIN_RESULT_STATUS.FAILED,
        retryable: true,
        timestamp: 1,
      },
      expected: true,
    },
    {
      result: {
        accountId: "example-account",
        accountName: "Example Account",
        status: CHECKIN_RESULT_STATUS.FAILED,
        retryable: false,
        timestamp: 1,
      },
      expected: false,
    },
    {
      result: {
        accountId: "example-account",
        accountName: "Example Account",
        status: CHECKIN_RESULT_STATUS.FAILED,
        timestamp: 1,
      },
      expected: true,
    },
    {
      result: {
        accountId: "example-account",
        accountName: "Example Account",
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reconciliation: "unknown",
        timestamp: 1,
      },
      expected: false,
    },
    {
      result: {
        accountId: "example-account",
        accountName: "Example Account",
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
        reconciliation: "unknown",
        retryable: true,
        timestamp: 1,
      },
      expected: true,
    },
  ] satisfies Array<{
    result: CheckinAccountResult
    expected: boolean
  }>)(
    "classifies $result.status as retryable=$expected",
    ({ result, expected }) => {
      expect(isRetryableCheckinResult(result)).toBe(expected)
    },
  )
})

describe("canAutomaticallyRetryCheckinResult", () => {
  // The policy is "retry unless the result is an obvious dead end", so every
  // reason code carries its decision here instead of at the call sites.
  it.each([
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: undefined,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
      expected: true,
    },
    // Turnstile and a busy shared login are worth another unattended attempt.
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.SESSION_BUSY,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: undefined,
      expected: true,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_IN_USE,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.SUCCESS,
      reasonCode: undefined,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
      reasonCode: undefined,
      expected: false,
    },
    {
      status: CHECKIN_RESULT_STATUS.SKIPPED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
      expected: false,
    },
  ] satisfies Array<{
    status: CheckinAccountResult["status"]
    reasonCode: AutoCheckinSkipReason | undefined
    expected: boolean
  }>)(
    "classifies $status/$reasonCode as retryable=$expected",
    ({ status, reasonCode, expected }) => {
      expect(
        canAutomaticallyRetryCheckinResult({ status, reasonCode }, undefined),
      ).toBe(expected)
    },
  )

  it("does not let a provider opinion override the reason-code policy", () => {
    expect(
      canAutomaticallyRetryCheckinResult(
        {
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode: AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
          retryable: false,
        },
        undefined,
      ),
    ).toBe(true)
  })

  it("refuses every otherwise retryable result for a not-repeat-safe method", () => {
    // `NON_REPEAT_SAFE_CHECKIN_METHOD_IDS` is the operator escape valve for a
    // site observed applying one same-day check-in twice. This proves the valve
    // is honored before anyone needs it in an incident.
    const notRepeatSafe =
      NON_REPEAT_SAFE_CHECKIN_METHOD_IDS as Set<CheckInMethodId>
    const blockedMethodId = AUTO_CHECKIN_METHOD_IDS.AnyrouterDailyCheckIn
    notRepeatSafe.add(blockedMethodId)
    try {
      expect(
        canAutomaticallyRetryCheckinResult(
          {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
          },
          blockedMethodId,
        ),
      ).toBe(false)
      expect(
        canAutomaticallyRetryCheckinResult(
          {
            status: CHECKIN_RESULT_STATUS.UNCERTAIN,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
          },
          blockedMethodId,
        ),
      ).toBe(false)
      expect(
        canAutomaticallyRetryCheckinResult(
          {
            status: CHECKIN_RESULT_STATUS.FAILED,
            reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
          },
          AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn,
        ),
      ).toBe(true)
    } finally {
      notRepeatSafe.delete(blockedMethodId)
    }
  })

  it("ignores an unmatched or absent method id", () => {
    const result = {
      status: CHECKIN_RESULT_STATUS.FAILED,
      reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
    }
    expect(canAutomaticallyRetryCheckinResult(result, undefined)).toBe(true)
    expect(canAutomaticallyRetryCheckinResult(result, "not-a-method")).toBe(
      true,
    )
  })
})
