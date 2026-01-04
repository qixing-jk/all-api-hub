import { describe, expect, it } from "vitest"

import { DATA_TYPE_BALANCE, DATA_TYPE_CONSUMPTION } from "~/constants"
import type { DisplaySiteData, SiteAccount } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"
import {
  createDynamicSortComparator,
  DEFAULT_SORTING_PRIORITY_CONFIG,
} from "~/utils/sortingPriority"

describe("createDynamicSortComparator", () => {
  // Helper to create a minimal DisplaySiteData fixture
  const createDisplaySiteData = (
    overrides: Partial<DisplaySiteData> = {},
  ): DisplaySiteData => ({
    id: "account-1",
    icon: "🧪",
    name: "Test Account",
    username: "test-user",
    balance: { USD: 100, CNY: 700 },
    todayConsumption: { USD: 10, CNY: 70 },
    todayIncome: { USD: 5, CNY: 35 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: SiteHealthStatus.Healthy },
    siteType: "test-site",
    baseUrl: "https://test.com",
    token: "test-token",
    userId: 1,
    authType: AuthTypeEnum.AccessToken,
    checkIn: {
      enableDetection: false,
      siteStatus: { isCheckedInToday: false },
    },
    ...overrides,
  })

  describe("MANUAL_ORDER criterion", () => {
    it("should prioritize manual order before user sort field", () => {
      const accountA = createDisplaySiteData({
        id: "account-1",
        name: "Zeta",
        balance: { USD: 10, CNY: 70 },
      })
      const accountB = createDisplaySiteData({
        id: "account-2",
        name: "Alpha",
        balance: { USD: 20, CNY: 140 },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          { id: SortingCriteriaType.MANUAL_ORDER, enabled: true, priority: 0 },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 1,
          },
        ],
      }

      const manualOrderIndices = { "account-1": 1, "account-2": 0 }
      const comparator = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "asc",
        {},
        [],
        manualOrderIndices,
      )

      // Even though accountB has higher balance, manual order puts it first
      expect(comparator(accountB, accountA)).toBeLessThan(0)
      expect(comparator(accountA, accountB)).toBeGreaterThan(0)
    })

    it("should apply manual order within non-pinned after pinned come first", () => {
      const pinnedAccount = createDisplaySiteData({ id: "pinned-1" })
      const manualFirst = createDisplaySiteData({ id: "manual-1" })
      const manualSecond = createDisplaySiteData({ id: "manual-2" })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG
      const pinnedAccountIds = ["pinned-1"]
      const manualOrderIndices = { "manual-2": 0, "manual-1": 1 }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        {},
        pinnedAccountIds,
        manualOrderIndices,
      )

      // pinned always above non-pinned
      expect(comparator(pinnedAccount, manualFirst)).toBeLessThan(0)
      // manual ordering respected between non-pinned
      expect(comparator(manualSecond, manualFirst)).toBeLessThan(0)
    })
  })

  // Helper to create a SiteAccount for detectedAccount parameter
  const createSiteAccount = (
    overrides: Partial<SiteAccount> = {},
  ): SiteAccount => ({
    id: "detected-account",
    site_name: "Detected Site",
    site_url: "https://detected.com",
    health: { status: SiteHealthStatus.Healthy },
    site_type: "test-site",
    exchange_rate: 7.0,
    account_info: {
      id: 1,
      access_token: "test-token",
      username: "test-user",
      quota: 1000,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    last_sync_time: Date.now(),
    updated_at: Date.now(),
    created_at: Date.now(),
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    ...overrides,
  })

  describe("PINNED criterion", () => {
    it("should pin accounts that are in the pinnedAccountIds list", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG
      const pinnedAccountIds = ["account-2"]

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        {},
        pinnedAccountIds,
      )

      // Pinned account should come before non-pinned accounts
      expect(comparator(account2, account1)).toBeLessThan(0)
      expect(comparator(account1, account2)).toBeGreaterThan(0)
    })

    it("should maintain order based on pinnedAccountIds index", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })
      const account3 = createDisplaySiteData({ id: "account-3" })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG
      const pinnedAccountIds = ["account-2", "account-3"]

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        {},
        pinnedAccountIds,
      )

      // account-2 is at index 0, account-3 is at index 1
      expect(comparator(account2, account3)).toBeLessThan(0)
      expect(comparator(account3, account2)).toBeGreaterThan(0)
      expect(comparator(account1, account2)).toBeGreaterThan(0)
      expect(comparator(account1, account3)).toBeGreaterThan(0)
    })

    it("should return 0 when both accounts are not pinned", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        {},
        [],
      )

      expect(comparator(account1, account2)).toBe(0)
    })
  })

  describe("CURRENT_SITE criterion", () => {
    it("should prioritize the detected account", () => {
      const detectedAccount = createSiteAccount({ id: "detected-account" })
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "detected-account" })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG
      const comparator = createDynamicSortComparator(
        config,
        detectedAccount,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(account2, account1)).toBeLessThan(0)
      expect(comparator(account1, account2)).toBeGreaterThan(0)
    })

    it("should return 0 when neither account is detected", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })
      const detectedAccount = createSiteAccount({ id: "detected-account" })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        detectedAccount,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(account1, account2)).toBe(0)
    })

    it("should return 0 when detectedAccount is null", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(account1, account2)).toBe(0)
    })
  })

  describe("HEALTH_STATUS criterion", () => {
    it("should prioritize error > warning > unknown > healthy", () => {
      const errorAccount = createDisplaySiteData({
        id: "error",
        health: { status: SiteHealthStatus.Error },
      })
      const warningAccount = createDisplaySiteData({
        id: "warning",
        health: { status: SiteHealthStatus.Warning },
      })
      const unknownAccount = createDisplaySiteData({
        id: "unknown",
        health: { status: SiteHealthStatus.Unknown },
      })
      const healthyAccount = createDisplaySiteData({
        id: "healthy",
        health: { status: SiteHealthStatus.Healthy },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      // error should come before warning, warning before unknown, unknown before healthy
      expect(comparator(errorAccount, warningAccount)).toBeLessThan(0)
      expect(comparator(warningAccount, unknownAccount)).toBeLessThan(0)
      expect(comparator(unknownAccount, healthyAccount)).toBeLessThan(0)

      // reverse should give opposite results
      expect(comparator(healthyAccount, unknownAccount)).toBeGreaterThan(0)
      expect(comparator(unknownAccount, warningAccount)).toBeGreaterThan(0)
      expect(comparator(warningAccount, errorAccount)).toBeGreaterThan(0)
    })

    it("should treat missing health status as healthy", () => {
      const warningAccount = createDisplaySiteData({
        id: "warning",
        health: { status: SiteHealthStatus.Warning },
      })
      const healthyAccount = createDisplaySiteData({
        id: "healthy",
        health: { status: SiteHealthStatus.Healthy },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      // Warning (2) should come before healthy (4)
      expect(comparator(warningAccount, healthyAccount)).toBeLessThan(0)
    })
  })

  describe("CHECK_IN_REQUIREMENT criterion", () => {
    it("should prioritize accounts that need check-in (isCheckedInToday=false)", () => {
      const needsCheckIn = createDisplaySiteData({
        id: "needs-checkin",
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: false },
        },
      })
      const alreadyCheckedIn = createDisplaySiteData({
        id: "checked-in",
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: true },
        },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      // Accounts needing check-in should come first
      expect(comparator(needsCheckIn, alreadyCheckedIn)).toBeLessThan(0)
      expect(comparator(alreadyCheckedIn, needsCheckIn)).toBeGreaterThan(0)
    })

    it("should return 0 when both have same check-in status", () => {
      const account1 = createDisplaySiteData({
        id: "account-1",
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: false },
        },
      })
      const account2 = createDisplaySiteData({
        id: "account-2",
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: false },
        },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(account1, account2)).toBe(0)
    })

    it("should handle accounts with undefined isCheckedInToday", () => {
      const account1 = createDisplaySiteData({
        id: "account-1",
        checkIn: { enableDetection: true },
      })
      const account2 = createDisplaySiteData({
        id: "account-2",
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: false },
        },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      // When isCheckedInToday is undefined, it should be treated as 1 (not needing check-in)
      expect(comparator(account2, account1)).toBeLessThan(0)
    })
  })

  describe("CUSTOM_CHECK_IN_URL criterion", () => {
    it("should prioritize accounts with custom check-in URLs", () => {
      const withCustomUrl = createDisplaySiteData({
        id: "with-custom",
        checkIn: {
          enableDetection: true,
          customCheckIn: {
            url: "https://custom.com",
          },
        },
      })
      const withoutCustomUrl = createDisplaySiteData({
        id: "without-custom",
        checkIn: { enableDetection: true },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(withCustomUrl, withoutCustomUrl)).toBeLessThan(0)
      expect(comparator(withoutCustomUrl, withCustomUrl)).toBeGreaterThan(0)
    })

    it("should return 0 when both have same custom check-in URL status", () => {
      const account1 = createDisplaySiteData({
        id: "account-1",
        checkIn: {
          enableDetection: true,
          customCheckIn: {
            url: "https://custom1.com",
          },
        },
      })
      const account2 = createDisplaySiteData({
        id: "account-2",
        checkIn: {
          enableDetection: true,
          customCheckIn: {
            url: "https://custom2.com",
          },
        },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(account1, account2)).toBe(0)
    })
  })

  describe("CUSTOM_REDEEM_URL criterion", () => {
    it("should prioritize accounts with custom redeem URLs", () => {
      const withCustomUrl = createDisplaySiteData({
        id: "with-custom",
        checkIn: {
          enableDetection: true,
          customCheckIn: {
            redeemUrl: "https://custom.com",
          },
        },
      })
      const withoutCustomUrl = createDisplaySiteData({
        id: "without-custom",
        checkIn: { enableDetection: true },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CUSTOM_REDEEM_URL,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(withCustomUrl, withoutCustomUrl)).toBeLessThan(0)
      expect(comparator(withoutCustomUrl, withCustomUrl)).toBeGreaterThan(0)
    })

    it("should return 0 when both have same custom redeem URL status", () => {
      const account1 = createDisplaySiteData({
        id: "account-1",
        checkIn: {
          enableDetection: true,
          customCheckIn: {
            redeemUrl: "https://custom1.com",
          },
        },
      })
      const account2 = createDisplaySiteData({
        id: "account-2",
        checkIn: {
          enableDetection: true,
          customCheckIn: {
            redeemUrl: "https://custom2.com",
          },
        },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CUSTOM_REDEEM_URL,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(account1, account2)).toBe(0)
    })
  })

  describe("MATCHED_OPEN_TABS criterion", () => {
    it("should prioritize accounts with higher matched open tab scores", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })
      const account3 = createDisplaySiteData({ id: "account-3" })

      const matchedAccountScores = {
        "account-1": 5,
        "account-2": 10,
        "account-3": 0,
      }

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.MATCHED_OPEN_TABS,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        matchedAccountScores,
      )

      // Higher scores come first
      expect(comparator(account2, account1)).toBeLessThan(0)
      expect(comparator(account1, account3)).toBeLessThan(0)
      expect(comparator(account3, account1)).toBeGreaterThan(0)
    })

    it("should treat missing scores as 0", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const matchedAccountScores = {
        "account-1": 5,
      }

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.MATCHED_OPEN_TABS,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        matchedAccountScores,
      )

      // account-1 has score 5, account-2 is not in map (default 0)
      expect(comparator(account1, account2)).toBeLessThan(0)
    })

    it("should return 0 when both have same score", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const matchedAccountScores = {
        "account-1": 5,
        "account-2": 5,
      }

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.MATCHED_OPEN_TABS,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        matchedAccountScores,
      )

      expect(comparator(account1, account2)).toBe(0)
    })
  })

  describe("USER_SORT_FIELD criterion - name", () => {
    it("should sort by name in ascending order", () => {
      const accountA = createDisplaySiteData({ id: "a", name: "Alpha" })
      const accountB = createDisplaySiteData({ id: "b", name: "Beta" })
      const accountC = createDisplaySiteData({ id: "c", name: "Gamma" })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(accountA, accountB)).toBeLessThan(0)
      expect(comparator(accountB, accountC)).toBeLessThan(0)
      expect(comparator(accountC, accountA)).toBeGreaterThan(0)
    })

    it("should sort by name in descending order", () => {
      const accountA = createDisplaySiteData({ id: "a", name: "Alpha" })
      const accountB = createDisplaySiteData({ id: "b", name: "Beta" })
      const accountC = createDisplaySiteData({ id: "c", name: "Gamma" })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "desc",
      )

      expect(comparator(accountC, accountB)).toBeLessThan(0)
      expect(comparator(accountB, accountA)).toBeLessThan(0)
      expect(comparator(accountA, accountC)).toBeGreaterThan(0)
    })
  })

  describe("USER_SORT_FIELD criterion - balance", () => {
    it("should sort by balance in ascending order", () => {
      const lowBalance = createDisplaySiteData({
        id: "low",
        balance: { USD: 10, CNY: 70 },
      })
      const midBalance = createDisplaySiteData({
        id: "mid",
        balance: { USD: 50, CNY: 350 },
      })
      const highBalance = createDisplaySiteData({
        id: "high",
        balance: { USD: 100, CNY: 700 },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "asc",
      )

      expect(comparator(lowBalance, midBalance)).toBeLessThan(0)
      expect(comparator(midBalance, highBalance)).toBeLessThan(0)
      expect(comparator(highBalance, lowBalance)).toBeGreaterThan(0)
    })

    it("should sort by balance in descending order", () => {
      const lowBalance = createDisplaySiteData({
        id: "low",
        balance: { USD: 10, CNY: 70 },
      })
      const midBalance = createDisplaySiteData({
        id: "mid",
        balance: { USD: 50, CNY: 350 },
      })
      const highBalance = createDisplaySiteData({
        id: "high",
        balance: { USD: 100, CNY: 700 },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "desc",
      )

      expect(comparator(highBalance, midBalance)).toBeLessThan(0)
      expect(comparator(midBalance, lowBalance)).toBeLessThan(0)
      expect(comparator(lowBalance, highBalance)).toBeGreaterThan(0)
    })

    it("should use correct currency for comparison", () => {
      const accountLowUSD = createDisplaySiteData({
        id: "low-usd",
        balance: { USD: 50, CNY: 1000 },
      })
      const accountHighUSD = createDisplaySiteData({
        id: "high-usd",
        balance: { USD: 100, CNY: 100 },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
      }

      // When comparing USD in ascending order, lower USD value should come first
      const comparatorUSD = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "asc",
      )
      expect(comparatorUSD(accountLowUSD, accountHighUSD)).toBeLessThan(0)

      // When comparing CNY in ascending order, lower CNY value should come first
      const accountLowCNY = createDisplaySiteData({
        id: "low-cny",
        balance: { USD: 100, CNY: 100 },
      })
      const accountHighCNY = createDisplaySiteData({
        id: "high-cny",
        balance: { USD: 50, CNY: 1000 },
      })

      const comparatorCNY = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_BALANCE,
        "CNY",
        "asc",
      )
      expect(comparatorCNY(accountLowCNY, accountHighCNY)).toBeLessThan(0)
    })
  })

  describe("USER_SORT_FIELD criterion - consumption", () => {
    it("should sort by consumption in ascending order", () => {
      const lowConsumption = createDisplaySiteData({
        id: "low",
        todayConsumption: { USD: 1, CNY: 7 },
      })
      const midConsumption = createDisplaySiteData({
        id: "mid",
        todayConsumption: { USD: 5, CNY: 35 },
      })
      const highConsumption = createDisplaySiteData({
        id: "high",
        todayConsumption: { USD: 10, CNY: 70 },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_CONSUMPTION,
        "USD",
        "asc",
      )

      expect(comparator(lowConsumption, midConsumption)).toBeLessThan(0)
      expect(comparator(midConsumption, highConsumption)).toBeLessThan(0)
      expect(comparator(highConsumption, lowConsumption)).toBeGreaterThan(0)
    })

    it("should sort by consumption in descending order", () => {
      const lowConsumption = createDisplaySiteData({
        id: "low",
        todayConsumption: { USD: 1, CNY: 7 },
      })
      const midConsumption = createDisplaySiteData({
        id: "mid",
        todayConsumption: { USD: 5, CNY: 35 },
      })
      const highConsumption = createDisplaySiteData({
        id: "high",
        todayConsumption: { USD: 10, CNY: 70 },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_CONSUMPTION,
        "USD",
        "desc",
      )

      expect(comparator(highConsumption, midConsumption)).toBeLessThan(0)
      expect(comparator(midConsumption, lowConsumption)).toBeLessThan(0)
      expect(comparator(lowConsumption, highConsumption)).toBeGreaterThan(0)
    })
  })

  describe("Multiple criteria with priority ordering", () => {
    it("should short-circuit when first criterion produces a difference", () => {
      const pinnedAccount = createDisplaySiteData({
        id: "pinned",
        name: "Zebra",
        balance: { USD: 10, CNY: 70 },
      })
      const unpinnedAccount = createDisplaySiteData({
        id: "unpinned",
        name: "Apple",
        balance: { USD: 100, CNY: 700 },
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 1,
          },
        ],
      }

      const pinnedAccountIds = ["pinned"]
      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        {},
        pinnedAccountIds,
      )

      // Even though unpinnedAccount has a higher balance, pinnedAccount should come first
      expect(comparator(pinnedAccount, unpinnedAccount)).toBeLessThan(0)
    })

    it("should evaluate second criterion when first produces 0", () => {
      const healthyWithLowBalance = createDisplaySiteData({
        id: "healthy-low",
        health: { status: SiteHealthStatus.Healthy },
        balance: { USD: 10, CNY: 70 },
        name: "Account1",
      })
      const healthyWithHighBalance = createDisplaySiteData({
        id: "healthy-high",
        health: { status: SiteHealthStatus.Healthy },
        balance: { USD: 100, CNY: 700 },
        name: "Account2",
      })

      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 1,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "desc",
      )

      // Both have same health, so second criterion (balance desc) applies
      expect(
        comparator(healthyWithHighBalance, healthyWithLowBalance),
      ).toBeLessThan(0)
    })

    it("should respect priority order", () => {
      const account1 = createDisplaySiteData({
        id: "account-1",
        name: "Zebra",
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: false },
        },
      })
      const account2 = createDisplaySiteData({
        id: "account-2",
        name: "Apple",
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: true },
        },
      })

      // Priority: check-in (priority 0) > name (priority 1)
      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 1,
          },
        ],
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      // account1 needs check-in, so it should come first despite having name "Zebra" > "Apple"
      expect(comparator(account1, account2)).toBeLessThan(0)
    })
  })

  describe("Disabled criteria", () => {
    it("should skip disabled criteria", () => {
      const account1 = createDisplaySiteData({
        id: "account-1",
        name: "Zebra",
        balance: { USD: 10, CNY: 70 },
      })
      const account2 = createDisplaySiteData({
        id: "account-2",
        name: "Apple",
        balance: { USD: 100, CNY: 700 },
      })

      const config: SortingPriorityConfig = {
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: false, // Disabled
            priority: 0,
          },
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 1,
          },
        ],
        lastModified: Date.now(),
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      // USER_SORT_FIELD is disabled, so both have same health (should return 0)
      expect(comparator(account1, account2)).toBe(0)
    })

    it("should return 0 when all criteria are disabled", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const config: SortingPriorityConfig = {
        criteria: [
          {
            id: SortingCriteriaType.PINNED,
            enabled: false,
            priority: 0,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: false,
            priority: 1,
          },
        ],
        lastModified: Date.now(),
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(account1, account2)).toBe(0)
    })
  })

  describe("Complex sorting scenarios", () => {
    it("should apply default sorting priority correctly", () => {
      const account1 = createDisplaySiteData({
        id: "account-1",
        name: "Account1",
        health: { status: SiteHealthStatus.Error },
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: false },
          customCheckIn: { url: "https://custom.com" },
        },
      })
      const account2 = createDisplaySiteData({
        id: "account-2",
        name: "Account2",
        health: { status: SiteHealthStatus.Healthy },
        checkIn: {
          enableDetection: true,
          siteStatus: { isCheckedInToday: true },
        },
      })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG
      const pinnedAccountIds = ["account-1"]
      const detectedAccount = createSiteAccount({ id: "account-2" })

      const comparator = createDynamicSortComparator(
        config,
        detectedAccount,
        "name",
        "USD",
        "asc",
        {},
        pinnedAccountIds,
      )

      // account-1 is pinned, so despite account-2 being detected and having better health
      expect(comparator(account1, account2)).toBeLessThan(0)
    })

    it("should handle array.sort() correctly", () => {
      const accounts = [
        createDisplaySiteData({
          id: "account-3",
          name: "Charlie",
          balance: { USD: 300, CNY: 2100 },
        }),
        createDisplaySiteData({
          id: "account-1",
          name: "Alpha",
          balance: { USD: 100, CNY: 700 },
        }),
        createDisplaySiteData({
          id: "account-2",
          name: "Beta",
          balance: { USD: 200, CNY: 1400 },
        }),
      ]

      const config: SortingPriorityConfig = {
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
        lastModified: Date.now(),
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      const sorted = accounts.sort(comparator)
      expect(sorted.map((a) => a.id)).toEqual([
        "account-1",
        "account-2",
        "account-3",
      ])
    })

    it("should handle array.sort() with multiple criteria", () => {
      const accounts = [
        createDisplaySiteData({
          id: "account-3",
          name: "Charlie",
          health: { status: SiteHealthStatus.Healthy },
          balance: { USD: 300, CNY: 2100 },
        }),
        createDisplaySiteData({
          id: "account-1",
          name: "Alpha",
          health: { status: SiteHealthStatus.Error },
          balance: { USD: 100, CNY: 700 },
        }),
        createDisplaySiteData({
          id: "account-2",
          name: "Beta",
          health: { status: SiteHealthStatus.Healthy },
          balance: { USD: 200, CNY: 1400 },
        }),
      ]

      const config: SortingPriorityConfig = {
        criteria: [
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 1,
          },
        ],
        lastModified: Date.now(),
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      const sorted = accounts.sort(comparator)
      // account-1 has error (highest priority), then alphabetical order for healthy accounts
      expect(sorted.map((a) => a.id)).toEqual([
        "account-1",
        "account-2",
        "account-3",
      ])
    })
  })

  describe("Edge cases", () => {
    it("should handle comparing identical accounts", () => {
      const account = createDisplaySiteData({ id: "account-1" })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG
      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(comparator(account, account)).toBe(0)
    })

    it("should handle empty pinned accounts list", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG
      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        {},
        [],
      )

      expect(() => comparator(account1, account2)).not.toThrow()
    })

    it("should handle empty matched account scores", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG
      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
        {},
      )

      expect(() => comparator(account1, account2)).not.toThrow()
    })

    it("should handle accounts with equal balance", () => {
      const account1 = createDisplaySiteData({
        id: "account-1",
        balance: { USD: 100, CNY: 700 },
        name: "Zebra",
      })
      const account2 = createDisplaySiteData({
        id: "account-2",
        balance: { USD: 100, CNY: 700 },
        name: "Apple",
      })

      const config: SortingPriorityConfig = {
        criteria: [
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 0,
          },
        ],
        lastModified: Date.now(),
      }

      const comparator = createDynamicSortComparator(
        config,
        null,
        DATA_TYPE_BALANCE,
        "USD",
        "asc",
      )

      // Balances are equal, so comparison should be 0
      expect(comparator(account1, account2)).toBe(0)
    })

    it("should handle default parameters", () => {
      const account1 = createDisplaySiteData({ id: "account-1" })
      const account2 = createDisplaySiteData({ id: "account-2" })

      const config = DEFAULT_SORTING_PRIORITY_CONFIG

      // Call with minimal parameters
      const comparator = createDynamicSortComparator(
        config,
        null,
        "name",
        "USD",
        "asc",
      )

      expect(() => comparator(account1, account2)).not.toThrow()
    })
  })
})
