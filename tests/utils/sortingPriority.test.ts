import { describe, expect, it } from "vitest"

import {
  DATA_TYPE_BALANCE,
  DATA_TYPE_CHECK_IN_REQUIREMENT,
  DATA_TYPE_CONSUMPTION,
  DATA_TYPE_CREATED_AT,
  DATA_TYPE_HEALTH_STATUS,
  DATA_TYPE_INCOME,
  DATA_TYPE_NAME,
} from "~/constants"
import {
  createAccountContextBoostResolver,
  createDynamicSortComparator,
  DEFAULT_SORTING_PRIORITY_CONFIG,
  getAccountSortGroup,
  OPEN_TAB_MATCH_TIER,
} from "~/services/preferences/utils/sortingPriority"
import { SiteHealthStatus, type SortOrder } from "~/types"
import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

function config(
  criteria: SortingPriorityConfig["criteria"] = [],
): SortingPriorityConfig {
  return { criteria, lastModified: 1 }
}

describe("createDynamicSortComparator", () => {
  it("groups pinned, normal, and disabled accounts when no context boost applies", () => {
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

  it("lets an active user sort outrank removed link criteria and manual ordering", () => {
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

  it("ignores removed link priorities when user sorting is cleared", () => {
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

    expect(accounts.map(({ id }) => id)).toEqual(["alpha", "zulu-checkin"])
  })

  it("keeps manual order when user sorting is cleared and a legacy link criterion is disabled", () => {
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

  it.each(["custom_check_in_url", "custom_redeem_url"] as const)(
    "sorts %s by link presence in either direction and uses manual order for ties",
    (field) => {
      const key = field === "custom_check_in_url" ? "url" : "redeemUrl"
      const accounts = [
        buildDisplaySiteData({ id: "absent", name: "A" }),
        buildDisplaySiteData({
          id: "blank",
          name: "B",
          checkIn: buildCheckInConfig({ customCheckIn: { [key]: "  " } }),
        }),
        buildDisplaySiteData({
          id: "linked",
          name: "Z",
          checkIn: buildCheckInConfig({
            customCheckIn: { [key]: "https://example.com" },
          }),
        }),
        buildDisplaySiteData({
          id: "linked-first",
          name: "Y",
          checkIn: buildCheckInConfig({
            customCheckIn: { [key]: "https://other.example.com" },
          }),
        }),
      ]
      const compare = (order: SortOrder) =>
        createDynamicSortComparator(
          config(),
          null,
          field,
          "USD",
          order,
          {},
          [],
          { "linked-first": 0, linked: 1, absent: 2, blank: 3 },
        )
      expect([...accounts].sort(compare("desc")).map(({ id }) => id)).toEqual([
        "linked-first",
        "linked",
        "absent",
        "blank",
      ])
      expect([...accounts].sort(compare("asc")).map(({ id }) => id)).toEqual([
        "absent",
        "blank",
        "linked-first",
        "linked",
      ])
    },
  )

  it("supports health status as an active user sort", () => {
    const accounts = [
      buildDisplaySiteData({ id: "missing", health: undefined }),
      buildDisplaySiteData({
        id: "unknown",
        health: { status: SiteHealthStatus.Unknown },
      }),
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
      "missing",
      "unknown",
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

  it.each(["asc", "desc"] as const)(
    "supports check-in requirement as an active %s sort",
    (sortOrder) => {
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
          sortOrder,
        ),
      )

      expect(accounts.map(({ id }) => id)).toEqual(
        sortOrder === "asc" ? ["done", "required"] : ["required", "done"],
      )
    },
  )

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
      createDynamicSortComparator(config(), null, DATA_TYPE_NAME, "USD", "asc"),
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

describe("browsing context priority", () => {
  it.each(["asc", "desc"] as const)(
    "promotes the active tab and other related pages above pinned accounts and sorts each tier by balance (%s)",
    (direction) => {
      const accounts = [
        buildDisplaySiteData({ id: "normal", balance: { USD: 100, CNY: 100 } }),
        buildDisplaySiteData({ id: "open-low", balance: { USD: 1, CNY: 1 } }),
        buildDisplaySiteData({ id: "open-high", balance: { USD: 9, CNY: 9 } }),
        buildDisplaySiteData({ id: "active", balance: { USD: 5, CNY: 5 } }),
        buildDisplaySiteData({ id: "current", balance: { USD: 5, CNY: 5 } }),
        buildDisplaySiteData({ id: "pinned" }),
        buildDisplaySiteData({
          id: "open-pinned",
          balance: { USD: 0, CNY: 0 },
        }),
        buildDisplaySiteData({ id: "disabled", disabled: true }),
      ]
      const tiers = {
        "open-low": OPEN_TAB_MATCH_TIER.BACKGROUND,
        "open-pinned": OPEN_TAB_MATCH_TIER.BACKGROUND,
        "open-high": OPEN_TAB_MATCH_TIER.BACKGROUND,
        active: OPEN_TAB_MATCH_TIER.ACTIVE,
        current: OPEN_TAB_MATCH_TIER.ACTIVE,
        disabled: OPEN_TAB_MATCH_TIER.ACTIVE,
      }
      const comparator = createDynamicSortComparator(
        DEFAULT_SORTING_PRIORITY_CONFIG,
        buildSiteAccount({ id: "current" }),
        DATA_TYPE_BALANCE,
        "USD",
        direction,
        tiers,
        ["pinned", "open-pinned", "disabled"],
      )
      expect(accounts.sort(comparator).map(({ id }) => id)).toEqual([
        "current",
        "active",
        "open-pinned",
        ...(direction === "asc"
          ? ["open-low", "open-high"]
          : ["open-high", "open-low"]),
        "pinned",
        "normal",
        "disabled",
      ])
      expect(comparator(atIndex(accounts, 1), atIndex(accounts, 1))).toBe(0)
    },
  )

  it("resolves the active tab tier above related pages open in other tabs", () => {
    const settings = config([
      { id: SortingCriteriaType.MATCHED_OPEN_TABS, enabled: true, priority: 0 },
    ])
    const resolve = createAccountContextBoostResolver(settings, undefined, {
      active: OPEN_TAB_MATCH_TIER.ACTIVE,
      background: OPEN_TAB_MATCH_TIER.BACKGROUND,
    })

    expect(resolve("active")).toBe("active-tab")
    expect(resolve("background")).toBe("open-tabs")
    expect(resolve("unmatched")).toBeUndefined()
  })

  it("keeps the signed-in account and the field sort ahead of the active tab tier", () => {
    const accounts = [
      buildDisplaySiteData({ id: "active", name: "A" }),
      buildDisplaySiteData({ id: "current", name: "M" }),
      buildDisplaySiteData({ id: "other", name: "B" }),
    ]

    accounts.sort(
      createDynamicSortComparator(
        DEFAULT_SORTING_PRIORITY_CONFIG,
        buildSiteAccount({ id: "current" }),
        DATA_TYPE_NAME,
        "USD",
        "asc",
        {
          active: OPEN_TAB_MATCH_TIER.ACTIVE,
          current: OPEN_TAB_MATCH_TIER.ACTIVE,
        },
      ),
    )

    expect(accounts.map(({ id }) => id)).toEqual(["current", "active", "other"])
  })

  it("preserves disabled choices and uses current-site priority regardless of legacy priority numbers", () => {
    const settings = config([
      { id: SortingCriteriaType.MATCHED_OPEN_TABS, enabled: true, priority: 0 },
      { id: SortingCriteriaType.CURRENT_SITE, enabled: true, priority: 9 },
    ])
    expect(
      createAccountContextBoostResolver(settings, "current", {
        current: OPEN_TAB_MATCH_TIER.BACKGROUND,
      })("current"),
    ).toBe("current-site")
    atIndex(settings.criteria, 1).enabled = false
    expect(
      createAccountContextBoostResolver(settings, "current", {
        current: OPEN_TAB_MATCH_TIER.BACKGROUND,
      })("current"),
    ).toBe("open-tabs")
    atIndex(settings.criteria, 0).enabled = false
    const resolve = createAccountContextBoostResolver(settings, "current", {
      current: OPEN_TAB_MATCH_TIER.BACKGROUND,
    })
    expect(resolve("current")).toBeUndefined()
    const accounts = [
      buildDisplaySiteData({ id: "current", name: "Z" }),
      buildDisplaySiteData({ id: "other", name: "A" }),
    ]
    expect(
      accounts
        .sort(
          createDynamicSortComparator(
            settings,
            buildSiteAccount({ id: "current" }),
            DATA_TYPE_NAME,
            "USD",
            "asc",
            { current: OPEN_TAB_MATCH_TIER.BACKGROUND },
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["other", "current"])
  })
})
