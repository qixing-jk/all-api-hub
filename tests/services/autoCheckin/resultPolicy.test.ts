import { describe, expect, it } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { NON_REPEAT_SAFE_CHECKIN_METHOD_IDS } from "~/services/checkin/autoCheckin/providers/registry"
import {
  AUTO_CHECKIN_SKIP_CATEGORY,
  CHECKIN_SKIP_REASON_CATEGORIES,
} from "~/services/checkin/autoCheckin/reasonCatalog"
import {
  canAutomaticallyRetryCheckinResult,
  isRetryableCheckinResult,
} from "~/services/checkin/autoCheckin/resultPolicy"
import {
  AUTO_CHECKIN_SKIP_REASON,
  AUTO_CHECKIN_SKIP_REASONS,
  CHECKIN_RESULT_STATUS,
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
  it("retries exactly the reasons the product tells the user to wait on", () => {
    // The decision is a projection of the semantic category, so the two cannot
    // drift: this holds for every reason code, including ones added later.
    for (const reasonCode of AUTO_CHECKIN_SKIP_REASONS) {
      expect(
        canAutomaticallyRetryCheckinResult({
          status: CHECKIN_RESULT_STATUS.FAILED,
          reasonCode,
        }),
      ).toBe(
        CHECKIN_SKIP_REASON_CATEGORIES[reasonCode] ===
          AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
      )
    }
  })

  it.each([
    // A person has to complete a sign-in or a verification before any run can
    // succeed, so the queue must not spend the day's attempts on them.
    AUTO_CHECKIN_SKIP_REASON.MANUAL_VERIFICATION_REQUIRED,
    AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
    AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_REQUIRED,
    AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_IN_USE,
    // Missing account data is user work too.
    AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
    AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID,
    AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING,
    AUTO_CHECKIN_SKIP_REASON.ACCOUNT_STATE_WRITE_FAILED,
  ])("refuses to retry %s", (reasonCode) => {
    expect(
      canAutomaticallyRetryCheckinResult({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode,
      }),
    ).toBe(false)
  })

  it.each([
    AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
    AUTO_CHECKIN_SKIP_REASON.TIMEOUT,
    AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE,
    AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE,
    AUTO_CHECKIN_SKIP_REASON.UPSTREAM_ERROR,
    AUTO_CHECKIN_SKIP_REASON.UPSTREAM_REJECTED,
    AUTO_CHECKIN_SKIP_REASON.SESSION_BUSY,
    AUTO_CHECKIN_SKIP_REASON.CHECKIN_PAGE_UNAVAILABLE,
    AUTO_CHECKIN_SKIP_REASON.CHECKIN_UNCONFIRMED,
  ])("retries %s later the same day", (reasonCode) => {
    expect(
      canAutomaticallyRetryCheckinResult({
        status: CHECKIN_RESULT_STATUS.FAILED,
        reasonCode,
      }),
    ).toBe(true)
  })

  it.each([
    CHECKIN_RESULT_STATUS.SUCCESS,
    CHECKIN_RESULT_STATUS.ALREADY_CHECKED,
    CHECKIN_RESULT_STATUS.SKIPPED,
  ])("never retries a %s result", (status) => {
    expect(
      canAutomaticallyRetryCheckinResult({
        status,
        reasonCode: AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR,
      }),
    ).toBe(false)
  })

  it("retries a result stored before reason codes were mandatory", () => {
    // Its cause is unknown, and an upgrade must not silently retire a pending
    // retry. New failures always carry a code, so this only covers stored data.
    expect(
      canAutomaticallyRetryCheckinResult({
        status: CHECKIN_RESULT_STATUS.FAILED,
      }),
    ).toBe(true)
    expect(
      canAutomaticallyRetryCheckinResult({
        status: CHECKIN_RESULT_STATUS.UNCERTAIN,
      }),
    ).toBe(true)
  })

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
