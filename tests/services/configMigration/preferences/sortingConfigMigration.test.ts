import { describe, expect, it } from "vitest"

import {
  migrateSortingConfig,
  needsSortingConfigMigration,
} from "~/services/preferences/migrations/sortingConfigMigration"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/services/preferences/utils/sortingPriority"
import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"

function config(
  criteria: SortingPriorityConfig["criteria"],
): SortingPriorityConfig {
  return { criteria, lastModified: 1 }
}

describe("sortingConfigMigration", () => {
  it("requires migration when the config is absent or contains removed criteria", () => {
    expect(needsSortingConfigMigration(undefined)).toBe(true)
    expect(
      needsSortingConfigMigration(
        config([
          ...DEFAULT_SORTING_PRIORITY_CONFIG.criteria,
          {
            id: SortingCriteriaType.PINNED,
            enabled: true,
            priority: 5,
          },
        ]),
      ),
    ).toBe(true)
  })

  it("does not migrate the current four-criterion config", () => {
    expect(needsSortingConfigMigration(DEFAULT_SORTING_PRIORITY_CONFIG)).toBe(
      false,
    )
    expect(migrateSortingConfig(DEFAULT_SORTING_PRIORITY_CONFIG)).toBe(
      DEFAULT_SORTING_PRIORITY_CONFIG,
    )
  })

  it("returns a fresh default config when input is absent", () => {
    const migrated = migrateSortingConfig(undefined)

    expect(migrated).not.toBe(DEFAULT_SORTING_PRIORITY_CONFIG)
    expect(migrated.criteria).not.toBe(DEFAULT_SORTING_PRIORITY_CONFIG.criteria)
    expect(migrated.criteria).toEqual(DEFAULT_SORTING_PRIORITY_CONFIG.criteria)
  })

  it("removes fixed and moved criteria while preserving automatic choices", () => {
    const migrated = migrateSortingConfig(
      config([
        {
          id: SortingCriteriaType.PINNED,
          enabled: false,
          priority: 0,
        },
        {
          id: SortingCriteriaType.MATCHED_OPEN_TABS,
          enabled: false,
          priority: 1,
        },
        {
          id: SortingCriteriaType.CHECK_IN_REQUIREMENT,
          enabled: true,
          priority: 2,
        },
        {
          id: SortingCriteriaType.HEALTH_STATUS,
          enabled: true,
          priority: 2.5,
        },
        {
          id: SortingCriteriaType.CUSTOM_REDEEM_URL,
          enabled: true,
          priority: 3,
        },
        {
          id: SortingCriteriaType.DISABLED_ACCOUNT,
          enabled: false,
          priority: 4,
        },
        {
          id: SortingCriteriaType.USER_SORT_FIELD,
          enabled: true,
          priority: 5,
        },
        {
          id: SortingCriteriaType.MANUAL_ORDER,
          enabled: true,
          priority: 6,
        },
      ]),
    )

    expect(migrated.criteria.map(({ id }) => id)).toEqual([
      SortingCriteriaType.MATCHED_OPEN_TABS,
      SortingCriteriaType.CUSTOM_REDEEM_URL,
      SortingCriteriaType.CUSTOM_CHECK_IN_URL,
      SortingCriteriaType.CURRENT_SITE,
    ])
    expect(migrated.criteria[0].enabled).toBe(false)
    expect(migrated.criteria.map(({ priority }) => priority)).toEqual([
      0, 1, 2, 3,
    ])
  })

  it("appends missing automatic criteria and removes duplicates", () => {
    const migrated = migrateSortingConfig(
      config([
        {
          id: SortingCriteriaType.CUSTOM_REDEEM_URL,
          enabled: false,
          priority: 2,
        },
        {
          id: SortingCriteriaType.CUSTOM_REDEEM_URL,
          enabled: true,
          priority: 0,
        },
      ]),
    )

    expect(migrated.criteria.map(({ id }) => id)).toEqual([
      SortingCriteriaType.CUSTOM_REDEEM_URL,
      SortingCriteriaType.CUSTOM_CHECK_IN_URL,
      SortingCriteriaType.CURRENT_SITE,
      SortingCriteriaType.MATCHED_OPEN_TABS,
    ])
    expect(migrated.criteria[0].enabled).toBe(true)
  })

  it("removes a duplicate even when every current criterion is present", () => {
    const migrated = migrateSortingConfig(
      config([
        ...DEFAULT_SORTING_PRIORITY_CONFIG.criteria,
        {
          ...DEFAULT_SORTING_PRIORITY_CONFIG.criteria[0],
          priority: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.length,
        },
      ]),
    )

    expect(migrated.criteria).toHaveLength(
      DEFAULT_SORTING_PRIORITY_CONFIG.criteria.length,
    )
    expect(new Set(migrated.criteria.map(({ id }) => id)).size).toBe(
      DEFAULT_SORTING_PRIORITY_CONFIG.criteria.length,
    )
  })
})
