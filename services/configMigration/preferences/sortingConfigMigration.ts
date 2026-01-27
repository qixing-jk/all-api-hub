/**
 * Sorting configuration migration system
 * Handles version-based migrations for sorting priority configurations
 */

import {
  SortingCriteriaType,
  type SortingPriorityConfig,
} from "~/types/sorting"
import { createLogger } from "~/utils/logger"
import { DEFAULT_SORTING_PRIORITY_CONFIG } from "~/utils/sortingPriority"

const logger = createLogger("SortingConfigMigration")

/**
 * Check if a sorting config needs migration
 */
export function needsSortingConfigMigration(
  config: SortingPriorityConfig | undefined,
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
  config: SortingPriorityConfig | undefined,
): SortingPriorityConfig {
  // If no config exists, return default
  if (!config) {
    return {
      ...DEFAULT_SORTING_PRIORITY_CONFIG,
      criteria: DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => ({ ...c })),
      lastModified: Date.now(),
    }
  }
  // If no migration is needed, return the config as is
  if (!needsSortingConfigMigration(config)) {
    return config
  }

  const existingIds = new Set(config.criteria.map((c) => c.id))
  const allIds = new Set(
    DEFAULT_SORTING_PRIORITY_CONFIG.criteria.map((c) => c.id),
  )

  let modified = false
  const newCriteria = [...config.criteria]

  // Safety rule: keep disabled accounts at the bottom by default.
  // This criterion should be enabled when introduced so existing users get the expected behavior.
  if (!existingIds.has(SortingCriteriaType.DISABLED_ACCOUNT)) {
    const disabledDefault = DEFAULT_SORTING_PRIORITY_CONFIG.criteria.find(
      (c) => c.id === SortingCriteriaType.DISABLED_ACCOUNT,
    )
    if (disabledDefault) {
      newCriteria.push({
        ...disabledDefault,
        enabled: true,
      })
      modified = true
      logger.debug("Added DISABLED_ACCOUNT criterion with default priority")
    }
  }

  if (!existingIds.has(SortingCriteriaType.PINNED)) {
    const pinnedDefault = DEFAULT_SORTING_PRIORITY_CONFIG.criteria.find(
      (c) => c.id === SortingCriteriaType.PINNED,
    )
    if (pinnedDefault) {
      newCriteria.push({
        ...pinnedDefault,
        enabled: true,
      })
      modified = true
      logger.debug("Added PINNED criterion with default priority")
    }
  }

  const currentIds = new Set(newCriteria.map((c) => c.id))
  const missingIds = [...allIds].filter((id) => !currentIds.has(id))

  // Special handling: ensure MANUAL_ORDER exists and is enabled.
  // Its relative ordering (after CURRENT_SITE and PINNED) is handled
  // centrally in the normalization sort, so we can keep its default
  // priority here.
  if (missingIds.includes(SortingCriteriaType.MANUAL_ORDER)) {
    const manualDefault = DEFAULT_SORTING_PRIORITY_CONFIG.criteria.find(
      (c) => c.id === SortingCriteriaType.MANUAL_ORDER,
    )
    if (manualDefault) {
      newCriteria.push({
        ...manualDefault,
        enabled: true,
      })
      modified = true
      logger.debug("Added MANUAL_ORDER criterion with default priority", {
        priority: manualDefault.priority,
      })
    }
  }

  // Handle remaining missing criteria (excluding PINNED and MANUAL_ORDER)
  const remainingMissing = missingIds.filter(
    (id) =>
      id !== SortingCriteriaType.DISABLED_ACCOUNT &&
      id !== SortingCriteriaType.PINNED &&
      id !== SortingCriteriaType.MANUAL_ORDER,
  )

  if (remainingMissing.length > 0) {
    const maxPriority = Math.max(...newCriteria.map((c) => c.priority), -1)
    remainingMissing.forEach((id, index) => {
      const defaultCriterion = DEFAULT_SORTING_PRIORITY_CONFIG.criteria.find(
        (c) => c.id === id,
      )
      if (defaultCriterion) {
        const priority = maxPriority + index + 1
        newCriteria.push({
          ...defaultCriterion,
          priority,
          // Default to disabled for new criteria introduced after initial release
          enabled: false,
        })
        modified = true
        logger.debug("Adding new criterion", { id, priority, enabled: false })
      }
    })
  }

  if (!modified) {
    return config
  }

  const normalizedCriteria = newCriteria
    .sort((a, b) => {
      const getGroupRank = (id: SortingCriteriaType): number => {
        switch (id) {
          case SortingCriteriaType.DISABLED_ACCOUNT:
            return -1
          case SortingCriteriaType.CURRENT_SITE:
            return 0
          case SortingCriteriaType.PINNED:
            return 1
          case SortingCriteriaType.MANUAL_ORDER:
            return 2
          default:
            return 3
        }
      }

      const rankA = getGroupRank(a.id)
      const rankB = getGroupRank(b.id)
      if (rankA !== rankB) return rankA - rankB
      return a.priority - b.priority
    })
    .map((item, index) => ({
      ...item,
      priority: index,
    }))

  const migratedConfig: SortingPriorityConfig = {
    ...config,
    criteria: normalizedCriteria,
    lastModified: Date.now(),
  }

  logger.debug("Migrated sorting config", {
    addedCriteriaCount: missingIds.length,
  })

  return migratedConfig
}
