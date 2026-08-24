import { describe, expect, it } from "vitest"

import { isRetryableCheckinResult } from "~/services/checkin/autoCheckin/resultPolicy"
import {
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"

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
