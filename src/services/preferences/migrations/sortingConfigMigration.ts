/**
 * Sorting configuration migration system
 * Handles version-based migrations for sorting priority configurations
 */

import {
  CONFIGURABLE_SORTING_CRITERIA,
  createDefaultSortingPriorityConfig,
  DEFAULT_SORTING_PRIORITY_CONFIG,
} from "~/services/preferences/utils/sortingPriority"
import type {
  SortingCriteriaType,
  SortingPriorityConfig,
} from "~/types/sorting"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("SortingConfigMigration")

const CONFIGURABLE_SORTING_CRITERIA_SET = new Set<SortingCriteriaType>(
  CONFIGURABLE_SORTING_CRITERIA,
)

/**
 * Check if a sorting config needs migration
 */
export function needsSortingConfigMigration(
  config: SortingPriorityConfig | undefined,
): boolean {
  if (!config) return true
  if (
    config.criteria.length !== DEFAULT_SORTING_PRIORITY_CONFIG.criteria.length
  ) {
    return true
  }
  const src = new Set(config.criteria.map((c) => c.id))
  const dst = new Set(DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => c.id))
  if (src.size !== dst.size) return true
  for (const id of dst) if (!src.has(id)) return true
  const priorities = [...config.criteria]
    .sort((a, b) => a.priority - b.priority)
    .map((criterion) => criterion.priority)
  if (priorities.some((priority, index) => priority !== index)) return true
  return false
}

/**
 * Keeps only automatic criteria, preserves the user's relative order and
 * enabled choices, and fills any newly introduced automatic criteria.
 */
export function migrateSortingConfig(
  config: SortingPriorityConfig | undefined,
): SortingPriorityConfig {
  // If no config exists, return default
  if (!config) {
    return createDefaultSortingPriorityConfig()
  }
  // If no migration is needed, return the config as is
  if (!needsSortingConfigMigration(config)) {
    return config
  }

  const seenIds = new Set<SortingCriteriaType>()
  const preservedCriteria = [...config.criteria]
    .sort((a, b) => a.priority - b.priority)
    .filter((criterion) => {
      if (
        !CONFIGURABLE_SORTING_CRITERIA_SET.has(criterion.id) ||
        seenIds.has(criterion.id)
      ) {
        return false
      }
      seenIds.add(criterion.id)
      return true
    })

  const missingCriteria = DEFAULT_SORTING_PRIORITY_CONFIG.criteria.filter(
    (criterion) => !seenIds.has(criterion.id),
  )
  const normalizedCriteria = [...preservedCriteria, ...missingCriteria].map(
    (criterion, priority) => ({
      ...criterion,
      priority,
    }),
  )

  const migratedConfig: SortingPriorityConfig = {
    ...config,
    criteria: normalizedCriteria,
    lastModified: Date.now(),
  }

  logger.debug("Migrated sorting config", {
    addedCriteriaCount: missingCriteria.length,
    removedCriteriaCount: config.criteria.length - preservedCriteria.length,
  })

  return migratedConfig
}
