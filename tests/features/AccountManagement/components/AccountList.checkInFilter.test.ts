import { describe, expect, it, vi } from "vitest"

import { AUTO_CHECKIN_METHOD_IDS } from "~/constants/checkIn"
import { SITE_TYPES } from "~/constants/siteType"
import { getAccountCheckInFilterValue } from "~/features/AccountManagement/components/AccountList/checkInFilter"
import type { CheckInConfig } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const todayMs = Date.UTC(2026, 0, 15, 12)
const yesterdayMs = Date.UTC(2026, 0, 14, 12)
const methodId = AUTO_CHECKIN_METHOD_IDS.NewApiDailyCheckIn

function buildCheckIn(input?: {
  checked?: boolean
  observedAt?: number
  customCheckIn?: CheckInConfig["customCheckIn"]
}): CheckInConfig {
  const hasStatus = typeof input?.checked === "boolean"
  return {
    automaticExecutionEnabled: true,
    methodKnowledge: {
      methods: {
        [methodId]: {
          detection: {
            outcome: "matched",
            evidence: { source: "compatibility_registration" },
          },
          ...(hasStatus
            ? {
                status: {
                  outcome: "known" as const,
                  today: input.checked
                    ? ("checked" as const)
                    : ("not_checked" as const),
                  evidence: {
                    source: "probe" as const,
                    observedAt: input.observedAt ?? todayMs,
                  },
                },
              }
            : {}),
        },
      },
    },
    selection: { mode: "automatic", methodId },
    ...(input?.customCheckIn ? { customCheckIn: input.customCheckIn } : {}),
  }
}

const unsupportedCheckIn = (
  customCheckIn?: CheckInConfig["customCheckIn"],
): CheckInConfig =>
  buildCheckInConfig({
    automaticExecutionEnabled: true,
    ...(customCheckIn ? { customCheckIn } : {}),
  })

describe("getAccountCheckInFilterValue", () => {
  it("classifies the selected method status into filter buckets", () => {
    vi.setSystemTime(todayMs)
    try {
      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: buildCheckIn({ checked: true }),
          }),
        ),
      ).toBe("checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: buildCheckIn({ checked: false }),
          }),
        ),
      ).toBe("not-checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: buildCheckIn({
              checked: true,
              observedAt: yesterdayMs,
            }),
          }),
        ),
      ).toBe("outdated")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: unsupportedCheckIn(),
          }),
        ),
      ).toBe("unsupported")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: buildCheckIn(),
          }),
        ),
      ).toBe("status-unavailable")
    } finally {
      vi.useRealTimers()
    }
  })

  it("combines the selected method projection with custom check-in state", () => {
    vi.setSystemTime(todayMs)
    try {
      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: buildCheckIn({
              checked: true,
              customCheckIn: {
                url: "https://example.invalid/checkin",
                isCheckedInToday: true,
              },
            }),
          }),
        ),
      ).toBe("checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: buildCheckIn({
              checked: true,
              customCheckIn: {
                url: "https://example.invalid/checkin",
                isCheckedInToday: false,
              },
            }),
          }),
        ),
      ).toBe("not-checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: unsupportedCheckIn({
              url: "https://example.invalid/checkin",
              isCheckedInToday: true,
            }),
          }),
        ),
      ).toBe("checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            siteType: SITE_TYPES.NEW_API,
            checkIn: unsupportedCheckIn({
              url: "   ",
              isCheckedInToday: true,
            }),
          }),
        ),
      ).toBe("unsupported")
    } finally {
      vi.useRealTimers()
    }
  })

  it("prioritizes an unavailable selected-method status over custom check-in state", () => {
    expect(
      getAccountCheckInFilterValue(
        buildDisplaySiteData({
          siteType: SITE_TYPES.NEW_API,
          checkIn: buildCheckIn({
            customCheckIn: {
              url: "https://example.invalid/checkin",
              isCheckedInToday: true,
            },
          }),
        }),
      ),
    ).toBe("status-unavailable")

    expect(
      getAccountCheckInFilterValue(
        buildDisplaySiteData({
          siteType: SITE_TYPES.NEW_API,
          checkIn: buildCheckIn({
            customCheckIn: {
              url: "https://example.invalid/checkin",
              isCheckedInToday: false,
            },
          }),
        }),
      ),
    ).toBe("status-unavailable")
  })
})
