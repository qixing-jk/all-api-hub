import { describe, expect, it } from "vitest"

import {
  AUTO_CHECKIN_SKIP_CATEGORIES,
  AUTO_CHECKIN_SKIP_CATEGORY_REASONS,
} from "~/features/AutoCheckin/utils/skipCategories"
import {
  AUTO_CHECKIN_SKIP_CATEGORY,
  CHECKIN_SKIP_REASON_CATEGORIES,
  getCheckinSkipReasonCategory,
} from "~/services/checkin/autoCheckin/reasonCatalog"
import {
  AUTO_CHECKIN_SKIP_REASON,
  AUTO_CHECKIN_SKIP_REASONS,
} from "~/types/autoCheckin"

describe("auto check-in skip categories", () => {
  it("assigns exactly one category to every reason code", () => {
    expect(Object.keys(CHECKIN_SKIP_REASON_CATEGORIES).sort()).toEqual(
      [...AUTO_CHECKIN_SKIP_REASONS].sort(),
    )
  })

  it("treats a missing account or execution context as user work", () => {
    // Both used to be displayed as transient while the retry policy refused to
    // retry them: the account record or its credentials are gone, and the
    // platform failure already has a user-facing remedy. The user has to act,
    // so both dimensions now agree.
    expect(
      getCheckinSkipReasonCategory(
        AUTO_CHECKIN_SKIP_REASON.ACCOUNT_UNAVAILABLE,
      ),
    ).toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getCheckinSkipReasonCategory(
        AUTO_CHECKIN_SKIP_REASON.EXECUTION_CONTEXT_INVALID,
      ),
    ).toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
  })

  it("groups the shared reason vocabulary without losing entries", () => {
    expect(Object.keys(AUTO_CHECKIN_SKIP_CATEGORY_REASONS).sort()).toEqual(
      [...AUTO_CHECKIN_SKIP_CATEGORIES].sort(),
    )

    const grouped = AUTO_CHECKIN_SKIP_CATEGORIES.flatMap((category) =>
      AUTO_CHECKIN_SKIP_CATEGORY_REASONS[category].map((reason) => ({
        category,
        reason,
      })),
    )

    expect(grouped.map(({ reason }) => reason).sort()).toEqual(
      [...AUTO_CHECKIN_SKIP_REASONS].sort(),
    )
    for (const { category, reason } of grouped) {
      expect(getCheckinSkipReasonCategory(reason)).toBe(category)
    }
  })

  it("keeps account-disabled skips distinct from other disabled reasons", () => {
    expect(
      getCheckinSkipReasonCategory(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED),
    ).toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACCOUNT_DISABLED)
    expect(
      AUTO_CHECKIN_SKIP_CATEGORY_REASONS[
        AUTO_CHECKIN_SKIP_CATEGORY.ACCOUNT_DISABLED
      ],
    ).toEqual([AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED])
    expect(
      AUTO_CHECKIN_SKIP_CATEGORY_REASONS[AUTO_CHECKIN_SKIP_CATEGORY.DISABLED],
    ).not.toContain(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED)
  })

  it("treats missing or unknown reason codes as uncategorized", () => {
    expect(getCheckinSkipReasonCategory(undefined)).toBeNull()
    expect(getCheckinSkipReasonCategory(null)).toBeNull()
    expect(getCheckinSkipReasonCategory("")).toBeNull()
    expect(getCheckinSkipReasonCategory("legacy_reason_code")).toBeNull()
    expect(getCheckinSkipReasonCategory("constructor")).toBeNull()
    expect(getCheckinSkipReasonCategory("toString")).toBeNull()
  })

  it("only marks user-fixable reasons as action required", () => {
    expect(
      getCheckinSkipReasonCategory(
        AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED,
      ),
    ).toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getCheckinSkipReasonCategory(AUTO_CHECKIN_SKIP_REASON.NETWORK_ERROR),
    ).not.toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getCheckinSkipReasonCategory(AUTO_CHECKIN_SKIP_REASON.NO_PROVIDER),
    ).not.toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getCheckinSkipReasonCategory(AUTO_CHECKIN_SKIP_REASON.ACCOUNT_DISABLED),
    ).not.toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(
      getCheckinSkipReasonCategory(
        AUTO_CHECKIN_SKIP_REASON.ALREADY_CHECKED_TODAY,
      ),
    ).not.toBe(AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED)
    expect(getCheckinSkipReasonCategory(undefined)).not.toBe(
      AUTO_CHECKIN_SKIP_CATEGORY.ACTION_REQUIRED,
    )
  })
})
