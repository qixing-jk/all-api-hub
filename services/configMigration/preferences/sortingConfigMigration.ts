/**
 * Sorting configuration migration system
 * Handles version-based migrations for sorting priority configurations
 */

import {
  SortingCriteriaType,
  type SortingPriorityConfig
} from "~/types/sorting.ts"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority.ts"

/**
 * Check if a sorting config needs migration
 */
export function needsSortingConfigMigration(
  config: SortingPriorityConfig | undefined
): boolean {
  if (!config) return true
  const src = new Set(config.criteria.map((c) => c.id))
  const dst = new Set(DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => c.id))
  if (src.size !== dst.size) return true
  for (const id of dst) if (!src.has(id)) return true
  return false
}

/**
 * Migrate sorting config to include new criteria
 * Pinned accounts are added with the highest priority by default
 */
export function migrateSortingConfig(
  config: SortingPriorityConfig | undefined
): SortingPriorityConfig {
  // If no config exists, return default
  if (!config) {
    return {
      ...DEFAULT_SORTING_PRIORITY_CONFIG,
      criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => ({ ...c })),
      lastModified: Date.now()
    }
  }
  // If no migration is needed, return the config as is
  if (!needsSortingConfigMigration(config)) {
    return config
  }

  const existingIds = new Set(config.criteria.map((c) => c.id))
  const allIds = new Set(
    DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => c.id)
  )

  let modified = false
  const newCriteria = [...config.criteria]

  if (!existingIds.has(SortingCriteriaType.PINNED)) {
    const pinnedDefault = DEFAULT_SORTING_PRIORITY_CONFIG.criteria.find(
      (c) => c.id === SortingCriteriaType.PINNED
    )
    if (pinnedDefault) {
      newCriteria.push({
        ...pinnedDefault,
        enabled: true
      })
      modified = true
      console.log(
        "[SortingConfigMigration] Added PINNED criterion with default priority"
      )
    }
  }

  const missingIds = [...allIds].filter((id) => !existingIds.has(id))

  const filteredMissing = missingIds.filter(
    (id) => id !== SortingCriteriaType.PINNED
  )

  if (filteredMissing.length > 0) {
    const maxPriority = Math.max(...newCriteria.map((c) => c.priority), -1)
    filteredMissing.forEach((id, index) => {
      const defaultCriterion = DEFAULT_SORTING_PRIORITY_CONFIG.criteria.find(
        (c) => c.id === id
      )
      if (defaultCriterion) {
        newCriteria.push({
          ...defaultCriterion,
          priority: maxPriority + index + 1,
          // Default to disabled for new criteria
          enabled: false
        })
        modified = true
        console.log(
          `[SortingConfigMigration] Adding new criterion: ${id} with priority ${maxPriority + index + 1}, enabled: false`
        )
      }
    })
  }

  if (!modified) {
    return config
  }

  const normalizedCriteria = newCriteria
    .sort((a, b) => {
      if (a.id === SortingCriteriaType.CURRENT_SITE) return -1
      if (b.id === SortingCriteriaType.CURRENT_SITE) return 1

      if (a.id === SortingCriteriaType.PINNED) return -1
      if (b.id === SortingCriteriaType.PINNED) return 1
      return a.priority - b.priority
    })
    .map((item, index) => ({
      ...item,
      priority: index
    }))

  const migratedConfig: SortingPriorityConfig = {
    ...config,
    criteria: normalizedCriteria,
    lastModified: Date.now()
  }

  console.log(
    `[SortingConfigMigration] Migrated sorting config, added ${missingIds.length} new criteria`
  )

  return migratedConfig
}
