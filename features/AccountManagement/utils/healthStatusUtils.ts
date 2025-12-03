/**
 * Health status utility functions for AccountManagement feature
 * This module encapsulates health status logic and provides i18n support
 */

// Local configuration object for health status
const HEALTH_STATUS_CONFIG = {
  healthy: {
    color: "bg-green-500",
  },
  error: {
    color: "bg-red-500",
  },
  warning: {
    color: "bg-yellow-500",
  },
  unknown: {
    color: "bg-gray-400",
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
  t: (key: string) => string,
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

  return {
    text: t(`account:healthStatus.${status}`),
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
