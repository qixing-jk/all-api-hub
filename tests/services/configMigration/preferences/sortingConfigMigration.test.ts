import { describe, expect, it } from "vitest"

import {
  migrateSortingConfig,
  needsSortingConfigMigration,
} from "~/services/preferences/migrations/sortingConfigMigration"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import { SortingCriteriaType } from "~/types/sorting"

describe("sortingConfigMigration", () => {
  describe("needsSortingConfigMigration", () => {
    it("returns true when config is undefined", () => {
      const result = needsSortingConfigMigration(undefined)
      expect(result).toBe(true)
    })

    it("returns true when config is missing PINNED criterion", () => {
      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.filter(
          (c) => c.id !== SortingCriteriaType.PINNED,
        ),
      }
      const result = needsSortingConfigMigration(config)
      expect(result).toBe(true)
    })

    it("returns true when config has fewer criteria than default", () => {
      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.slice(0, 3),
      }
      const result = needsSortingConfigMigration(config)
      expect(result).toBe(true)
    })

    it("returns false when config matches default", () => {
      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => ({
          ...c,
        })),
      }
      const result = needsSortingConfigMigration(config)
      expect(result).toBe(false)
    })

    it("returns true when MANUAL_ORDER still precedes USER_SORT_FIELD", () => {
      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.DISABLED_ACCOUNT,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: true,
            priority: 1,
          },
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 2,
          },
          {
            id: SortingCriteriaType.MANUAL_ORDER,
            enabled: true,
            priority: 3,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 4,
          },
          ...DEFAULT_SORTING_PRIORITY_CONFIG.criteria
            .filter(
              (c) =>
                c.id !== SortingCriteriaType.DISABLED_ACCOUNT &&
                c.id !== SortingCriteriaType.CURRENT_SITE &&
                c.id !== SortingCriteriaType.PINNED &&
                c.id !== SortingCriteriaType.MANUAL_ORDER &&
                c.id !== SortingCriteriaType.USER_SORT_FIELD,
            )
            .map((c, index) => ({
              ...c,
              priority: index + 5,
            })),
        ],
      }
      const result = needsSortingConfigMigration(config)
      expect(result).toBe(true)
    })

    it("returns true for custom user order that still keeps MANUAL_ORDER ahead of USER_SORT_FIELD", () => {
      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: [
          {
            id: SortingCriteriaType.DISABLED_ACCOUNT,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: true,
            priority: 1,
          },
          {
            id: SortingCriteriaType.MANUAL_ORDER,
            enabled: true,
            priority: 2,
          },
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 3,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 4,
          },
          ...DEFAULT_SORTING_PRIORITY_CONFIG.criteria
            .filter(
              (c) =>
                c.id !== SortingCriteriaType.DISABLED_ACCOUNT &&
                c.id !== SortingCriteriaType.CURRENT_SITE &&
                c.id !== SortingCriteriaType.PINNED &&
                c.id !== SortingCriteriaType.MANUAL_ORDER &&
                c.id !== SortingCriteriaType.USER_SORT_FIELD,
            )
            .map((c, index) => ({
              ...c,
              priority: index + 5,
            })),
        ],
      }

      expect(needsSortingConfigMigration(config)).toBe(true)
    })
  })

  describe("migrateSortingConfig", () => {
    it("returns default config when input is undefined", () => {
      const result = migrateSortingConfig(undefined)

      expect(result.criteria).toHaveLength(
        DEFAULT_SORTING_PRIORITY_CONFIG.criteria.length,
      )
      expect(result).toHaveProperty("lastModified")
      expect(result.criteria.map((c) => c.id)).toEqual(
        DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => c.id),
      )
    })

    it("returns config unchanged when no migration needed", () => {
      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => ({
          ...c,
        })),
      }
      const originalLastModified = config.lastModified

      const result = migrateSortingConfig(config)

      expect(result).toEqual(config)
      expect(result.lastModified).toBe(originalLastModified)
    })

    it("moves USER_SORT_FIELD ahead of MANUAL_ORDER for legacy configs", () => {
      const config = {
        criteria: [
          {
            id: SortingCriteriaType.DISABLED_ACCOUNT,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: true,
            priority: 1,
          },
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 2,
          },
          {
            id: SortingCriteriaType.MANUAL_ORDER,
            enabled: true,
            priority: 3,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 4,
          },
          {
            id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
            enabled: true,
            priority: 5,
          },
          {
            id: SortingCriteriaType.MATCHED_OPEN_TABS,
            enabled: true,
            priority: 6,
          },
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 7,
          },
          {
            id: SortingCriteriaType.CUSTOM_CHECK_IN_URL,
            enabled: true,
            priority: 8,
          },
          {
            id: SortingCriteriaType.CUSTOM_REDEEM_URL,
            enabled: true,
            priority: 9,
          },
        ],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)
      const ids = result.criteria.map((criterion) => criterion.id)

      expect(ids.indexOf(SortingCriteriaType.USER_SORT_FIELD)).toBe(3)
      expect(ids.indexOf(SortingCriteriaType.MANUAL_ORDER)).toBe(4)
      expect(ids.indexOf(SortingCriteriaType.CHECK_IN_REQUIREMENT)).toBe(5)
      expect(ids.indexOf(SortingCriteriaType.MATCHED_OPEN_TABS)).toBe(6)
      expect(ids.indexOf(SortingCriteriaType.HEALTH_STATUS)).toBe(7)
      expect(ids.indexOf(SortingCriteriaType.CUSTOM_CHECK_IN_URL)).toBe(8)
      expect(ids.indexOf(SortingCriteriaType.CUSTOM_REDEEM_URL)).toBe(9)
    })

    it("canonicalizes custom user ordering when MANUAL_ORDER still precedes USER_SORT_FIELD", () => {
      const config = {
        criteria: [
          {
            id: SortingCriteriaType.DISABLED_ACCOUNT,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: true,
            priority: 1,
          },
          {
            id: SortingCriteriaType.MANUAL_ORDER,
            enabled: true,
            priority: 2,
          },
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 3,
          },
          {
            id: SortingCriteriaType.USER_SORT_FIELD,
            enabled: true,
            priority: 4,
          },
          ...DEFAULT_SORTING_PRIORITY_CONFIG.criteria
            .filter(
              (c) =>
                c.id !== SortingCriteriaType.DISABLED_ACCOUNT &&
                c.id !== SortingCriteriaType.CURRENT_SITE &&
                c.id !== SortingCriteriaType.PINNED &&
                c.id !== SortingCriteriaType.MANUAL_ORDER &&
                c.id !== SortingCriteriaType.USER_SORT_FIELD,
            )
            .map((c, index) => ({
              ...c,
              priority: index + 5,
            })),
        ],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)
      const ids = result.criteria.map((criterion) => criterion.id)

      expect(ids.indexOf(SortingCriteriaType.PINNED)).toBe(2)
      expect(ids.indexOf(SortingCriteriaType.USER_SORT_FIELD)).toBe(3)
      expect(ids.indexOf(SortingCriteriaType.MANUAL_ORDER)).toBe(4)
    })

    it("adds PINNED criterion when missing", () => {
      const config = {
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.filter(
          (c) => c.id !== SortingCriteriaType.PINNED,
        ),
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      const pinnedCriterion = result.criteria.find(
        (c) => c.id === SortingCriteriaType.PINNED,
      )
      expect(pinnedCriterion).toBeDefined()
      expect(pinnedCriterion?.enabled).toBe(true)
    })

    it("inserts PINNED criterion at highest priority position", () => {
      const config = {
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria
          .filter((c) => c.id !== SortingCriteriaType.PINNED)
          .map((c) => ({ ...c })),
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      const pinnedIndex = result.criteria.findIndex(
        (c) => c.id === SortingCriteriaType.PINNED,
      )
      const currentSiteIndex = result.criteria.findIndex(
        (c) => c.id === SortingCriteriaType.CURRENT_SITE,
      )

      // Both should be at the top - CURRENT_SITE comes first due to sort order in normalization
      expect(pinnedIndex).toBeGreaterThanOrEqual(0)
      expect(currentSiteIndex).toBeGreaterThanOrEqual(0)
      expect(pinnedIndex).toBeLessThanOrEqual(3) // At most position 3 due to other top criteria
    })

    it("adds missing criteria with expected enabled state", () => {
      const config = {
        criteria: [
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 1,
          },
        ],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      const disabledCriterion = result.criteria.find(
        (c) => c.id === SortingCriteriaType.DISABLED_ACCOUNT,
      )
      expect(disabledCriterion).toBeDefined()
      expect(disabledCriterion?.enabled).toBe(true)

      const manualOrderCriterion = result.criteria.find(
        (c) => c.id === SortingCriteriaType.MANUAL_ORDER,
      )
      expect(manualOrderCriterion).toBeDefined()
      expect(manualOrderCriterion?.enabled).toBe(true)

      const otherMissingCriteria = result.criteria.filter(
        (c) =>
          c.id !== SortingCriteriaType.DISABLED_ACCOUNT &&
          c.id !== SortingCriteriaType.CURRENT_SITE &&
          c.id !== SortingCriteriaType.PINNED &&
          c.id !== SortingCriteriaType.MANUAL_ORDER,
      )

      expect(otherMissingCriteria.length).toBeGreaterThan(0)
      otherMissingCriteria.forEach((c) => {
        expect(c.enabled).toBe(false)
      })
    })

    it("normalizes priorities after migration", () => {
      const config = {
        criteria: [
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: true,
            priority: 10,
          },
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 20,
          },
        ],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      // Check priorities are normalized
      const priorities = result.criteria.map((c) => c.priority)
      for (let i = 0; i < priorities.length; i++) {
        expect(priorities[i]).toBe(i)
      }
    })

    it("updates lastModified timestamp", () => {
      const config = {
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.filter(
          (c) => c.id !== SortingCriteriaType.PINNED,
        ),
        lastModified: 1000,
      }

      const beforeTime = Date.now()
      const result = migrateSortingConfig(config)
      const afterTime = Date.now()

      expect(result.lastModified).toBeGreaterThanOrEqual(beforeTime)
      expect(result.lastModified).toBeLessThanOrEqual(afterTime)
    })

    it("maintains CURRENT_SITE at highest priority", () => {
      const config = {
        criteria: [
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 0,
          },
          {
            id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
            enabled: true,
            priority: 1,
          },
        ],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      const currentSiteIndex = result.criteria.findIndex(
        (c) => c.id === SortingCriteriaType.CURRENT_SITE,
      )
      const healthStatusIndex = result.criteria.findIndex(
        (c) => c.id === SortingCriteriaType.HEALTH_STATUS,
      )

      expect(currentSiteIndex).toBeLessThan(healthStatusIndex)
    })

    it("results in all default criteria being present", () => {
      const config = {
        criteria: [
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 0,
          },
        ],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      const resultIds = new Set(result.criteria.map((c) => c.id))
      const defaultIds = new Set(
        DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => c.id),
      )

      expect(resultIds).toEqual(defaultIds)
    })

    it("does not duplicate existing criteria", () => {
      const config = {
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.filter(
          (c) => c.id !== SortingCriteriaType.PINNED,
        ),
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      const resultIds = result.criteria.map((c) => c.id)
      const uniqueIds = [...new Set(resultIds)]

      // No duplicates - unique count should equal total count
      expect(uniqueIds.length).toBe(resultIds.length)

      const healthStatusCount = result.criteria.filter(
        (c) => c.id === SortingCriteriaType.HEALTH_STATUS,
      ).length

      expect(healthStatusCount).toBe(1)
    })

    it("handles empty criteria array", () => {
      const config = {
        criteria: [],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      expect(result.criteria.length).toBe(
        DEFAULT_SORTING_PRIORITY_CONFIG.criteria.length,
      )
      expect(
        result.criteria.every((c) =>
          DEFAULT_SORTING_PRIORITY_CONFIG.criteria.some((dc) => dc.id === c.id),
        ),
      ).toBe(true)
    })

    it("preserves enabled state for existing criteria", () => {
      const config = {
        criteria: [
          {
            id: SortingCriteriaType.CURRENT_SITE,
            enabled: false,
            priority: 0,
          },
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 1,
          },
        ],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      const currentSite = result.criteria.find(
        (c) => c.id === SortingCriteriaType.CURRENT_SITE,
      )
      const healthStatus = result.criteria.find(
        (c) => c.id === SortingCriteriaType.HEALTH_STATUS,
      )

      expect(currentSite?.enabled).toBe(false)
      expect(healthStatus?.enabled).toBe(true)
    })

    it("places DISABLED_ACCOUNT, CURRENT_SITE, PINNED, USER_SORT_FIELD, and MANUAL_ORDER at the top in that order", () => {
      const config = {
        criteria: [
          {
            id: SortingCriteriaType.HEALTH_STATUS,
            enabled: true,
            priority: 10,
          },
          {
            id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
            enabled: true,
            priority: 20,
          },
        ],
        lastModified: 1000,
      }

      const result = migrateSortingConfig(config)

      const ids = result.criteria.map((c) => c.id)

      expect(ids.indexOf(SortingCriteriaType.DISABLED_ACCOUNT)).toBe(0)
      expect(ids.indexOf(SortingCriteriaType.CURRENT_SITE)).toBe(1)
      expect(ids.indexOf(SortingCriteriaType.PINNED)).toBe(2)
      expect(ids.indexOf(SortingCriteriaType.USER_SORT_FIELD)).toBe(3)
      expect(ids.indexOf(SortingCriteriaType.MANUAL_ORDER)).toBe(4)
    })
  })
})
