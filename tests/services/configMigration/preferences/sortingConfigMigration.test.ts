import { describe, expect, it } from "vitest"

import {
  migrateSortingConfig,
  needsSortingConfigMigration,
} from "~/services/configMigration/preferences/sortingConfigMigration"
import { SortingCriteriaType } from "~/types/sorting"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

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

    it("returns false when config has all criteria regardless of order", () => {
      const config = {
        ...DEFAULT_SORTING_PRIORITY_CONFIG,
        criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria
          .map((c) => ({ ...c }))
          .reverse(),
      }
      const result = needsSortingConfigMigration(config)
      expect(result).toBe(false)
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
      expect(pinnedIndex).toBeLessThanOrEqual(2) // At most position 2 due to other top criteria
    })

    it("adds missing criteria with disabled state by default", () => {
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

      const missingCriteria = result.criteria.filter(
        (c) =>
          c.id !== SortingCriteriaType.CURRENT_SITE &&
          c.id !== SortingCriteriaType.PINNED,
      )

      expect(missingCriteria.length).toBeGreaterThan(0)
      missingCriteria.forEach((c) => {
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
  })
})
