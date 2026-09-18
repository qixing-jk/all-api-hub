import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_SKIP_CATEGORY,
  getAutoCheckinSkipCategory,
} from "~/features/AutoCheckin/utils/skipCategories"
import { AUTO_CHECKIN_SKIP_REASON } from "~/types/autoCheckin"

describe("auto check-in skip categories", () => {
  it("classifies every known skip reason into one semantic category", () => {
    const expectedCategories = {
      [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED]:
        AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
      [AUTO_CHECKIN_SKIP_REASON.AUTO_CHECKIN_DISABLED]:
        AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
      [AUTO_CHECKIN_SKIP_REASON.DETECTION_DISABLED]:
        AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
      [AUTO_CHECKIN_SKIP_REASON.METHOD_DISABLED]:
        AUTO_CHECKIN_SKIP_CATEGORY.DISABLED,
      [AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY]:
        AUTO_CHECKIN_SKIP_CATEGORY.EXPECTED,
      [AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER]:
        AUTO_CHECKIN_SKIP_CATEGORY.UNSUPPORTED,
      [AUTO_CHECKIN_SKIP_REASON.METHOD_UNSUPPORTED]:
        AUTO_CHECKIN_SKIP_CATEGORY.UNSUPPORTED,
      [AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR]:
        AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
      [AUTO_CHECKIN_SKIP_REASON.SOURCE_UNAVAILABLE]:
        AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
      [AUTO_CHECKIN_SKIP_REASON.STATUS_UNAVAILABLE]:
        AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
      [AUTO_CHECKIN_SKIP_REASON.TIMEOUT]: AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
      [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE]:
        AUTO_CHECKIN_SKIP_CATEGORY.WAITING,
      [AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DATA_MISSING]:
        AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
      [AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED]:
        AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
      [AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING]:
        AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
      [AUTO_CHECKIN_SKIP_REASON.METHOD_NOT_MATCHED]:
        AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
      [AUTO_CHECKIN_SKIP_REASON.METHOD_UNAVAILABLE]:
        AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
      [AUTO_CHECKIN_SKIP_REASON.NO_SELECTED_METHOD]:
        AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
      [AUTO_CHECKIN_SKIP_REASON.PERMISSION_DENIED]:
        AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
    } as const

    expect(Object.keys(expectedCategories).sort()).toEqual(
      Object.values(AUTO_CHECKIN_SKIP_REASON).sort(),
    )
    for (const [reason, category] of Object.entries(expectedCategories)) {
      expect(getAutoCheckinSkipCategory(reason)).toBe(category)
    }
  })

  it("treats missing or unknown reason codes as uncategorized", () => {
    expect(getAutoCheckinSkipCategory(undefined)).toBeNull()
    expect(getAutoCheckinSkipCategory(null)).toBeNull()
    expect(getAutoCheckinSkipCategory("")).toBeNull()
    expect(getAutoCheckinSkipCategory("legacy_reason_code")).toBeNull()
  })

  it("only marks user-fixable reasons as action required", () => {
    expect(
      getAutoCheckinSkipCategory(
        AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      ),
    ).toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getAutoCheckinSkipCategory(AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR),
    ).not.toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getAutoCheckinSkipCategory(AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER),
    ).not.toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getAutoCheckinSkipCategory(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED),
    ).not.toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getAutoCheckinSkipCategory(
        AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
      ),
    ).not.toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(getAutoCheckinSkipCategory(undefined)).not.toBe(
      AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
    )
  })
})
