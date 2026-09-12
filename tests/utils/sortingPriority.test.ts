import { describe, expect, it } from "vitest"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_HEALTH_STATUS,
  DATA_TYPE_INCOME,
} from "~/constants"
import {
  createDynamicSortComparator,
  DEFAULT_SORTING_PRIORITY_CONFIG,
  getAccountSortGroup,
} from "~/services/preferences/utils/sortingPriority"
import { SiteHealthStatus } from "~/types"
import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

function config(
  criteria: SortingPriorityConfig["criteria"] = [],
): SortingPriorityConfig {
  return { criteria, lastModified: 1 }
}

describe("createDynamicSortComparator", () => {
  it("always groups pinned, normal, and disabled accounts in that order", () => {
    const accounts = [
      buildDisplaySiteData({
        id: "disabled-pinned",
        name: "A",
        disabled: true,
      }),
      buildDisplaySiteData({ id: "normal", name: "B" }),
      buildDisplaySiteData({ id: "pinned", name: "C" }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config(),
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "asc",
        {},
        ["pinned", "disabled-pinned"],
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual([
      "pinned",
      "normal",
      "disabled-pinned",
    ])
  })

  it("treats a disabled pinned account as disabled", () => {
    const pinnedIds = new Set(["account"])
    expect(
      getAccountSortGroup(
        buildDisplaySiteData({ id: "account", disabled: true }),
        pinnedIds,
      ),
    ).toBe("disabled")
  })

  it("applies the active user sort only inside each fixed group", () => {
    const accounts = [
      buildDisplaySiteData({ id: "normal-high", balance: { USD: 9, CNY: 9 } }),
      buildDisplaySiteData({ id: "pinned-low", balance: { USD: 1, CNY: 1 } }),
      buildDisplaySiteData({ id: "normal-low", balance: { USD: 2, CNY: 2 } }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        DEFAULT_SORTING_PRIORITY_CONFIG,
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "asc",
        {},
        ["pinned-low"],
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual([
      "pinned-low",
      "normal-low",
      "normal-high",
    ])
  })

  it("lets an active user sort outrank automatic and manual ordering", () => {
    const accounts = [
      buildDisplaySiteData({
        id: "manual-first",
        balance: { USD: 9, CNY: 9 },
        checkIn: buildCheckInConfig({
          customCheckIn: { url: "https://example.com/checkin" },
        }),
      }),
      buildDisplaySiteData({
        id: "balance-first",
        balance: { USD: 1, CNY: 1 },
      }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config([
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: true,
            priority: 0,
          },
        ]),
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "asc",
        {},
        [],
        { "manual-first": 0, "balance-first": 1 },
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual([
      "balance-first",
      "manual-first",
    ])
  })

  it("uses configurable automatic criteria when no user sort is active", () => {
    const accounts = [
      buildDisplaySiteData({ id: "alpha", name: "Alpha" }),
      buildDisplaySiteData({
        id: "zulu-checkin",
        name: "Zulu",
        checkIn: buildCheckInConfig({
          customCheckIn: { url: "https://example.com/checkin" },
        }),
      }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config([
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: true,
            priority: 0,
          },
        ]),
        null,
        null,
        "USD",
        "asc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["zulu-checkin", "alpha"])
  })

  it("respects automatic criterion order and disabled criteria", () => {
    const accounts = [
      buildDisplaySiteData({
        id: "healthy",
        health: { status: SiteHealthStatus.Healthy },
      }),
      buildDisplaySiteData({
        id: "error",
        health: { status: SiteHealthStatus.Error },
      }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config([
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: false,
            priority: 0,
          },
        ]),
        null,
        null,
        "USD",
        "asc",
        {},
        [],
        { healthy: 0, error: 1 },
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["healthy", "error"])
  })

  it("supports health status as an active user sort", () => {
    const accounts = [
      buildDisplaySiteData({
        id: "healthy",
        health: { status: SiteHealthStatus.Healthy },
      }),
      buildDisplaySiteData({
        id: "warning",
        health: { status: SiteHealthStatus.Warning },
      }),
      buildDisplaySiteData({
        id: "error",
        health: { status: SiteHealthStatus.Error },
      }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        DEFAULT_SORTING_PRIORITY_CONFIG,
        null,
        DATA_TYPE_HEALTH_STATUS,
        "USD",
        "asc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual([
      "error",
      "warning",
      "healthy",
    ])
  })

  it("ignores removed legacy criteria from persisted settings", () => {
    const accounts = [
      buildDisplaySiteData({ id: "beta", name: "Beta" }),
      buildDisplaySiteData({ id: "alpha", name: "Alpha" }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config([
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.MANUAL_ORDER,
            enabled: true,
            priority: 1,
          },
        ]),
        null,
        null,
        "USD",
        "desc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["alpha", "beta"])
  })

  it("supports check-in requirement as an active descending sort", () => {
    const accounts = [
      buildDisplaySiteData({
        id: "done",
        checkIn: buildCheckInConfig({
          customCheckIn: {
            url: "https://example.com/checkin",
            isCheckedInToday: true,
          },
        }),
      }),
      buildDisplaySiteData({
        id: "required",
        checkIn: buildCheckInConfig({
          customCheckIn: {
            url: "https://example.com/checkin",
            isCheckedInToday: false,
          },
        }),
      }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config(),
        null,
        DATA_TYPE_CHECK_IN_REQUIREMENT,
        "USD",
        "desc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["required", "done"])
  })

  it("sorts created time and uses account name as the stable final fallback", () => {
    const accounts = [
      buildDisplaySiteData({ id: "beta", name: "Beta", created_at: 1 }),
      buildDisplaySiteData({ id: "alpha", name: "Alpha", created_at: 1 }),
      buildDisplaySiteData({ id: "newest", name: "Newest", created_at: 2 }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        config(),
        null,
        DATA_TYPE_CREATED_AT,
        "USD",
        "desc",
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["newest", "alpha", "beta"])
  })

  it("keeps name ordering stable for records without a display name", () => {
    const accounts = [
      buildDisplaySiteData({ id: "beta", name: undefined as never }),
      buildDisplaySiteData({ id: "alpha", name: undefined as never }),
    ]

    accounts.sort(
      createDynamicSortComparator(config(), null, "name", "USD", "asc"),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["alpha", "beta"])
  })

  it("sorts today's consumption and income numerically", () => {
    const low = buildDisplaySiteData({
      id: "low",
      todayConsumption: { USD: 1, CNY: 1 },
      todayIncome: { USD: 1, CNY: 1 },
    })
    const high = buildDisplaySiteData({
      id: "high",
      todayConsumption: { USD: 9, CNY: 9 },
      todayIncome: { USD: 9, CNY: 9 },
    })

    expect(
      [high, low]
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_CONSUMPTION,
            "USD",
            "asc",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["low", "high"])
    expect(
      [low, high]
        .sort(
          createDynamicSortComparator(
            config(),
            null,
            DATA_TYPE_INCOME,
            "USD",
            "desc",
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["high", "low"])
  })

  it("uses manual order before the name fallback", () => {
    const accounts = [
      buildDisplaySiteData({ id: "alpha", name: "Alpha" }),
      buildDisplaySiteData({ id: "beta", name: "Beta" }),
    ]

    accounts.sort(
      createDynamicSortComparator(config(), null, null, "USD", "asc", {}, [], {
        beta: 0,
        alpha: 1,
      }),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["beta", "alpha"])
  })
})
