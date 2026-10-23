import {
  hasPermission,
  isPermissionDeclared,
  OPTIONAL_PERMISSION_IDS,
} from "~/services/permissions/permissionManager"
import {
  getNotificationPermissionLevel,
  hasNotificationsAPI,
} from "~/utils/browser/notifications"

export type BrowserNotificationAvailability =
  | "permission_required"
  | "unavailable"
  | "blocked"
  | "available"
  | "unknown"

/** Permission and browser-level delivery state; OS focus/quiet settings remain unobservable. */
export async function getBrowserNotificationAvailability(): Promise<BrowserNotificationAvailability> {
  try {
    if (!isPermissionDeclared(OPTIONAL_PERMISSION_IDS.Notifications))
      return "unavailable"
    if (!(await hasPermission(OPTIONAL_PERMISSION_IDS.Notifications)))
      return "permission_required"
    if (!hasNotificationsAPI()) return "unavailable"
    const level = await getNotificationPermissionLevel()
    return level === "granted"
      ? "available"
      : level === "denied"
        ? "blocked"
        : "unknown"
  } catch {
    return "unknown"
  }
}
