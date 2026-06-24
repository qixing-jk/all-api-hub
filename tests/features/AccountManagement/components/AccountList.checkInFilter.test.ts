import { describe, expect, it, vi } from "vitest"

import { getAccountCheckInFilterValue } from "~/features/AccountManagement/components/AccountList/checkInFilter"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const todayMs = Date.UTC(2026, 0, 15, 12)
const yesterdayMs = Date.UTC(2026, 0, 14, 12)

describe("getAccountCheckInFilterValue", () => {
  it("classifies site and custom check-in states into filter buckets", () => {
    vi.setSystemTime(todayMs)
    try {
      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: true,
              siteStatus: {
                isCheckedInToday: true,
                lastDetectedAt: todayMs,
              },
            },
          }),
        ),
      ).toBe("checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: true,
              siteStatus: {
                isCheckedInToday: false,
                lastDetectedAt: todayMs,
              },
            },
          }),
        ),
      ).toBe("not-checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: true,
              siteStatus: {
                isCheckedInToday: true,
                lastDetectedAt: yesterdayMs,
              },
            },
          }),
        ),
      ).toBe("outdated")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: false,
            },
          }),
        ),
      ).toBe("unsupported")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: true,
            },
          }),
        ),
      ).toBe("unsupported")
    } finally {
      vi.useRealTimers()
    }
  })

  it("combines site detection and custom check-in fallback state", () => {
    vi.setSystemTime(todayMs)
    try {
      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: true,
              siteStatus: {
                isCheckedInToday: true,
                lastDetectedAt: todayMs,
              },
              customCheckIn: {
                url: "https://example.invalid/checkin",
                isCheckedInToday: true,
              },
            },
          }),
        ),
      ).toBe("checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: true,
              siteStatus: {
                isCheckedInToday: true,
                lastDetectedAt: todayMs,
              },
              customCheckIn: {
                url: "https://example.invalid/checkin",
                isCheckedInToday: false,
              },
            },
          }),
        ),
      ).toBe("not-checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: false,
              customCheckIn: {
                url: "https://example.invalid/checkin",
                isCheckedInToday: true,
              },
            },
          }),
        ),
      ).toBe("checked-in")

      expect(
        getAccountCheckInFilterValue(
          buildDisplaySiteData({
            checkIn: {
              enableDetection: false,
              customCheckIn: {
                url: "   ",
                isCheckedInToday: true,
              },
            },
          }),
        ),
      ).toBe("unsupported")
    } finally {
      vi.useRealTimers()
    }
  })
})
