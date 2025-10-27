/**
 * Sorting configuration migration system
 * Handles version-based migrations for sorting priority configurations
 */

import type { SortingPriorityConfig } from "~/types/sorting"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

// Current version of the sorting configuration schema
export const CURRENT_SORTING_CONFIG_VERSION = 1

/**
 * Check if a sorting config needs migration
 */
export function needsSortingConfigMigration(
  config: SortingPriorityConfig | undefined
): boolean {
  if (!config) return false
  const currentVersion = config.version ?? 0
  return currentVersion < CURRENT_SORTING_CONFIG_VERSION
}

/**
 * Get the version of a sorting configuration
 */
export function getSortingConfigVersion(
  config: SortingPriorityConfig | undefined
): number {
  return config?.version ?? 0
}

/**
 * Migrate sorting config to include new criteria
 * New criteria are added at the end with enabled: false by default
 */
export function migrateSortingConfig(
  config: SortingPriorityConfig | undefined
): SortingPriorityConfig {
  // If no config exists, return default
  if (!config) {
    return DEFAULT_SORTING_PRIORITY_CONFIG
  }

  const existingIds = new Set(config.criteria.map((c) => c.id))
  const allIds = new Set(DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => c.id))

  // Check if any new criteria are missing
  const missingIds = [...allIds].filter((id) => !existingIds.has(id))

  if (missingIds.length === 0) {
    // No new criteria to add, but update version if needed
    if (config.version !== CURRENT_SORTING_CONFIG_VERSION) {
      return {
        ...config,
        version: CURRENT_SORTING_CONFIG_VERSION,
        lastModified: Date.now()
      }
    }
    return config
  }

  // Add missing criteria with default values
  const newCriteria = [...config.criteria]
  const maxPriority = Math.max(...newCriteria.map((c) => c.priority), -1)

  missingIds.forEach((id, index) => {
    const defaultCriterion = DEFAULT_SORTING_PRIORITY_CONFIG.criteria.find(
      (c) => c.id === id
    )
    if (defaultCriterion) {
      newCriteria.push({
        ...defaultCriterion,
        priority: maxPriority + index + 1,
        enabled: false // Disable new criteria by default
      })
      console.log(
        `[SortingConfigMigration] Adding new criterion: ${id} with priority ${maxPriority + index + 1}, enabled: false`
      )
    }
  })

  const migratedConfig: SortingPriorityConfig = {
    ...config,
    criteria: newCriteria,
    version: CURRENT_SORTING_CONFIG_VERSION,
    lastModified: Date.now()
  }

  console.log(
    `[SortingConfigMigration] Migrated sorting config to v${CURRENT_SORTING_CONFIG_VERSION}, added ${missingIds.length} new criteria`
  )

  return migratedConfig
}
