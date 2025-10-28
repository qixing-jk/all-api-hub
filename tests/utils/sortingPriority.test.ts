import { describe, expect, it } from "vitest"

import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import {
  createDisplaySiteData,
  createSiteAccount
} from "~/tests/fixtures/accounts"
import { SiteHealthStatus } from "~/types"
import {
  SortingCriteriaType,
  type SortingPriorityConfig
} from "~/types/sorting"
import {
  createDynamicSortComparator,
  DEFAULT_SORTING_PRIORITY_CONFIG
} from "~/utils/sortingPriority"

function buildConfig(
  criteria: SortingPriorityConfig["criteria"]
): SortingPriorityConfig {
  return {
    criteria,
    lastModified: Date.now()
  }
}

describe("createDynamicSortComparator", () => {
  it("prioritizes detected account when CURRENT_SITE is enabled", () => {
    const detected = createSiteAccount({ id: "detected" })
    const others = [
      createDisplaySiteData({ id: "alpha", name: "Alpha" }),
      createDisplaySiteData({ id: "detected", name: "Detected" })
    ]

    const comparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.CURRENT_SITE,
          enabled: true,
          priority: 0
        }
      ]),
      detected,
      "name",
      "USD",
      "asc"
    )

    const sorted = [...others].sort(comparator)
    expect(sorted[0]!.id).toBe("detected")
  })

  it("falls back to next enabled criteria when CURRENT_SITE is disabled", () => {
    const accounts = [
      createDisplaySiteData({
        id: "need",
        checkIn: { enableDetection: true, isCheckedInToday: false }
      }),
      createDisplaySiteData({
        id: "done",
        checkIn: { enableDetection: true, isCheckedInToday: true }
      })
    ]

    const comparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.CURRENT_SITE,
          enabled: false,
          priority: 0
        },
        {
          id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
          enabled: true,
          priority: 1
        }
      ]),
      null,
      "name",
      "USD",
      "asc"
    )

    const sorted = [...accounts].sort(comparator)
    expect(sorted.map((item) => item.id)).toEqual(["need", "done"])
  })

  it("orders health states by severity when HEALTH_STATUS is enabled", () => {
    const accounts = [
      createDisplaySiteData({
        id: "healthy",
        health: { status: SiteHealthStatus.Healthy }
      }),
      createDisplaySiteData({
        id: "warning",
        health: { status: SiteHealthStatus.Warning }
      }),
      createDisplaySiteData({
        id: "error",
        health: { status: SiteHealthStatus.Error }
      }),
      createDisplaySiteData({
        id: "unknown",
        health: { status: SiteHealthStatus.Unknown }
      })
    ]

    const comparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.HEALTH_STATUS,
          enabled: true,
          priority: 0
        }
      ]),
      null,
      "name",
      "USD",
      "asc"
    )

    const sorted = [...accounts].sort(comparator)
    expect(sorted.map((item) => item.id)).toEqual([
      "error",
      "warning",
      "unknown",
      "healthy"
    ])
  })

  it("keeps relative order for accounts needing the same check-in status", () => {
    const accounts = [
      createDisplaySiteData({
        id: "first",
        checkIn: { enableDetection: true, isCheckedInToday: false }
      }),
      createDisplaySiteData({
        id: "second",
        checkIn: { enableDetection: true, isCheckedInToday: false }
      }),
      createDisplaySiteData({
        id: "third",
        checkIn: { enableDetection: true, isCheckedInToday: true }
      })
    ]

    const comparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
          enabled: true,
          priority: 0
        }
      ]),
      null,
      "name",
      "USD",
      "asc"
    )

    const sorted = [...accounts].sort(comparator)
    expect(sorted.map((item) => item.id)).toEqual(["first", "second", "third"])
  })

  it("prioritizes accounts with custom check-in URLs", () => {
    const accounts = [
      createDisplaySiteData({
        id: "custom",
        checkIn: {
          customCheckInUrl: "https://checkin.com",
          enableDetection: true
        }
      }),
      createDisplaySiteData({ id: "standard" })
    ]

    const comparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
          enabled: true,
          priority: 0
        }
      ]),
      null,
      "name",
      "USD",
      "asc"
    )

    const sorted = [...accounts].sort(comparator)
    expect(sorted.map((item) => item.id)).toEqual(["custom", "standard"])
  })

  it("uses matched account scores when MATCHED_OPEN_TABS is enabled", () => {
    const accounts = [
      createDisplaySiteData({ id: "low" }),
      createDisplaySiteData({ id: "high" })
    ]

    const comparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.MATCHED_OPEN_TABS,
          enabled: true,
          priority: 0
        }
      ]),
      null,
      "name",
      "USD",
      "asc",
      {
        low: 1,
        high: 5
      }
    )

    const sorted = [...accounts].sort(comparator)
    expect(sorted.map((item) => item.id)).toEqual(["high", "low"])
  })

  it("sorts by user-selected field with correct order", () => {
    const accounts = [
      createDisplaySiteData({
        id: "A",
        name: "A",
        balance: { USD: 200, CNY: 1400 }
      }),
      createDisplaySiteData({
        id: "B",
        name: "B",
        balance: { USD: 100, CNY: 700 }
      })
    ]

    const comparatorAsc = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.USER_SORT_FIELD,
          enabled: true,
          priority: 0
        }
      ]),
      null,
      "name",
      "USD",
      "asc"
    )

    const comparatorDesc = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.USER_SORT_FIELD,
          enabled: true,
          priority: 0
        }
      ]),
      null,
      "name",
      "USD",
      "desc"
    )

    expect([...accounts].sort(comparatorAsc).map((item) => item.id)).toEqual([
      "A",
      "B"
    ])
    expect([...accounts].sort(comparatorDesc).map((item) => item.id)).toEqual([
      "B",
      "A"
    ])
  })

  it("supports numeric sorting for balance and consumption fields", () => {
    const accounts = [
      createDisplaySiteData({
        id: "high-balance",
        balance: { USD: 500, CNY: 3500 },
        todayConsumption: { USD: 20, CNY: 140 }
      }),
      createDisplaySiteData({
        id: "low-balance",
        balance: { USD: 300, CNY: 2100 },
        todayConsumption: { USD: 5, CNY: 35 }
      })
    ]

    const balanceComparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.USER_SORT_FIELD,
          enabled: true,
          priority: 0
        }
      ]),
      null,
      DATA_TYPE_BALANCE,
      "USD",
      "desc"
    )

    const consumptionComparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.USER_SORT_FIELD,
          enabled: true,
          priority: 0
        }
      ]),
      null,
      DATA_TYPE_CONSUMPTION,
      "CNY",
      "asc"
    )

    expect(
      [...accounts].sort(balanceComparator).map((item) => item.id)
    ).toEqual(["high-balance", "low-balance"])
    expect(
      [...accounts].sort(consumptionComparator).map((item) => item.id)
    ).toEqual(["low-balance", "high-balance"])
  })

  it("falls back to secondary criteria according to priority", () => {
    const accounts = [
      createDisplaySiteData({
        id: "checkin",
        health: { status: SiteHealthStatus.Healthy },
        checkIn: { enableDetection: true, isCheckedInToday: false }
      }),
      createDisplaySiteData({
        id: "health",
        health: { status: SiteHealthStatus.Error },
        checkIn: { enableDetection: true, isCheckedInToday: true }
      })
    ]

    const comparator = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
          enabled: true,
          priority: 0
        },
        {
          id: SortingCriteriaType.HEALTH_STATUS,
          enabled: true,
          priority: 1
        }
      ]),
      null,
      "name",
      "USD",
      "asc"
    )

    const sorted = [...accounts].sort(comparator)
    expect(sorted.map((item) => item.id)).toEqual(["checkin", "health"])
  })

  it("changes ordering when priorities swap", () => {
    const accounts = [
      createDisplaySiteData({
        id: "needs-checkin",
        health: { status: SiteHealthStatus.Healthy },
        checkIn: { enableDetection: true, isCheckedInToday: false }
      }),
      createDisplaySiteData({
        id: "unhealthy",
        health: { status: SiteHealthStatus.Error },
        checkIn: { enableDetection: true, isCheckedInToday: true }
      })
    ]

    const byHealthFirst = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.HEALTH_STATUS,
          enabled: true,
          priority: 0
        },
        {
          id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
          enabled: true,
          priority: 1
        }
      ]),
      null,
      "name",
      "USD",
      "asc"
    )

    const byCheckInFirst = createDynamicSortComparator(
      buildConfig([
        {
          id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
          enabled: true,
          priority: 0
        },
        {
          id: SortingCriteriaType.HEALTH_STATUS,
          enabled: true,
          priority: 1
        }
      ]),
      null,
      "name",
      "USD",
      "asc"
    )

    expect([...accounts].sort(byHealthFirst).map((item) => item.id)).toEqual([
      "unhealthy",
      "needs-checkin"
    ])
    expect([...accounts].sort(byCheckInFirst).map((item) => item.id)).toEqual([
      "needs-checkin",
      "unhealthy"
    ])
  })

  it("returns zero when all enabled criteria consider items equal", () => {
    const [first, second] = [
      createDisplaySiteData({
        id: "first",
        name: "Same",
        checkIn: { enableDetection: true, isCheckedInToday: true }
      }),
      createDisplaySiteData({
        id: "second",
        name: "Same",
        checkIn: { enableDetection: true, isCheckedInToday: true }
      })
    ]

    const comparator = createDynamicSortComparator(
      DEFAULT_SORTING_PRIORITY_CONFIG,
      null,
      "name",
      "USD",
      "asc"
    )

    expect(comparator(first, second)).toBe(0)
    expect(
      [first, second]
        .slice()
        .sort(comparator)
        .map((item) => item.id)
    ).toEqual(["first", "second"])
  })
})
