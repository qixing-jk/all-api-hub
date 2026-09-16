/**
 * Health status utility functions for AccountManagement feature
 * This module encapsulates health status logic and provides i18n support
 */

import type { TFunction } from "i18next"

import { UI_CONSTANTS } from "~/constants/ui"

// Local configuration object for health status
const HEALTH_STATUS_CONFIG = {
  healthy: {
    color: UI_CONSTANTS.STYLES.STATUS_INDICATOR.HEALTHY,
  },
  error: {
    color: UI_CONSTANTS.STYLES.STATUS_INDICATOR.ERROR,
  },
  warning: {
    color: UI_CONSTANTS.STYLES.STATUS_INDICATOR.WARNING,
  },
  unknown: {
    color: UI_CONSTANTS.STYLES.STATUS_INDICATOR.UNKNOWN,
  },
} as const

/**
 * Get health status display information with internationalized text
 * @param status - The health status value
 * @param t - The translation function
 * @returns Object with text and color properties
 */
export function getHealthStatusDisplay(
  status: string | undefined,
  t: TFunction,
) {
  if (!status) {
    return {
      text: t("account:healthStatus.unknown"),
      color: HEALTH_STATUS_CONFIG.unknown.color,
    }
  }

  const config =
    HEALTH_STATUS_CONFIG[status as keyof typeof HEALTH_STATUS_CONFIG]
  if (!config) {
    return {
      text: t("account:healthStatus.unknown"),
      color: HEALTH_STATUS_CONFIG.unknown.color,
    }
  }

  const text = (() => {
    switch (status) {
      case "healthy":
        return t("account:healthStatus.healthy")
      case "warning":
        return t("account:healthStatus.warning")
      case "error":
        return t("account:healthStatus.error")
      case "unknown":
      default:
        return t("account:healthStatus.unknown")
    }
  })()

  return {
    text,
    color: config.color,
  }
}

/**
 * Get status indicator color class
 * @param status - The health status value
 * @returns Color class string
 */
export function getStatusIndicatorColor(status: string | undefined) {
  if (!status) {
    return HEALTH_STATUS_CONFIG.unknown.color
  }

  const config =
    HEALTH_STATUS_CONFIG[status as keyof typeof HEALTH_STATUS_CONFIG]
  return config?.color || HEALTH_STATUS_CONFIG.unknown.color
}
