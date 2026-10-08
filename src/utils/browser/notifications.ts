import { runBrowserAsyncApi } from "~/utils/browser/browserAsyncApi"
import { browserApiLogger as logger } from "~/utils/browser/browserEnvironment"
import {
  onPermissionsAdded,
  onPermissionsRemoved,
} from "~/utils/browser/permissions"
import { getErrorMessage } from "~/utils/core/error"

/**
 * Check whether the notifications API is available in this runtime.
 */
export function hasNotificationsAPI(): boolean {
  return !!browser.notifications
}

/**
 * Creates or replaces a browser notification. Returns the created id, or null
 * when notifications are unavailable or creation fails.
 */
export async function createNotification(
  notificationId: string,
  options: browser.notifications.CreateNotificationOptions,
): Promise<string | null> {
  if (!hasNotificationsAPI()) {
    logger.warn("Notifications API not supported")
    return null
  }

  try {
    return await runBrowserAsyncApi(
      () => browser.notifications.create(notificationId, options),
      (callback) =>
        (globalThis as any).chrome.notifications.create(
          notificationId,
          options,
          callback,
        ),
    )
  } catch (error) {
    logger.warn("notifications.create failed", {
      notificationId,
      error: getErrorMessage(error),
    })
    return null
  }
}

/**
 * Clears a browser notification. Returns false when unsupported or clearing
 * fails.
 */
export async function clearNotification(
  notificationId: string,
): Promise<boolean> {
  if (!hasNotificationsAPI()) {
    logger.warn("Notifications API not supported")
    return false
  }

  try {
    return (
      (await runBrowserAsyncApi(
        () => browser.notifications.clear(notificationId),
        (callback) =>
          (globalThis as any).chrome.notifications.clear(
            notificationId,
            callback,
          ),
      )) || false
    )
  } catch (error) {
    logger.warn("notifications.clear failed", {
      notificationId,
      error: getErrorMessage(error),
    })
    return false
  }
}

/**
 * Subscribes to notification clicks, including optional permission grants after
 * startup. Revocation detaches the old event before a later grant reattaches.
 */
export function onNotificationClicked(
  callback: (notificationId: string) => void | Promise<void>,
): () => void {
  type ClickEvent = {
    addListener: (listener: typeof callback) => void
    removeListener: (listener: typeof callback) => void
  }
  let subscribedEvent: ClickEvent | undefined

  const attach = () => {
    if (subscribedEvent) return
    const event = (globalThis as any).browser?.notifications?.onClicked
    if (
      typeof event?.addListener === "function" &&
      typeof event?.removeListener === "function"
    ) {
      event.addListener(callback)
      subscribedEvent = event
    }
  }
  const detach = () => {
    subscribedEvent?.removeListener(callback)
    subscribedEvent = undefined
  }

  const stopAdded = onPermissionsAdded((permissions) => {
    if (permissions.permissions?.includes("notifications")) attach()
  })
  const stopRemoved = onPermissionsRemoved((permissions) => {
    if (permissions.permissions?.includes("notifications")) detach()
  })
  attach()

  return () => {
    stopAdded()
    stopRemoved()
    detach()
  }
}
