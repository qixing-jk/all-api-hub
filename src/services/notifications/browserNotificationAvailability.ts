import {
  hasPermission,
  isPermissionDeclared,
  OPTIONAL_PERMISSION_IDS,
} from "~/services/permissions/permissionManager"
import {
  getNotificationPermissionLevel,
  hasNotificationsAPI,
  NOTIFICATION_PERMISSION_LEVELS,
} from "~/utils/browser/notifications"

export const BROWSER_NOTIFICATION_AVAILABILITY = {
  PermissionRequired: "permission_required",
  Unavailable: "unavailable",
  Blocked: "blocked",
  Available: "available",
  Unknown: "unknown",
} as const

export type BrowserNotificationAvailability =
  (typeof BROWSER_NOTIFICATION_AVAILABILITY)[keyof typeof BROWSER_NOTIFICATION_AVAILABILITY]

/** Permission and browser-level delivery state; OS focus/quiet settings remain unobservable. */
export async function getBrowserNotificationAvailability(): Promise<BrowserNotificationAvailability> {
  try {
    const permission = OPTIONAL_PERMISSION_IDS.Notifications
    if (!isPermissionDeclared(permission))
      return BROWSER_NOTIFICATION_AVAILABILITY.Unavailable
    if (!(await hasPermission(permission)))
      return BROWSER_NOTIFICATION_AVAILABILITY.PermissionRequired
    if (!hasNotificationsAPI())
      return BROWSER_NOTIFICATION_AVAILABILITY.Unavailable

    switch (await getNotificationPermissionLevel()) {
      // Firefox can create notifications after grant without a level-query API.
      case NOTIFICATION_PERMISSION_LEVELS.Unsupported:
      case NOTIFICATION_PERMISSION_LEVELS.Granted:
        return BROWSER_NOTIFICATION_AVAILABILITY.Available
      case NOTIFICATION_PERMISSION_LEVELS.Denied:
        return BROWSER_NOTIFICATION_AVAILABILITY.Blocked
      default:
        return BROWSER_NOTIFICATION_AVAILABILITY.Unknown
    }
  } catch {
    return BROWSER_NOTIFICATION_AVAILABILITY.Unknown
  }
}
